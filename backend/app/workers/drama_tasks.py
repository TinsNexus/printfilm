"""Celery tasks for drama long-running jobs."""

from __future__ import annotations

import logging

from app.config import get_settings
from app.logging_setup import configure_logging
from app.workers.celery_app import celery_app
from app.workers.tasks import _run

_settings = get_settings()
configure_logging(level="INFO", sql_echo=_settings.sql_echo)
logger = logging.getLogger("app.drama.worker")


@celery_app.task(name="drama.script_summary", bind=True, max_retries=1)
def drama_script_summary_task(self, project_id: int) -> dict:
    # Celery：剧本摘要
    from app.services.drama.jobs import run_script_summary_job

    logger.info("[Celery] 领取剧本摘要任务 project_id=%s task_id=%s", project_id, self.request.id)
    result = _run(run_script_summary_job(project_id))
    logger.info("[Celery] 剧本摘要任务结束 project_id=%s result=%s", project_id, result)
    return result


@celery_app.task(name="drama.episode_scripts", bind=True, max_retries=1)
def drama_episode_scripts_task(self, project_id: int, force: bool = False) -> dict:
    # Celery：分集剧本（完整循环）
    from app.services.drama.jobs import run_episode_scripts_job

    logger.info(
        "[Celery] 领取分集剧本任务 project_id=%s force=%s task_id=%s",
        project_id,
        force,
        self.request.id,
    )
    result = _run(run_episode_scripts_job(project_id, force=force))
    logger.info("[Celery] 分集剧本任务结束 project_id=%s result=%s", project_id, result)
    return result


@celery_app.task(name="drama.episode_generate", bind=True, max_retries=1)
def drama_episode_generate_task(
    self,
    episode_id: int,
    user_id: int,
    fragment_ids: list[int],
) -> dict:
    # Celery：分集视频生成
    from app.services.drama.jobs import run_episode_generate_job

    logger.info(
        "[Celery] 领取分集视频任务 episode_id=%s fragments=%s task_id=%s",
        episode_id,
        len(fragment_ids),
        self.request.id,
    )
    result = _run(run_episode_generate_job(episode_id, user_id, fragment_ids))
    logger.info("[Celery] 分集视频任务结束 episode_id=%s result=%s", episode_id, result)
    return result


@celery_app.task(name="drama.asset_image", bind=True, max_retries=1)
def drama_asset_image_task(
    self,
    project_id: int,
    user_id: int,
    prompt: str,
    asset_id: int | None = None,
    name: str | None = None,
    kind: str = "character",
    image_style_id: str | None = None,
    model_id: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
) -> dict:
    # Celery：资产生图
    from app.services.drama.jobs import run_asset_image_job

    logger.info(
        "[Celery] 领取资产生图任务 project_id=%s asset_id=%s kind=%s style=%s task_id=%s",
        project_id,
        asset_id,
        kind,
        image_style_id,
        self.request.id,
    )
    result = _run(
        run_asset_image_job(
            project_id,
            user_id,
            prompt,
            asset_id,
            name,
            kind,
            image_style_id=image_style_id,
            model_id=model_id,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
        )
    )
    logger.info(
        "[Celery] 资产生图任务结束 project_id=%s asset_id=%s result=%s",
        project_id,
        asset_id,
        result,
    )
    return result
