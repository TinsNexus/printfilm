"""Celery 队列配置单测。"""

from app.workers.queues import (
    DEFAULT_WORKER_QUEUES,
    DRAMA_QUEUE,
    parse_worker_queues,
    worker_queues_csv,
)


def test_default_worker_queues_order():
    # drama 优先，避免被 pipeline 堵住
    assert DEFAULT_WORKER_QUEUES[0] == DRAMA_QUEUE
    assert "pipeline" in DEFAULT_WORKER_QUEUES


def test_parse_worker_queues():
    assert parse_worker_queues("drama,oss,video,pipeline") == (
        "drama",
        "oss",
        "video",
        "pipeline",
    )
    assert parse_worker_queues("") == DEFAULT_WORKER_QUEUES


def test_worker_queues_csv():
    assert worker_queues_csv("drama,video") == "drama,video"
