"""Celery tasks wrapping async pipeline stages."""

from __future__ import annotations

import asyncio
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run(coro):
    """Drive an async coroutine in a fresh event loop, disposing DB pool after.

    Prevents 'Future attached to a different loop' when Celery reuses the
    process across multiple asyncio.run() invocations.
    """

    async def _wrapped():
        from app.database import dispose_engine

        await dispose_engine()
        try:
            return await coro
        finally:
            await dispose_engine()

    return asyncio.run(_wrapped())


@celery_app.task(
    name="app.workers.tasks.run_pipeline_task",
    bind=True,
    max_retries=1,
    soft_time_limit=None,  # use app conf
    time_limit=None,
)
def run_pipeline_task(self, project_id: int) -> dict:
    from celery.exceptions import SoftTimeLimitExceeded

    from app.config import reload_settings
    from app.services.ark import reset_ark
    from app.services.pipeline import PipelineCancelled, is_cancelled, run_pipeline
    from app.workers.queue_dedupe import (
        acquire_pipeline_run_lock,
        release_pipeline_run_lock,
    )

    reload_settings()
    reset_ark()

    owner = str(getattr(getattr(self, "request", None), "id", "") or f"worker-{project_id}")
    if not acquire_pipeline_run_lock(project_id, owner):
        logger.warning("skip duplicate pipeline project=%s task=%s", project_id, owner)
        return {"ok": False, "skipped": "duplicate", "project_id": project_id}

    try:
        _run(run_pipeline(project_id))
        return {"ok": True, "project_id": project_id}
    except SoftTimeLimitExceeded:
        logger.error("pipeline soft time limit project=%s", project_id)
        try:
            from app.database import AsyncSessionLocal
            from app.models import Project, ProjectStatus

            async def _mark_timeout() -> None:
                async with AsyncSessionLocal() as db:
                    p = await db.get(Project, project_id)
                    if p and p.status not in {ProjectStatus.DONE, ProjectStatus.CANCELLED}:
                        p.status = ProjectStatus.FAILED
                        p.error_msg = "任务超时（可能卡在出图/合成），请重新生成"
                        await db.commit()

            _run(_mark_timeout())
        except Exception:  # noqa: BLE001
            logger.exception("failed to mark timeout project=%s", project_id)
        return {"ok": False, "project_id": project_id, "error": "task_timeout"}
    except PipelineCancelled:
        return {"ok": False, "cancelled": True, "project_id": project_id}
    except Exception as exc:  # noqa: BLE001
        if is_cancelled(project_id):
            return {"ok": False, "cancelled": True, "project_id": project_id}
        msg = str(exc)
        # Permanent policy / client errors — do not retry
        permanent = any(
            x in msg
            for x in (
                "PolicyViolation",
                "SensitiveContent",
                "InputTextSensitive",
                "InputImageSensitive",
                "PrivacyInformation",
                "BodyFormat",
                "summary_caption",
                # Seedance / 参数约束类：400 通常为输入不合法，重试大概率仍失败
                "Seedance create error 400",
                "InvalidParameter",
                "TaskTypeConstraint",
                # 代码/调用不匹配类：应直接修复发布版本或入参映射
                "NameError: name 'shot_id' is not defined",
                "shot_id' is not defined",
                "unexpected keyword argument 'image_style_id'",
                "got an unexpected keyword argument 'image_style_id'",
            )
        )
        if permanent:
            logger.error("permanent pipeline failure project=%s: %s", project_id, msg[:400])
            return {"ok": False, "project_id": project_id, "error": msg[:500]}
        logger.exception("celery pipeline failed project=%s", project_id)
        raise self.retry(exc=exc, countdown=10)
    finally:
        release_pipeline_run_lock(project_id, owner)


@celery_app.task(name="app.workers.tasks.regen_image_task")
def regen_image_task(project_id: int, shot_id: int) -> dict:
    from app.services.pipeline import regen_shot_image

    _run(regen_shot_image(project_id, shot_id))
    return {"ok": True}


@celery_app.task(name="app.workers.tasks.regen_video_task")
def regen_video_task(project_id: int, shot_id: int) -> dict:
    from app.services.pipeline import regen_shot_video

    _run(regen_shot_video(project_id, shot_id))
    return {"ok": True}


@celery_app.task(
    name="app.workers.tasks.upload_media_task",
    bind=True,
    max_retries=5,
    default_retry_delay=20,
    soft_time_limit=300,
    time_limit=360,
)
def upload_media_task(self, local_url: str) -> dict:
    """Upload one /static media file to OSS and backfill matching DB URLs."""
    from app.config import reload_settings
    from app.services import storage
    from app.services.oss_queue import backfill_media_url, clear_enqueue_marker

    reload_settings()
    url = (local_url or "").strip()
    if not url or not storage.is_local_static_url(url):
        clear_enqueue_marker(url)
        return {"ok": False, "skipped": "not_local", "local_url": url}

    path = storage.local_path_from_url(url)
    if not path or not path.is_file():
        clear_enqueue_marker(url)
        logger.warning("oss upload skip missing file %s", url)
        return {"ok": False, "skipped": "missing", "local_url": url}

    try:
        oss_url = storage.upload_local_sync(path)
        if storage.is_local_static_url(oss_url):
            raise RuntimeError("upload returned local URL")
        changed = _run(backfill_media_url(url, oss_url))
        clear_enqueue_marker(url)
        return {"ok": True, "local_url": url, "oss_url": oss_url, "backfilled": changed}
    except Exception as exc:  # noqa: BLE001
        logger.exception("oss upload task failed %s", url)
        from celery.exceptions import MaxRetriesExceededError

        try:
            raise self.retry(exc=exc)
        except MaxRetriesExceededError:
            clear_enqueue_marker(url)
            return {"ok": False, "local_url": url, "error": str(exc)[:400]}

