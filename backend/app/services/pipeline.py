"""Pipeline orchestration — stages shared by in-process and Celery runners."""

from __future__ import annotations

import asyncio
import logging
import shutil

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import PipelineJob, Project, ProjectStatus, Shot, ShotStatus
from app.services.ark import get_ark
from app.services.ffmpeg_compose import ComposeOptions, ShotMedia, compose_project, is_near_silent_audio, probe_duration
from app.services.progress import publish_progress
from app.services import storage
from app.services.style_lock import (
    build_locked_image_prompt,
    merge_negative,
    seedream_ref_urls,
    strip_lock_blocks,
)
from app.services.voices import resolve_speaker

logger = logging.getLogger(__name__)

_running: dict[int, asyncio.Task] = {}
_cancelled: set[int] = set()
_celery_task_ids: dict[int, str] = {}

# Seedream min pixels ~3686400; portrait 9:16 ≈ 1440x2560
_IMAGE_SIZE_BY_RATIO = {
    "9:16": "1440x2560",
    "16:9": "2560x1440",
    "1:1": "1920x1920",
}

IMAGE_TEXT_DURATION_MIN = 4
IMAGE_TEXT_DURATION_MAX = 12


class PipelineCancelled(Exception):
    """Raised when user cancels a running pipeline."""


def start_pipeline(project_id: int) -> str:
    """Dispatch to Celery when enabled+Redis up; else in-process asyncio."""
    _cancelled.discard(project_id)
    settings = get_settings()
    if settings.use_celery and _redis_ok():
        from app.workers.tasks import run_pipeline_task

        async_result = run_pipeline_task.apply_async(args=[project_id], queue="pipeline")
        task_id = str(async_result.id)
        _celery_task_ids[project_id] = task_id
        return task_id

    if project_id in _running and not _running[project_id].done():
        return "in-process"
    _running[project_id] = asyncio.create_task(run_pipeline(project_id))
    return "in-process"


def cancel_pipeline(project_id: int) -> bool:
    """Request cancel; best-effort stop in-process task / Celery worker."""
    _cancelled.add(project_id)
    stopped = False

    task = _running.get(project_id)
    if task and not task.done():
        task.cancel()
        stopped = True

    celery_id = _celery_task_ids.pop(project_id, None)
    if celery_id and celery_id != "in-process":
        try:
            from app.workers.celery_app import celery_app

            celery_app.control.revoke(celery_id, terminate=True, signal="SIGTERM")
            stopped = True
        except Exception:  # noqa: BLE001
            logger.warning("celery revoke failed project=%s task=%s", project_id, celery_id)

    return stopped


def is_cancelled(project_id: int) -> bool:
    return project_id in _cancelled


def _redis_ok() -> bool:
    try:
        import redis

        r = redis.Redis.from_url(
            get_settings().redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
        return bool(r.ping())
    except Exception:  # noqa: BLE001
        return False


def _is_image_text(project: Project) -> bool:
    return (project.pipeline_mode or "full") == "image_text"


def _project_voice(project: Project) -> str:
    tpl_preset = ""
    if project.template and project.template.audio_config:
        tpl_preset = str(project.template.audio_config.get("voice_preset") or "")
    return resolve_speaker(getattr(project, "voice_id", None) or "", template_preset=tpl_preset)


def clamp_shot_duration(duration: float, *, pipeline_mode: str, tpl_min: int, tpl_max: int) -> float:
    settings = get_settings()
    if pipeline_mode == "image_text":
        lo = IMAGE_TEXT_DURATION_MIN
        hi = IMAGE_TEXT_DURATION_MAX
    else:
        lo = max(1, tpl_min)
        hi = min(max(tpl_max, lo), settings.max_shot_duration)
    return float(max(lo, min(float(duration), hi)))


async def _ensure_not_cancelled(project_id: int) -> None:
    if is_cancelled(project_id):
        raise PipelineCancelled(f"project {project_id} cancelled")
    # Cross-process (Celery worker): cancel API writes CANCELLED to DB
    async with AsyncSessionLocal() as db:
        project = await db.get(Project, project_id)
        if project and project.status == ProjectStatus.CANCELLED:
            _cancelled.add(project_id)
            raise PipelineCancelled(f"project {project_id} cancelled")


async def _resume_plan(project_id: int) -> tuple[bool, bool, bool, bool]:
    """Return (image_text, skip_script, skip_assets, skip_videos).

    When shots already have images (+ audio / videos as needed), resume from
    the next unfinished stage instead of wiping the storyboard.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.shots))
        )
        project = result.scalar_one_or_none()
        if not project or not project.shots:
            return False, False, False, False
        image_text = _is_image_text(project)
        shots = list(project.shots)
        has_images = all(bool(s.image_url or s.image_ark_url) for s in shots)

        def _audio_ok(shot: Shot) -> bool:
            if not shot.audio_url:
                return False
            path = storage.local_path_from_url(shot.audio_url)
            if not path or not path.exists():
                return False
            return not is_near_silent_audio(path)

        has_audio = all(_audio_ok(s) for s in shots)
        has_videos = all(bool(s.video_url) for s in shots)
        # Keep existing storyboard if any media already exists
        skip_script = any(bool(s.image_url or s.audio_url or s.video_url) for s in shots)
        skip_assets = has_images and has_audio
        skip_videos = image_text or has_videos
        return image_text, skip_script, skip_assets, skip_videos


async def run_pipeline(project_id: int) -> None:
    try:
        await _ensure_not_cancelled(project_id)
        image_text, skip_script, skip_assets, skip_videos = await _resume_plan(project_id)

        if not skip_script:
            await _script_stage(project_id)
            await _ensure_not_cancelled(project_id)
            image_text, skip_script, skip_assets, skip_videos = await _resume_plan(project_id)
        else:
            logger.info(
                "pipeline resume project=%s skip_script=%s skip_assets=%s skip_videos=%s",
                project_id,
                skip_script,
                skip_assets,
                skip_videos,
            )
            await publish_progress(
                project_id,
                {
                    "event": "progress",
                    "stage": "RESUME",
                    "percent": 70 if skip_assets else 18,
                    "message": "沿用已有分镜，继续后续阶段",
                },
            )

        # 分镜图 + 配音并行；完整模式再并行图生视频
        if not skip_assets:
            await _parallel_image_and_audio(project_id)
            await _ensure_not_cancelled(project_id)
        else:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Project)
                    .where(Project.id == project_id)
                    .options(selectinload(Project.shots))
                )
                project = result.scalar_one()
                if project.shots:
                    project.cover_url = sorted(project.shots, key=lambda s: s.shot_no)[0].image_url
                project.status = ProjectStatus.IMAGE_READY
                project.progress = 70 if image_text else 50
                await db.commit()
            await publish_progress(
                project_id,
                {
                    "event": "progress",
                    "stage": "ASSETS_READY",
                    "percent": 70 if image_text else 50,
                    "message": "沿用已有分镜图与配音，开始合成",
                },
            )

        if not image_text and not skip_videos:
            await _parallel_videos(project_id)
            await _ensure_not_cancelled(project_id)

        await _compose_stage(project_id)

        if is_cancelled(project_id):
            raise PipelineCancelled(f"project {project_id} cancelled")

        async with AsyncSessionLocal() as db:
            project = await db.get(Project, project_id)
            if project:
                if project.status == ProjectStatus.CANCELLED:
                    raise PipelineCancelled(f"project {project_id} cancelled")
                project.status = ProjectStatus.DONE
                project.progress = 100
                project.error_msg = None
                await db.commit()
        await publish_progress(
            project_id,
            {"event": "done", "percent": 100, "video_url": await _final_url(project_id)},
        )
    except (PipelineCancelled, asyncio.CancelledError):
        logger.info("pipeline cancelled project=%s", project_id)
        async with AsyncSessionLocal() as db:
            project = await db.get(Project, project_id)
            if project and project.status != ProjectStatus.DONE:
                project.status = ProjectStatus.CANCELLED
                project.error_msg = "用户取消"
                await db.commit()
        await publish_progress(
            project_id,
            {
                "event": "failed",
                "stage": "CANCELLED",
                "message": "用户取消",
                "retryable": True,
                "code": "CANCELLED",
            },
        )
    except Exception as exc:  # noqa: BLE001
        if is_cancelled(project_id):
            logger.info("pipeline cancelled (during error) project=%s", project_id)
            async with AsyncSessionLocal() as db:
                project = await db.get(Project, project_id)
                if project and project.status != ProjectStatus.DONE:
                    project.status = ProjectStatus.CANCELLED
                    project.error_msg = "用户取消"
                    await db.commit()
            await publish_progress(
                project_id,
                {
                    "event": "failed",
                    "stage": "CANCELLED",
                    "message": "用户取消",
                    "retryable": True,
                    "code": "CANCELLED",
                },
            )
            return
        logger.exception("pipeline failed project=%s", project_id)
        async with AsyncSessionLocal() as db:
            project = await db.get(Project, project_id)
            if project:
                project.status = ProjectStatus.FAILED
                project.error_msg = str(exc)[:2000]
                await db.commit()
        await publish_progress(
            project_id,
            {
                "event": "failed",
                "stage": "PIPELINE",
                "message": str(exc),
                "retryable": True,
                "code": "PIPELINE_ERROR",
            },
        )
        raise
    finally:
        _cancelled.discard(project_id)
        _celery_task_ids.pop(project_id, None)
        _running.pop(project_id, None)


async def delete_project_assets(project_id: int) -> None:
    pdir = storage.GENERATED_ROOT / f"p{project_id}"
    if pdir.exists():
        shutil.rmtree(pdir, ignore_errors=True)


async def _final_url(project_id: int) -> str | None:
    async with AsyncSessionLocal() as db:
        project = await db.get(Project, project_id)
        return project.final_video_url if project else None


async def _set_status(project_id: int, status: str, progress: int, stage: str) -> None:
    await _ensure_not_cancelled(project_id)
    async with AsyncSessionLocal() as db:
        project = await db.get(Project, project_id)
        if not project:
            return
        project.status = status
        project.progress = progress
        db.add(PipelineJob(project_id=project_id, stage=stage, progress=progress))
        await db.commit()
    await publish_progress(project_id, {"event": "progress", "stage": stage, "percent": progress})


async def _script_stage(project_id: int) -> None:
    await _set_status(project_id, ProjectStatus.SCRIPTING, 5, "SCRIPTING")
    ark = get_ark()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.template), selectinload(Project.shots))
        )
        project = result.scalar_one()
        tpl = project.template
        image_text = _is_image_text(project)
        mode = project.pipeline_mode or "full"
        if image_text:
            d_min, d_max = IMAGE_TEXT_DURATION_MIN, IMAGE_TEXT_DURATION_MAX
        else:
            d_min = tpl.shot_duration_min
            d_max = min(tpl.shot_duration_max, get_settings().max_shot_duration)

        style = _effective_style(project)
        extra = (getattr(project, "extra_prompt", None) or "").strip()
        char_hint = (getattr(project, "character_prompt", None) or "").strip()
        plans_result = await ark.chat_storyboard(
            source_text=project.source_text,
            source_type=project.source_type,
            style_prefix=style,
            llm_system_addon=tpl.llm_system_addon,
            duration_min=d_min,
            duration_max=d_max,
            max_shot_duration=d_max if image_text else get_settings().max_shot_duration,
            pipeline_mode=mode,
            character_hint=char_hint,
            extra_requirements=extra,
        )
        plans = plans_result.shots
        project.character_bible = _effective_character_bible(project, plans_result.character_bible)
        for shot in list(project.shots):
            await db.delete(shot)
        await db.flush()
        bible = project.character_bible
        for plan in plans:
            dur = clamp_shot_duration(
                plan.duration,
                pipeline_mode=mode,
                tpl_min=tpl.shot_duration_min,
                tpl_max=tpl.shot_duration_max,
            )
            # Store scene-only prompt for UI; locks applied at Seedream time
            scene = strip_lock_blocks(plan.img_prompt)
            # Drop duplicated style / bible text from stored scene prompt
            if style and style in scene:
                scene = scene.replace(style, "", 1)
            if bible and bible[:24] in scene:
                scene = scene.replace(bible, "", 1)
            scene = strip_lock_blocks(scene)
            img_prompt = ark._sanitize_seedream_prompt(scene)
            db.add(
                Shot(
                    project_id=project.id,
                    shot_no=plan.shot,
                    duration=dur,
                    narration=plan.text,
                    overlay_title=plan.overlay_title or "",
                    overlay_subtitle=plan.overlay_subtitle or "",
                    img_prompt=img_prompt,
                    video_prompt=plan.video_prompt,
                    camera=plan.camera,
                    bgm_mood=plan.bgm,
                    status=ShotStatus.PENDING,
                )
            )
        project.status = ProjectStatus.SCRIPT_READY
        project.progress = 15
        await db.commit()
    await publish_progress(project_id, {"event": "progress", "stage": "SCRIPT_READY", "percent": 15})


def _effective_style(project: Project) -> str:
    user = (getattr(project, "style_prompt", None) or "").strip()
    tpl = project.template
    base = (tpl.style_prefix if tpl else "") or ""
    return user or base


def _effective_character_bible(project: Project, llm_bible: str = "") -> str:
    user = (getattr(project, "character_prompt", None) or "").strip()
    return user or (llm_bible or "").strip()


def _image_size_for(project: Project) -> str | None:
    if not _is_image_text(project):
        return None
    ratio = (project.template.default_ratio if project.template else None) or "9:16"
    if _is_image_text(project) and ratio == "16:9":
        ratio = "9:16"
    return _IMAGE_SIZE_BY_RATIO.get(ratio)


def _project_image_negative(project: Project) -> str:
    tpl = project.template
    return merge_negative(tpl.negative_prompt if tpl else "", image_text=_is_image_text(project))


def _project_base_refs(project: Project) -> list[str]:
    tpl = project.template
    refs = list((tpl.seedream_config or {}).get("ref_images") or []) if tpl else []
    if project.ref_image_url:
        refs = [project.ref_image_url, *refs]
    return seedream_ref_urls(*refs)


def _locked_shot_prompt(project: Project, img_prompt: str) -> str:
    return build_locked_image_prompt(
        _effective_style(project),
        strip_lock_blocks(img_prompt),
        getattr(project, "character_bible", None) or "",
    )


def _consistency_ref_from_shots(shots: list) -> str | None:
    """Prefer first finished shot's Ark CDN URL, else local static."""
    ordered = sorted(shots, key=lambda s: s.shot_no)
    for s in ordered:
        if s.image_ark_url and str(s.image_ark_url).startswith("http"):
            return s.image_ark_url
    for s in ordered:
        if s.image_url:
            return s.image_url
    return None


_db_write_lock = asyncio.Lock()


async def _parallel_image_and_audio(project_id: int) -> None:
    """Generate storyboard images and TTS in parallel (audio does not need images)."""
    await _set_status(project_id, ProjectStatus.IMAGING, 18, "PARALLEL_ASSETS")
    cfg = get_settings()
    ark = get_ark()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.shots), selectinload(Project.template))
        )
        project = result.scalar_one()
        tpl = project.template
        image_text = _is_image_text(project)
        shot_rows = sorted(project.shots, key=lambda s: s.shot_no)
        total = len(shot_rows)
        shot_meta = [
            {
                "id": s.id,
                "shot_no": s.shot_no,
                "img_prompt": s.img_prompt,
                "narration": s.narration,
                "duration": float(s.duration),
                "has_image": bool(s.image_url or s.image_ark_url),
                "has_audio": bool(
                    s.audio_url
                    and (p := storage.local_path_from_url(s.audio_url))
                    and p.exists()
                    and not is_near_silent_audio(p)
                ),
            }
            for s in shot_rows
        ]
        style_prefix = _effective_style(project)
        character_bible = getattr(project, "character_bible", None) or ""
        base_refs = _project_base_refs(project)
        # If some shots already have images (resume), use them as consistency anchors
        existing_anchor = _consistency_ref_from_shots(shot_rows)
        image_size = _image_size_for(project)
        negative = _project_image_negative(project)
        voice = _project_voice(project)

    if not shot_meta:
        return

    img_sem = asyncio.Semaphore(max(1, cfg.pipeline_image_concurrency))
    aud_sem = asyncio.Semaphore(max(1, cfg.pipeline_audio_concurrency))
    done_img = 0
    done_aud = 0
    progress_lock = asyncio.Lock()

    async def bump(kind: str) -> None:
        nonlocal done_img, done_aud
        async with progress_lock:
            if kind == "img":
                done_img += 1
            else:
                done_aud += 1
            # 18 → 70 while images+audio complete
            img_w = 0.55 if image_text else 0.45
            aud_w = 0.45 if image_text else 0.25
            frac = (done_img / total) * img_w + (done_aud / total) * aud_w
            pct = 18 + int(52 * frac)
            async with _db_write_lock:
                async with AsyncSessionLocal() as db:
                    project = await db.get(Project, project_id)
                    if project:
                        project.progress = pct
                        project.status = ProjectStatus.IMAGING
                        await db.commit()
            await publish_progress(
                project_id,
                {
                    "event": "progress",
                    "stage": "PARALLEL_ASSETS",
                    "percent": pct,
                    "message": f"出图 {done_img}/{total} · 配音 {done_aud}/{total}",
                    "shot": None,
                    "total": total,
                },
            )

    async def persist_image(meta: dict, img) -> None:
        async with _db_write_lock:
            async with AsyncSessionLocal() as db:
                shot = await db.get(Shot, meta["id"])
                if not shot:
                    return
                shot.image_url = img.local_url
                shot.image_ark_url = img.remote_url
                if shot.status in {ShotStatus.PENDING, ShotStatus.AUDIO_READY}:
                    shot.status = (
                        ShotStatus.AUDIO_READY if shot.audio_url else ShotStatus.IMAGE_READY
                    )
                elif not shot.video_url:
                    shot.status = ShotStatus.IMAGE_READY
                await db.commit()
        await bump("img")

    async def one_image(meta: dict, ref_urls: list[str]) -> str | None:
        """Generate one shot; return remote/local URL for consistency chaining."""
        await _ensure_not_cancelled(project_id)
        if meta.get("has_image"):
            await bump("img")
            return None
        prompt = build_locked_image_prompt(style_prefix, strip_lock_blocks(meta["img_prompt"]), character_bible)
        async with img_sem:
            await _ensure_not_cancelled(project_id)
            img = await ark.gen_image(
                prompt,
                negative,
                ref_urls,
                project_id=project_id,
                shot_no=meta["shot_no"],
                size=image_size,
            )
        await persist_image(meta, img)
        return img.remote_url or img.local_url

    async def run_images() -> None:
        """Anchor on first generated shot, then parallelize the rest with that ref."""
        need = [m for m in shot_meta if not m.get("has_image")]
        already = [m for m in shot_meta if m.get("has_image")]
        for m in already:
            await bump("img")

        if not need:
            return

        anchor = existing_anchor
        first, rest = need[0], need[1:]
        first_refs = seedream_ref_urls(anchor, *base_refs) if anchor else list(base_refs)
        first_url = await one_image(first, first_refs)
        if first_url:
            anchor = first_url

        if not rest:
            return
        rest_refs = seedream_ref_urls(anchor, *base_refs) if anchor else list(base_refs)

        results = await asyncio.gather(
            *(one_image(m, rest_refs) for m in rest),
            return_exceptions=True,
        )
        for r in results:
            if isinstance(r, Exception):
                raise r

    async def one_audio(meta: dict) -> None:
        await _ensure_not_cancelled(project_id)
        if meta.get("has_audio"):
            await bump("aud")
            return
        async with aud_sem:
            await _ensure_not_cancelled(project_id)
            audio_url = await ark.tts(
                meta["narration"],
                voice,
                project_id=project_id,
                shot_no=meta["shot_no"],
                duration_hint=meta["duration"],
            )
            new_dur = meta["duration"]
            audio_path = storage.local_path_from_url(audio_url or "")
            if audio_path and audio_path.exists():
                dur = await asyncio.to_thread(probe_duration, audio_path)
                if dur and dur > 0.5:
                    new_dur = max(float(meta["duration"]), round(dur + 0.35, 2))
        async with _db_write_lock:
            async with AsyncSessionLocal() as db:
                shot = await db.get(Shot, meta["id"])
                if not shot:
                    return
                shot.audio_url = audio_url
                shot.duration = new_dur
                if shot.status == ShotStatus.PENDING:
                    shot.status = ShotStatus.AUDIO_READY
                elif shot.status == ShotStatus.IMAGE_READY and shot.audio_url:
                    # keep IMAGE_READY for UI; audio_url marks TTS done
                    pass
                await db.commit()
        await bump("aud")

    results = await asyncio.gather(
        run_images(),
        *(one_audio(m) for m in shot_meta),
        return_exceptions=True,
    )
    errors = [r for r in results if isinstance(r, Exception)]
    if errors:
        # Prefer cancel over generic failure
        for err in errors:
            if isinstance(err, (PipelineCancelled, asyncio.CancelledError)):
                raise err
        raise RuntimeError(str(errors[0]))

    async with _db_write_lock:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Project)
                .where(Project.id == project_id)
                .options(selectinload(Project.shots))
            )
            project = result.scalar_one()
            if project.shots:
                project.cover_url = sorted(project.shots, key=lambda s: s.shot_no)[0].image_url
            project.status = ProjectStatus.IMAGE_READY if image_text else ProjectStatus.IMAGE_READY
            project.progress = 70 if image_text else 50
            await db.commit()
    await publish_progress(
        project_id,
        {
            "event": "progress",
            "stage": "ASSETS_READY",
            "percent": 70 if image_text else 50,
            "message": "分镜图与配音已完成",
        },
    )


async def _parallel_videos(project_id: int) -> None:
    """Run Seedance i2v for all shots concurrently (after images exist)."""
    await _set_status(project_id, ProjectStatus.VIDEOING, 55, "VIDEOING")
    cfg = get_settings()
    ark = get_ark()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.shots), selectinload(Project.template))
        )
        project = result.scalar_one()
        tpl = project.template
        consistency = bool(tpl.seedance_config.get("character_consistency", True))
        motion = str(tpl.seedance_config.get("motion_bias", ""))
        resolution = cfg.ark_video_resolution
        if project.resolution_mode == "hd" and resolution == "480p":
            resolution = "720p"
        ratio = tpl.default_ratio or cfg.ark_video_ratio
        shot_meta = [
            {
                "id": s.id,
                "shot_no": s.shot_no,
                "duration": float(s.duration),
                "video_prompt": s.video_prompt,
                "camera": s.camera,
                "image_ref": s.image_ark_url or s.image_url or "",
                "has_video": bool(s.video_url),
            }
            for s in sorted(project.shots, key=lambda s: s.shot_no)
        ]
        total = len(shot_meta)

    if not shot_meta:
        return

    sem = asyncio.Semaphore(max(1, cfg.pipeline_video_concurrency))
    done = 0
    progress_lock = asyncio.Lock()

    async def one_video(meta: dict) -> None:
        nonlocal done
        await _ensure_not_cancelled(project_id)
        if meta.get("has_video"):
            async with progress_lock:
                done += 1
                pct = 55 + int(30 * done / max(total, 1))
            await publish_progress(
                project_id,
                {
                    "event": "progress",
                    "stage": "VIDEOING",
                    "shot": meta["shot_no"],
                    "percent": pct,
                    "message": f"沿用已有视频 {done}/{total}",
                },
            )
            return
        async with sem:
            await _ensure_not_cancelled(project_id)
            prompt = f"{meta['video_prompt']}。运镜：{meta['camera']}。{motion}"
            task_id = await ark.gen_video_i2v(
                meta["image_ref"],
                prompt,
                int(meta["duration"]),
                character_consistency=consistency,
                resolution=resolution,
                ratio=ratio,
            )
            local_video = await ark.wait_video(
                task_id, project_id=project_id, shot_no=meta["shot_no"]
            )
        async with _db_write_lock:
            async with AsyncSessionLocal() as db:
                shot = await db.get(Shot, meta["id"])
                if not shot:
                    return
                shot.video_url = local_video
                shot.status = ShotStatus.VIDEO_READY
                await db.commit()
        async with progress_lock:
            done += 1
            pct = 55 + int(30 * done / max(total, 1))
            async with _db_write_lock:
                async with AsyncSessionLocal() as db:
                    project = await db.get(Project, project_id)
                    if project:
                        project.progress = pct
                        project.status = ProjectStatus.VIDEOING
                        await db.commit()
            await publish_progress(
                project_id,
                {
                    "event": "progress",
                    "stage": "VIDEOING",
                    "shot": meta["shot_no"],
                    "total": total,
                    "percent": pct,
                    "message": f"AI 视频 {done}/{total}",
                },
            )

    results = await asyncio.gather(*(one_video(m) for m in shot_meta), return_exceptions=True)
    errors = [r for r in results if isinstance(r, Exception)]
    if errors:
        for err in errors:
            if isinstance(err, (PipelineCancelled, asyncio.CancelledError)):
                raise err
        raise RuntimeError(str(errors[0]))

    async with _db_write_lock:
        async with AsyncSessionLocal() as db:
            project = await db.get(Project, project_id)
            if project:
                project.status = ProjectStatus.VIDEO_READY
                project.progress = 88
                await db.commit()
    await publish_progress(
        project_id,
        {"event": "progress", "stage": "VIDEO_READY", "percent": 88, "message": "全部镜头视频完成"},
    )


async def _image_stage(project_id: int) -> None:
    await _set_status(project_id, ProjectStatus.IMAGING, 20, "IMAGING")
    ark = get_ark()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.shots), selectinload(Project.template))
        )
        project = result.scalar_one()
        tpl = project.template
        total = len(project.shots)
        ref_urls = _project_base_refs(project)
        image_size = _image_size_for(project)
        negative = _project_image_negative(project)
        style_prefix = _effective_style(project)
        bible = getattr(project, "character_bible", None) or ""
        anchor: str | None = None

        for idx, shot in enumerate(sorted(project.shots, key=lambda s: s.shot_no)):
            await _ensure_not_cancelled(project_id)
            if shot.image_url or shot.image_ark_url:
                if not anchor:
                    anchor = shot.image_ark_url or shot.image_url
                continue
            refs = seedream_ref_urls(anchor, *ref_urls) if anchor else list(ref_urls)
            prompt = build_locked_image_prompt(style_prefix, strip_lock_blocks(shot.img_prompt), bible)
            img = await ark.gen_image(
                prompt,
                negative,
                refs,
                project_id=project_id,
                shot_no=shot.shot_no,
                size=image_size,
            )
            shot.image_url = img.local_url
            shot.image_ark_url = img.remote_url
            shot.status = ShotStatus.IMAGE_READY
            if not anchor:
                anchor = img.remote_url or img.local_url
            span = 55 if _is_image_text(project) else 25
            pct = 20 + int(span * (idx + 1) / max(total, 1))
            project.progress = pct
            await db.commit()
            await publish_progress(
                project_id,
                {
                    "event": "progress",
                    "stage": "IMAGING",
                    "shot": shot.shot_no,
                    "total": total,
                    "percent": pct,
                },
            )
        if project.shots:
            project.cover_url = sorted(project.shots, key=lambda s: s.shot_no)[0].image_url
        project.status = ProjectStatus.IMAGE_READY
        project.progress = 75 if _is_image_text(project) else 45
        await db.commit()


async def _video_stage(project_id: int) -> None:
    await _set_status(project_id, ProjectStatus.VIDEOING, 50, "VIDEOING")
    ark = get_ark()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.shots), selectinload(Project.template))
        )
        project = result.scalar_one()
        tpl = project.template
        consistency = bool(tpl.seedance_config.get("character_consistency", True))
        motion = str(tpl.seedance_config.get("motion_bias", ""))
        total = len(project.shots)
        cfg = get_settings()
        resolution = cfg.ark_video_resolution
        if project.resolution_mode == "hd" and resolution == "480p":
            resolution = "720p"
        ratio = tpl.default_ratio or cfg.ark_video_ratio
        for idx, shot in enumerate(sorted(project.shots, key=lambda s: s.shot_no)):
            await _ensure_not_cancelled(project_id)
            prompt = f"{shot.video_prompt}。运镜：{shot.camera}。{motion}"
            image_ref = shot.image_ark_url or shot.image_url or ""
            task_id = await ark.gen_video_i2v(
                image_ref,
                prompt,
                int(shot.duration),
                character_consistency=consistency,
                resolution=resolution,
                ratio=ratio,
            )
            local_video = await ark.wait_video(task_id, project_id=project_id, shot_no=shot.shot_no)
            shot.video_url = local_video
            shot.status = ShotStatus.VIDEO_READY
            pct = 50 + int(25 * (idx + 1) / max(total, 1))
            project.progress = pct
            await db.commit()
            await publish_progress(
                project_id,
                {
                    "event": "progress",
                    "stage": "VIDEOING",
                    "shot": shot.shot_no,
                    "total": total,
                    "percent": pct,
                },
            )
        project.status = ProjectStatus.VIDEO_READY
        project.progress = 75
        await db.commit()


async def _audio_stage(project_id: int) -> None:
    await _set_status(project_id, ProjectStatus.AUDIOING, 80, "AUDIOING")
    ark = get_ark()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.shots), selectinload(Project.template))
        )
        project = result.scalar_one()
        voice = _project_voice(project)
        total = len(project.shots)
        for idx, shot in enumerate(sorted(project.shots, key=lambda s: s.shot_no)):
            await _ensure_not_cancelled(project_id)
            shot.audio_url = await ark.tts(
                shot.narration,
                voice,
                project_id=project_id,
                shot_no=shot.shot_no,
                duration_hint=shot.duration,
            )
            audio_path = storage.local_path_from_url(shot.audio_url or "")
            if audio_path and audio_path.exists():
                dur = await asyncio.to_thread(probe_duration, audio_path)
                if dur and dur > 0.5:
                    shot.duration = max(float(shot.duration), round(dur + 0.35, 2))
            shot.status = ShotStatus.AUDIO_READY
            pct = 80 + int(10 * (idx + 1) / max(total, 1))
            project.progress = pct
            await db.commit()
            await publish_progress(
                project_id,
                {
                    "event": "progress",
                    "stage": "AUDIOING",
                    "shot": shot.shot_no,
                    "total": total,
                    "percent": pct,
                },
            )


async def _compose_stage(project_id: int) -> None:
    await _set_status(project_id, ProjectStatus.COMPOSING, 92, "COMPOSING")
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.shots), selectinload(Project.template))
        )
        project = result.scalar_one()
        media: list[ShotMedia] = []
        for shot in sorted(project.shots, key=lambda s: s.shot_no):
            video_path = storage.local_path_from_url(shot.video_url or "")
            audio_path = storage.local_path_from_url(shot.audio_url or "")
            image_path = storage.local_path_from_url(shot.image_url or "")
            pdir = storage.project_dir(project_id)
            if shot.video_url and shot.video_url.startswith("http"):
                video_path = await storage.download_to(shot.video_url, pdir / f"shot_{shot.shot_no:03d}.mp4")
                shot.video_url = storage.rel_static_url(video_path)
            if shot.audio_url and shot.audio_url.startswith("http"):
                audio_path = await storage.download_to(shot.audio_url, pdir / f"shot_{shot.shot_no:03d}_tts.mp3")
                shot.audio_url = storage.rel_static_url(audio_path)
            media.append(
                ShotMedia(
                    shot_no=shot.shot_no,
                    duration=float(shot.duration),
                    narration=shot.narration,
                    overlay_title=getattr(shot, "overlay_title", "") or "",
                    overlay_subtitle=getattr(shot, "overlay_subtitle", "") or "",
                    video_path=video_path if video_path and video_path.exists() else None,
                    audio_path=audio_path if audio_path and audio_path.exists() else None,
                    image_path=image_path if image_path and image_path.exists() else None,
                )
            )

        ratio = (project.template.default_ratio if project.template else None) or "16:9"
        mode = project.pipeline_mode or "full"
        if mode == "image_text" and ratio == "16:9":
            ratio = "9:16"

        out = storage.project_dir(project_id) / "final.mp4"
        await asyncio.to_thread(
            compose_project,
            media,
            out,
            ComposeOptions(
                ratio=ratio,
                mode=mode,
                resolution_mode=project.resolution_mode or "preview",
            ),
        )
        project.final_video_url = storage.rel_static_url(out)
        if project.status != ProjectStatus.CANCELLED:
            project.status = ProjectStatus.AUDITING
            project.progress = 96
        await db.commit()

    async with AsyncSessionLocal() as db:
        project = await db.get(Project, project_id)
        if project and project.status != ProjectStatus.CANCELLED:
            project.status = ProjectStatus.DONE
            project.progress = 100
            await db.commit()


async def regen_shot_image(project_id: int, shot_id: int) -> None:
    ark = get_ark()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.template), selectinload(Project.shots))
        )
        project = result.scalar_one()
        shot = next((s for s in project.shots if s.id == shot_id), None)
        if not shot:
            raise ValueError("shot not found")
        base_refs = _project_base_refs(project)
        anchor = _consistency_ref_from_shots([s for s in project.shots if s.id != shot.id])
        ref_urls = seedream_ref_urls(anchor, *base_refs) if anchor else list(base_refs)
        negative = _project_image_negative(project)
        prompt = _locked_shot_prompt(project, shot.img_prompt)
        img = await ark.gen_image(
            prompt,
            negative,
            ref_urls,
            project_id=project_id,
            shot_no=shot.shot_no,
            size=_image_size_for(project),
        )
        shot.image_url = img.local_url
        shot.image_ark_url = img.remote_url
        shot.video_url = None
        shot.status = ShotStatus.IMAGE_READY
        shot.version += 1
        project.status = ProjectStatus.IMAGE_READY
        project.final_video_url = None
        await db.commit()


async def regen_shot_video(project_id: int, shot_id: int) -> None:
    ark = get_ark()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.template), selectinload(Project.shots))
        )
        project = result.scalar_one()
        if _is_image_text(project):
            raise ValueError("图文模式无需生成 AI 视频，请直接重新合成成片")
        shot = next((s for s in project.shots if s.id == shot_id), None)
        if not shot or not (shot.image_url or shot.image_ark_url):
            raise ValueError("shot image required")
        motion = str(project.template.seedance_config.get("motion_bias", ""))
        consistency = bool(project.template.seedance_config.get("character_consistency", True))
        cfg = get_settings()
        resolution = cfg.ark_video_resolution
        if project.resolution_mode == "hd" and resolution == "480p":
            resolution = "720p"
        prompt = f"{shot.video_prompt}。运镜：{shot.camera}。{motion}"
        image_ref = shot.image_ark_url or shot.image_url or ""
        task_id = await ark.gen_video_i2v(
            image_ref,
            prompt,
            int(shot.duration),
            character_consistency=consistency,
            resolution=resolution,
            ratio=project.template.default_ratio or cfg.ark_video_ratio,
        )
        local_video = await ark.wait_video(task_id, project_id=project_id, shot_no=shot.shot_no)
        shot.video_url = local_video
        shot.status = ShotStatus.VIDEO_READY
        shot.version += 1
        project.final_video_url = None
        project.status = ProjectStatus.VIDEO_READY
        await db.commit()


async def regen_shot_audio(project_id: int, shot_id: int) -> None:
    ark = get_ark()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.template), selectinload(Project.shots))
        )
        project = result.scalar_one()
        shot = next((s for s in project.shots if s.id == shot_id), None)
        if not shot:
            raise ValueError("shot not found")
        if not (shot.narration or "").strip():
            raise ValueError("旁白为空，无法配音")
        voice = _project_voice(project)
        audio_url = await ark.tts(
            shot.narration,
            voice,
            project_id=project_id,
            shot_no=shot.shot_no,
            duration_hint=float(shot.duration),
        )
        shot.audio_url = audio_url
        audio_path = storage.local_path_from_url(audio_url or "")
        if audio_path and audio_path.exists():
            dur = await asyncio.to_thread(probe_duration, audio_path)
            if dur and dur > 0.5:
                shot.duration = max(float(shot.duration), round(dur + 0.35, 2))
        if shot.status == ShotStatus.PENDING:
            shot.status = ShotStatus.AUDIO_READY
        shot.version += 1
        project.final_video_url = None
        await db.commit()


async def regen_project_audio_and_compose(project_id: int) -> None:
    """Force re-TTS every shot with current voice, then compose."""
    ark = get_ark()
    await _set_status(project_id, ProjectStatus.AUDIOING, 80, "AUDIOING")
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.template), selectinload(Project.shots))
        )
        project = result.scalar_one()
        voice = _project_voice(project)
        shots = sorted(project.shots, key=lambda s: s.shot_no)
        total = max(len(shots), 1)
        for idx, shot in enumerate(shots):
            if not (shot.narration or "").strip():
                continue
            audio_url = await ark.tts(
                shot.narration,
                voice,
                project_id=project_id,
                shot_no=shot.shot_no,
                duration_hint=float(shot.duration),
            )
            shot.audio_url = audio_url
            audio_path = storage.local_path_from_url(audio_url or "")
            if audio_path and audio_path.exists():
                dur = await asyncio.to_thread(probe_duration, audio_path)
                if dur and dur > 0.5:
                    shot.duration = max(float(shot.duration), round(dur + 0.35, 2))
            shot.version += 1
            project.progress = 80 + int(10 * (idx + 1) / total)
            await db.commit()
            await publish_progress(
                project_id,
                {
                    "event": "progress",
                    "stage": "AUDIOING",
                    "percent": project.progress,
                    "message": f"配音 {idx + 1}/{total}",
                },
            )
        project.final_video_url = None
        await db.commit()

    await _compose_stage(project_id)
    async with AsyncSessionLocal() as db:
        project = await db.get(Project, project_id)
        if project and project.status != ProjectStatus.CANCELLED:
            project.status = ProjectStatus.DONE
            project.progress = 100
            project.error_msg = None
            await db.commit()
    await publish_progress(
        project_id,
        {"event": "done", "percent": 100, "video_url": await _final_url(project_id)},
    )


async def compose_only(project_id: int) -> None:
    await _compose_stage(project_id)
    async with AsyncSessionLocal() as db:
        project = await db.get(Project, project_id)
        if project and project.status != ProjectStatus.CANCELLED:
            project.status = ProjectStatus.DONE
            project.progress = 100
            project.error_msg = None
            await db.commit()
    await publish_progress(
        project_id,
        {"event": "done", "percent": 100, "video_url": await _final_url(project_id)},
    )
