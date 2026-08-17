"""Celery Redis queue helpers — purge duplicate pipeline tasks per project."""

from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any

import redis

from app.config import get_settings

logger = logging.getLogger(__name__)

from app.workers.queues import PIPELINE_QUEUE
_ARGS_RE = re.compile(r"\[(\d+)\]|\((\d+),?\)")


def _redis_client(*, decode: bool = True) -> redis.Redis:
    return redis.Redis.from_url(
        get_settings().redis_url,
        decode_responses=decode,
        socket_connect_timeout=3,
        socket_timeout=5,
    )


def project_id_from_celery_message(msg: dict[str, Any]) -> int | None:
    """Extract project_id from a Celery Redis broker message."""
    headers = msg.get("headers") or {}
    argsrepr = str(headers.get("argsrepr") or "")
    m = _ARGS_RE.search(argsrepr)
    if m:
        return int(m.group(1) or m.group(2))

    body = msg.get("body")
    if not body:
        return None
    try:
        if isinstance(body, bytes):
            body = body.decode("utf-8", errors="replace")
        raw = base64.b64decode(body)
        payload = json.loads(raw.decode("utf-8"))
        # Celery JSON: [[args...], kwargs, embed]
        args = payload[0] if isinstance(payload, (list, tuple)) and payload else None
        if isinstance(args, (list, tuple)) and args:
            return int(args[0])
        if isinstance(args, int):
            return args
    except Exception:  # noqa: BLE001
        return None
    return None


def purge_pipeline_queue_for_project(project_id: int, *, queue: str = PIPELINE_QUEUE) -> int:
    """Remove pending broker messages for project_id from the pipeline queue.

    Returns number of removed messages. Best-effort; never raises to callers.
    """
    try:
        r = _redis_client(decode=True)
        items = r.lrange(queue, 0, -1) or []
        if not items:
            return 0

        kept: list[str] = []
        removed_ids: list[str] = []
        for raw in items:
            try:
                msg = json.loads(raw)
            except Exception:  # noqa: BLE001
                kept.append(raw)
                continue
            pid = project_id_from_celery_message(msg)
            if pid == int(project_id):
                tid = str((msg.get("headers") or {}).get("id") or "")
                if tid:
                    removed_ids.append(tid)
                continue
            kept.append(raw)

        removed = len(items) - len(kept)
        if removed <= 0:
            return 0

        pipe = r.pipeline()
        pipe.delete(queue)
        if kept:
            pipe.rpush(queue, *kept)
        pipe.execute()

        if removed_ids:
            try:
                from app.workers.celery_app import celery_app

                for tid in removed_ids:
                    celery_app.control.revoke(tid, terminate=False)
            except Exception:  # noqa: BLE001
                logger.warning("revoke purged tasks failed project=%s", project_id)

        logger.info(
            "purged %s queued pipeline task(s) for project=%s (left=%s)",
            removed,
            project_id,
            len(kept),
        )
        return removed
    except Exception:  # noqa: BLE001
        logger.exception("purge_pipeline_queue_for_project failed project=%s", project_id)
        return 0


def pipeline_run_lock_key(project_id: int) -> str:
    return f"ai_movie:pipeline:run:{int(project_id)}"


def acquire_pipeline_run_lock(project_id: int, owner: str, *, ttl_sec: int = 7200) -> bool:
    """NX lock so only one worker runs a project pipeline at a time."""
    try:
        r = _redis_client(decode=True)
        return bool(r.set(pipeline_run_lock_key(project_id), owner, nx=True, ex=max(60, ttl_sec)))
    except Exception:  # noqa: BLE001
        logger.exception("acquire pipeline lock failed project=%s", project_id)
        return True  # fail open so work still proceeds


def release_pipeline_run_lock(project_id: int, owner: str) -> None:
    try:
        r = _redis_client(decode=True)
        key = pipeline_run_lock_key(project_id)
        cur = r.get(key)
        if cur is None or cur == owner:
            r.delete(key)
    except Exception:  # noqa: BLE001
        logger.exception("release pipeline lock failed project=%s", project_id)


def clear_pipeline_run_lock(project_id: int) -> None:
    try:
        r = _redis_client(decode=True)
        r.delete(pipeline_run_lock_key(project_id))
    except Exception:  # noqa: BLE001
        logger.exception("clear pipeline lock failed project=%s", project_id)
