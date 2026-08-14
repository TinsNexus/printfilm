from pathlib import Path
import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text

from app.api import auth, billing, projects, templates, tools
from app.api.admin import router as admin_router
from app.api.drama import router as drama_router
from app.config import get_settings
from app.database import AsyncSessionLocal, engine, init_db
from app.logging_setup import configure_logging
from app.models import Template, User
from app.services.templates_seed import TEMPLATES

settings = get_settings()
# 业务日志 INFO；DEBUG=true 不再把根日志打成 DEBUG（避免 aiosqlite 刷屏）
configure_logging(level="INFO", sql_echo=settings.sql_echo)
logger = logging.getLogger("app.http")

app = FastAPI(title=settings.app_name, version="0.2.0")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
# Allow LAN devices (phone/tablet) hitting Vite on private IPs
_LAN_ORIGIN_RE = (
    r"https?://("
    r"localhost|127\.0\.0\.1|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
    r")(:\d+)?"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_origin_regex=_LAN_ORIGIN_RE,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    # 业务可读请求日志（跳过静态资源；高频轮询默认不打）
    path = request.url.path
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    if path.startswith("/static"):
        return response
    # 高频轮询：成功且较快时静默，避免淹没业务日志
    is_poll = (
        path.endswith("/generate_status")
        or (request.method == "GET" and path.startswith("/api/drama/scripts/"))
        or (request.method == "GET" and path.startswith("/api/drama/assets"))
        or (request.method == "GET" and path.startswith("/api/projects/") and path.count("/") == 3)
        or (request.method == "GET" and "/api/tools/tasks/" in path)
    )
    msg = f"{request.method} {path} → {response.status_code} ({elapsed_ms:.0f}ms)"
    if response.status_code >= 400:
        logger.warning(msg)
    elif is_poll and elapsed_ms < 800:
        return response
    else:
        logger.info(msg)
    return response

static_dir = Path(__file__).resolve().parent.parent / "static"
static_dir.mkdir(parents=True, exist_ok=True)
(static_dir / "templates").mkdir(exist_ok=True)
(static_dir / "mock").mkdir(exist_ok=True)
(static_dir / "generated").mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

app.include_router(auth.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(billing.router, prefix="/api")
app.include_router(tools.router, prefix="/api")
app.include_router(drama_router, prefix="/api")
app.include_router(admin_router, prefix="/api")


@app.on_event("startup")
async def on_startup() -> None:
    await init_db()
    await _migrate_sqlite()
    await seed_templates()
    await bootstrap_admins()
    await seed_agent_skills()
    try:
        from app.services import oss as oss_svc

        oss_svc.ensure_browser_cors()
    except Exception:  # noqa: BLE001
        pass


async def _migrate_sqlite() -> None:
    """Lightweight additive migrations (SQLite + Postgres)."""
    is_sqlite = settings.database_url.startswith("sqlite")
    async with engine.begin() as conn:
        if is_sqlite:
            result = await conn.execute(text("PRAGMA table_info(shots)"))
            cols = {row[1] for row in result.fetchall()}
            if "image_ark_url" not in cols:
                await conn.execute(text("ALTER TABLE shots ADD COLUMN image_ark_url VARCHAR(1024)"))
            if "overlay_title" not in cols:
                await conn.execute(text("ALTER TABLE shots ADD COLUMN overlay_title VARCHAR(128) DEFAULT ''"))
            if "overlay_subtitle" not in cols:
                await conn.execute(text("ALTER TABLE shots ADD COLUMN overlay_subtitle VARCHAR(256) DEFAULT ''"))
            if "segment_script" not in cols:
                await conn.execute(text("ALTER TABLE shots ADD COLUMN segment_script TEXT DEFAULT ''"))

            result = await conn.execute(text("PRAGMA table_info(projects)"))
            pcols = {row[1] for row in result.fetchall()}
        else:
            result = await conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'shots'"
                )
            )
            scols = {row[0] for row in result.fetchall()}
            if "segment_script" not in scols:
                await conn.execute(text("ALTER TABLE shots ADD COLUMN segment_script TEXT DEFAULT ''"))

            result = await conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'projects'"
                )
            )
            pcols = {row[0] for row in result.fetchall()}

        if "pipeline_mode" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN pipeline_mode VARCHAR(32) DEFAULT 'full'"))
        if "output_ratio" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN output_ratio VARCHAR(16) DEFAULT ''"))
        if "voice_id" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN voice_id VARCHAR(128) DEFAULT ''"))
        if "character_bible" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN character_bible TEXT DEFAULT ''"))
        if "bgm_lock" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN bgm_lock TEXT DEFAULT ''"))
        if "style_prompt" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN style_prompt TEXT DEFAULT ''"))
        if "character_prompt" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN character_prompt TEXT DEFAULT ''"))
        if "extra_prompt" not in pcols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN extra_prompt TEXT DEFAULT ''"))

        # User billing columns
        if is_sqlite:
            result = await conn.execute(text("PRAGMA table_info(users)"))
            ucols = {row[1] for row in result.fetchall()}
        else:
            result = await conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'users'"
                )
            )
            ucols = {row[0] for row in result.fetchall()}
        if "balance_fen" not in ucols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN balance_fen INTEGER DEFAULT 0"))
        if "frozen_fen" not in ucols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN frozen_fen INTEGER DEFAULT 0"))
        if "plan" not in ucols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN plan VARCHAR(32) DEFAULT 'free'"))
        if "billing_unlimited" not in ucols:
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN billing_unlimited BOOLEAN DEFAULT FALSE")
            )
        if "role" not in ucols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(16) DEFAULT 'user'"))

        # UsageEvent.drama_project_id for drama module billing
        if is_sqlite:
            result = await conn.execute(text("PRAGMA table_info(usage_events)"))
            uecols = {row[1] for row in result.fetchall()}
        else:
            result = await conn.execute(
                text(
                    "SELECT column_name FROM information_schema.columns "
                    "WHERE table_name = 'usage_events'"
                )
            )
            uecols = {row[0] for row in result.fetchall()}
        if "drama_project_id" not in uecols:
            await conn.execute(text("ALTER TABLE usage_events ADD COLUMN drama_project_id INTEGER"))


async def bootstrap_admins() -> None:
    # Promote matching emails to admin (does not create users)
    raw = (settings.admin_bootstrap_emails or "").strip()
    if not raw:
        return
    emails = [e.strip().lower() for e in raw.split(",") if e.strip()]
    if not emails:
        return
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.email.in_(emails)))
        users = list(result.scalars().all())
        changed = False
        for user in users:
            if (user.role or "user") != "admin":
                user.role = "admin"
                changed = True
        if changed:
            await db.commit()


async def seed_agent_skills() -> None:
    """启动时把内置导演 Skill 同步进数据库。"""
    from app.services.agent.store import seed_builtin_skills

    async with AsyncSessionLocal() as db:
        await seed_builtin_skills(db)


async def seed_templates() -> None:
    """Upsert built-in templates; publish cover images to OSS when enabled."""
    import logging

    from app.services import storage

    log = logging.getLogger("app.seed")
    async with AsyncSessionLocal() as db:
        for item in TEMPLATES:
            data = dict(item)
            existing = await db.get(Template, data["id"])
            cover = (data.get("preview_cover") or "").strip()
            # Skip re-upload when DB already has a public URL (avoids blocking API startup).
            if (
                existing
                and (existing.preview_cover or "").startswith(("http://", "https://"))
                and cover.startswith("/static/")
            ):
                data["preview_cover"] = existing.preview_cover
            elif cover.startswith("/static/"):
                local = storage.STATIC_ROOT / cover.removeprefix("/static/")
                if local.is_file():
                    try:
                        data["preview_cover"] = storage.publish_local(local, sync=True)
                    except Exception:  # noqa: BLE001
                        log.exception("template cover OSS publish failed: %s", local)
                else:
                    log.warning("template cover missing on disk: %s", local)
            if existing:
                for k, v in data.items():
                    setattr(existing, k, v)
            else:
                db.add(Template(**data))
        await db.commit()
        result = await db.execute(select(Template))
        _ = result.scalars().all()


@app.get("/api/health")
async def health() -> dict:
    from app.config import reload_settings

    s = reload_settings()
    redis_ok = False
    queue_pending = None
    queue_unacked = None
    try:
        import redis

        r = redis.Redis.from_url(
            s.redis_url, decode_responses=True, socket_connect_timeout=2, socket_timeout=2
        )
        redis_ok = bool(r.ping())
        if redis_ok:
            q = (s.celery_autoscale_queue or "pipeline").strip() or "pipeline"
            queue_pending = int(r.llen(q) or 0)
            try:
                queue_unacked = int(r.hlen("unacked") or 0)
            except Exception:  # noqa: BLE001
                queue_unacked = None
    except Exception:  # noqa: BLE001
        redis_ok = False
    return {
        "ok": True,
        "ark_mock": s.ark_mock,
        "use_celery": s.use_celery,
        "redis_ok": redis_ok,
        "queue": {"name": s.celery_autoscale_queue, "pending": queue_pending, "unacked": queue_unacked},
        "autoscale": {
            "min": s.celery_autoscale_min,
            "max": s.celery_autoscale_max,
            "poll_sec": s.celery_autoscale_poll_sec,
            "idle_sec": s.celery_autoscale_idle_sec,
        },
        "models": {
            "llm": s.model_llm,
            "image": s.model_image,
            "video": s.model_video,
            "audio": s.model_audio,
        },
        "quality": {
            "image_size": s.ark_image_size,
            "video_resolution": s.ark_video_resolution,
        },
        "app": s.app_name,
    }
