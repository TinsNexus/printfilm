"""Async OSS upload queue: enqueue after local save, then backfill DB URLs."""

from __future__ import annotations

import hashlib
import logging

import redis
from sqlalchemy import update

from app.config import get_settings
from app.services import oss as oss_svc
from app.services import storage

logger = logging.getLogger(__name__)

_ENQUEUE_KEY = "ai_movie:oss:enqueued:{digest}"
_ENQUEUE_TTL = 7200


def _redis() -> redis.Redis:
    return redis.Redis.from_url(
        get_settings().redis_url,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )


def _digest(local_url: str) -> str:
    return hashlib.sha1(local_url.encode("utf-8")).hexdigest()[:24]


def enqueue_oss_upload(local_url: str) -> bool:
    """Queue OSS upload for a /static URL. Returns True if newly enqueued."""
    url = (local_url or "").strip()
    if not url or not storage.is_local_static_url(url):
        return False
    if not oss_svc.oss_enabled():
        return False

    settings = get_settings()
    key = _ENQUEUE_KEY.format(digest=_digest(url))
    try:
        r = _redis()
        if not r.set(key, "1", nx=True, ex=_ENQUEUE_TTL):
            return False
    except Exception:  # noqa: BLE001
        logger.warning("oss enqueue redis unavailable, caller should sync-upload", exc_info=True)
        raise

    try:
        from app.workers.tasks import upload_media_task

        queue = (settings.oss_upload_queue or "oss").strip() or "oss"
        upload_media_task.apply_async(args=[url], queue=queue)
        logger.info("oss upload enqueued %s → queue=%s", url, queue)
        return True
    except Exception:
        try:
            _redis().delete(key)
        except Exception:  # noqa: BLE001
            pass
        raise


def clear_enqueue_marker(local_url: str) -> None:
    try:
        _redis().delete(_ENQUEUE_KEY.format(digest=_digest(local_url)))
    except Exception:  # noqa: BLE001
        pass


async def backfill_media_url(old_url: str, new_url: str) -> int:
    """Replace exact local URL references with OSS URL across media tables."""
    old = (old_url or "").strip()
    new = (new_url or "").strip()
    if not old or not new or old == new:
        return 0

    from app.database import AsyncSessionLocal
    from app.models import Project, Shot, Template, Work

    targets: list[tuple[type, list[str]]] = [
        (Shot, ["image_url", "video_url", "audio_url"]),
        (Project, ["cover_url", "final_video_url", "ref_image_url"]),
        (Template, ["preview_cover"]),
        (Work, ["cover_url", "video_url"]),
    ]
    changed = 0
    async with AsyncSessionLocal() as db:
        for model, fields in targets:
            for field in fields:
                col = getattr(model, field)
                result = await db.execute(
                    update(model).where(col == old).values(**{field: new})
                )
                changed += int(result.rowcount or 0)
        await db.commit()
    if changed:
        logger.info("oss backfill %s row(s): %s → %s", changed, old, new)
    return changed
