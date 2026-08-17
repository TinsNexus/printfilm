from celery import Celery

from app.config import reload_settings
from app.workers.queues import (
    DRAMA_QUEUE,
    OSS_QUEUE,
    PIPELINE_QUEUE,
    VIDEO_QUEUE,
)

settings = reload_settings()

celery_app = Celery(
    "framecut",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.workers.tasks", "app.workers.drama_tasks"],
)

celery_app.conf.update(
    task_track_started=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    worker_prefetch_multiplier=1,
    # Late ack + kill/hang on Windows leaves Redis "unacked" orphans unless visibility expires
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_acks_on_failure_or_timeout=True,
    task_soft_time_limit=int(settings.celery_task_soft_time_limit),
    task_time_limit=int(settings.celery_task_time_limit),
    broker_transport_options={
        "visibility_timeout": int(settings.celery_visibility_timeout),
    },
    worker_cancel_long_running_tasks_on_connection_loss=True,
    task_routes={
        "app.workers.tasks.run_pipeline_task": {"queue": PIPELINE_QUEUE},
        "app.workers.tasks.regen_image_task": {"queue": PIPELINE_QUEUE},
        "app.workers.tasks.regen_video_task": {"queue": VIDEO_QUEUE},
        "app.workers.tasks.upload_media_task": {"queue": OSS_QUEUE},
        "drama.script_summary": {"queue": DRAMA_QUEUE},
        "drama.episode_scripts": {"queue": DRAMA_QUEUE},
        "drama.episode_fragment_plan": {"queue": DRAMA_QUEUE},
        "drama.episode_generate": {"queue": VIDEO_QUEUE},
        "drama.asset_image": {"queue": DRAMA_QUEUE},
        "drama.asset_video": {"queue": VIDEO_QUEUE},
    },
)
