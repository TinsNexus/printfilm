"""Recover orphaned Celery unacked messages and stale RUNNING projects."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import redis
from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import Project, ProjectStatus

logger = logging.getLogger("autoscale.recover")

_RUNNING = {
    ProjectStatus.SCRIPTING,
    ProjectStatus.IMAGING,
    ProjectStatus.VIDEOING,
    ProjectStatus.AUDIOING,
    ProjectStatus.COMPOSING,
    ProjectStatus.AUDITING,
}


def reclaim_unacked(redis_url: str | None = None) -> int:
    """Drop Redis unacked hash so late-acked tasks can be redelivered / redispatched.

    Safe when no healthy workers hold live tasks (e.g. autoscale cold start).
    """
    settings = get_settings()
    r = redis.Redis.from_url(redis_url or settings.redis_url, decode_responses=False)
    n = int(r.hlen("unacked") or 0)
    if n:
        r.delete("unacked")
        r.delete("unacked_mutex")
        logger.warning("reclaimed %s orphaned unacked celery messages", n)
    return n


async def redispatch_stale_projects(*, older_than_sec: int | None = None) -> list[int]:
    """Restart pipeline for projects stuck in RUNNING with stale updated_at."""
    settings = get_settings()
    stale_sec = older_than_sec if older_than_sec is not None else int(settings.celery_stale_project_sec)
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=max(60, stale_sec))

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Project).where(Project.status.in_(_RUNNING)))
        projects = list(result.scalars().all())

    stale_ids: list[int] = []
    for p in projects:
        updated = p.updated_at
        if updated is None:
            stale_ids.append(p.id)
            continue
        # SQLite may return naive datetimes
        if updated.tzinfo is None:
            updated = updated.replace(tzinfo=timezone.utc)
        if updated < cutoff:
            stale_ids.append(p.id)

    if not stale_ids:
        return []

    from app.services.pipeline import start_pipeline

    for pid in stale_ids:
        try:
            tid = start_pipeline(pid)
            logger.warning("redispatched stale project=%s task=%s", pid, tid)
        except Exception:  # noqa: BLE001
            logger.exception("failed to redispatch project=%s", pid)
    return stale_ids
