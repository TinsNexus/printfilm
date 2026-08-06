"""Celery tasks wrapping async pipeline stages."""

from __future__ import annotations

import asyncio
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run(coro):
    return asyncio.run(coro)


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

    reload_settings()
    reset_ark()
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
            )
        )
        if permanent:
            logger.error("permanent pipeline failure project=%s: %s", project_id, msg[:400])
            return {"ok": False, "project_id": project_id, "error": msg[:500]}
        logger.exception("celery pipeline failed project=%s", project_id)
        raise self.retry(exc=exc, countdown=10)


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
