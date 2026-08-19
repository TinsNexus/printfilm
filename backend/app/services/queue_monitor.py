"""Celery / Redis 队列监控：供管理后台可视化排队与执行状态。"""

from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timezone
from typing import Any

import redis

from app.config import get_settings
from app.workers.queues import parse_worker_queues

logger = logging.getLogger(__name__)

# 各队列中文说明
QUEUE_LABELS: dict[str, str] = {
    "drama": "漫剧（LLM / 生图）",
    "pipeline": "科普 / Studio 成片",
    "video": "视频生成",
    "oss": "OSS 异步上传",
}

# Celery 任务名 → 展示标签
TASK_LABELS: dict[str, str] = {
    "app.workers.tasks.run_pipeline_task": "科普成片 Pipeline",
    "app.workers.tasks.regen_image_task": "重生成图片",
    "app.workers.tasks.regen_video_task": "重生成视频",
    "app.workers.tasks.regen_audio_task": "重生成配音",
    "app.workers.tasks.regen_audio_compose_task": "重配音并合成",
    "app.workers.tasks.compose_only_task": "拼接成片",
    "app.workers.tasks.tool_image_task": "工具·生图",
    "app.workers.tasks.upload_media_task": "OSS 上传",
    "drama.script_summary": "漫剧·剧本摘要",
    "drama.episode_scripts": "漫剧·分集剧本",
    "drama.episode_fragment_plan": "漫剧·分镜规划",
    "drama.episode_generate": "漫剧·分集视频",
    "drama.fragment_generate": "漫剧·分镜视频",
    "drama.asset_image": "漫剧·资产生图",
    "drama.asset_video": "漫剧·资产视频",
    "drama.seed_assets": "漫剧·抽取资产",
}

PENDING_SAMPLE_LIMIT = 30
INSPECT_TIMEOUT_SEC = 1.0
# oss 队列量大时只统计数量，不解析消息体
OSS_SAMPLE_MAX_PENDING = 15
CACHE_TTL_SEC = 4.0

_cache_lock = __import__("threading").Lock()
_cache: dict[str, tuple[float, dict[str, Any]]] = {}


def _redis_client() -> redis.Redis:
    return redis.Redis.from_url(
        get_settings().redis_url,
        decode_responses=True,
        socket_connect_timeout=3,
        socket_timeout=5,
    )


def task_label(task_name: str) -> str:
    # 任务展示名；未知任务退回短名
    name = (task_name or "").strip()
    if not name:
        return "未知任务"
    if name in TASK_LABELS:
        return TASK_LABELS[name]
    if name.startswith("drama."):
        return f"漫剧·{name.split('.')[-1]}"
    short = name.rsplit(".", 1)[-1]
    return short or name


def queue_label(queue_name: str) -> str:
    return QUEUE_LABELS.get(queue_name, queue_name)


def _first_int_arg(args: Any) -> int | None:
    if isinstance(args, int):
        return args
    if isinstance(args, (list, tuple)) and args:
        try:
            return int(args[0])
        except (TypeError, ValueError):
            return None
    return None


def parse_broker_message(raw: str, *, queue: str, position: int) -> dict[str, Any] | None:
    # 从 Redis broker 消息解析任务摘要
    try:
        msg = json.loads(raw)
    except json.JSONDecodeError:
        return None

    headers = msg.get("headers") or {}
    props = msg.get("properties") or {}
    delivery = props.get("delivery_info") or {}
    task_id = str(headers.get("id") or "")
    task_name = str(headers.get("task") or "")
    args_repr = str(headers.get("argsrepr") or "")
    routing_key = str(delivery.get("routing_key") or queue)

    ref_id = None
    body = msg.get("body")
    if body:
        try:
            payload = json.loads(base64.b64decode(body).decode("utf-8"))
            args = payload[0] if isinstance(payload, (list, tuple)) and payload else None
            ref_id = _first_int_arg(args)
        except Exception:  # noqa: BLE001
            ref_id = None

    return {
        "task_id": task_id,
        "task_name": task_name,
        "label": task_label(task_name),
        "args_repr": args_repr,
        "queue": routing_key or queue,
        "state": "pending",
        "worker": None,
        "started_at": None,
        "ref_id": ref_id,
        "position": position,
    }


def _inspect_tasks(
    payload: dict[str, list[dict[str, Any]]] | None,
    *,
    state: str,
) -> list[dict[str, Any]]:
    if not payload:
        return []
    rows: list[dict[str, Any]] = []
    for worker_name, tasks in payload.items():
        for task in tasks or []:
            if not isinstance(task, dict):
                continue
            delivery = task.get("delivery_info") or {}
            queue = str(delivery.get("routing_key") or "")
            args = task.get("args")
            rows.append(
                {
                    "task_id": str(task.get("id") or ""),
                    "task_name": str(task.get("name") or ""),
                    "label": task_label(str(task.get("name") or "")),
                    "args_repr": str(task.get("args") or ""),
                    "queue": queue,
                    "state": state,
                    "worker": worker_name,
                    "started_at": task.get("time_start"),
                    "ref_id": _first_int_arg(args),
                    "position": None,
                }
            )
    return rows


def _celery_inspect_bundle() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    # 单次 inspect 拉取 active / reserved / stats，避免三次 RPC
    from app.workers.celery_app import celery_app

    inspect = celery_app.control.inspect(timeout=INSPECT_TIMEOUT_SEC)
    return (
        inspect.active() or {},
        inspect.reserved() or {},
        inspect.stats() or {},
    )


def _pools_from_stats(stats_map: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for worker_name, data in stats_map.items():
        if not isinstance(data, dict):
            continue
        pool = data.get("pool") or {}
        processes = pool.get("processes")
        proc_count = len(processes) if isinstance(processes, list) else None
        max_conc = pool.get("max-concurrency")
        try:
            max_conc_int = int(max_conc) if max_conc is not None else None
        except (TypeError, ValueError):
            max_conc_int = None
        rows.append(
            {
                "name": worker_name,
                "pool_implementation": str(pool.get("implementation") or ""),
                "max_concurrency": max_conc_int,
                "process_count": proc_count,
                "writes": pool.get("writes"),
            }
        )
    return rows


def _get_cached(key: str) -> dict[str, Any] | None:
    import time

    with _cache_lock:
        hit = _cache.get(key)
        if not hit:
            return None
        ts, payload = hit
        if time.time() - ts > CACHE_TTL_SEC:
            _cache.pop(key, None)
            return None
        return payload


def _set_cached(key: str, payload: dict[str, Any]) -> None:
    import time

    with _cache_lock:
        _cache[key] = (time.time(), payload)


def collect_queue_snapshot(
    *,
    include_inspect: bool = True,
    pending_sample_limit: int = PENDING_SAMPLE_LIMIT,
) -> dict[str, Any]:
    # 汇总 Redis 排队 + Celery worker 执行态（同步；调用方应 asyncio.to_thread）
    cache_key = f"detail={int(include_inspect)}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached
    settings = get_settings()
    monitor_queues = parse_worker_queues(
        (settings.celery_worker_queues or settings.celery_autoscale_queue or "").strip() or None
    )

    redis_ok = False
    unacked = 0
    queue_rows: list[dict[str, Any]] = []
    pending_tasks: list[dict[str, Any]] = []

    try:
        r = _redis_client()
        redis_ok = bool(r.ping())
        if redis_ok:
            try:
                unacked = int(r.hlen("unacked") or 0)
            except Exception:  # noqa: BLE001
                unacked = 0

            for qname in monitor_queues:
                try:
                    pending = int(r.llen(qname) or 0)
                except Exception:  # noqa: BLE001
                    pending = 0

                sample: list[dict[str, Any]] = []
                parse_limit = pending_sample_limit
                if qname == "oss" and pending > OSS_SAMPLE_MAX_PENDING:
                    parse_limit = 0
                if pending > 0 and parse_limit > 0:
                    raw_items = r.lrange(qname, 0, max(0, parse_limit - 1)) or []
                    for idx, raw in enumerate(raw_items):
                        row = parse_broker_message(str(raw), queue=qname, position=idx + 1)
                        if row:
                            sample.append(row)
                            pending_tasks.append(row)

                queue_rows.append(
                    {
                        "name": qname,
                        "label": queue_label(qname),
                        "pending": pending,
                        "sample": sample,
                    }
                )
    except Exception:  # noqa: BLE001
        logger.exception("queue monitor redis failed")
        redis_ok = False

    active_tasks: list[dict[str, Any]] = []
    reserved_tasks: list[dict[str, Any]] = []
    workers: list[dict[str, Any]] = []
    workers_online = 0
    stats_map: dict[str, Any] = {}
    active_map: dict[str, Any] = {}

    if include_inspect and settings.use_celery:
        try:
            active_map, reserved_map, stats_map = _celery_inspect_bundle()
            active_tasks = _inspect_tasks(active_map, state="active")
            reserved_tasks = _inspect_tasks(reserved_map, state="reserved")
            workers_online = len(stats_map)

            for worker_name, stats in stats_map.items():
                if not isinstance(stats, dict):
                    continue
                pool = stats.get("pool") or {}
                total = stats.get("total") or {}
                workers.append(
                    {
                        "name": worker_name,
                        "status": "online",
                        "active_count": len(active_map.get(worker_name) or []),
                        "processed": int(total.get("tasks.app.workers.tasks.run_pipeline_task", 0))
                        if isinstance(total, dict)
                        else None,
                        "pool": str(pool.get("implementation") or pool.get("max-concurrency") or ""),
                    }
                )
        except Exception:  # noqa: BLE001
            logger.exception("queue monitor celery inspect failed")

    total_pending = sum(int(q["pending"]) for q in queue_rows)
    payload = {
        "ok": True,
        "redis_ok": redis_ok,
        "use_celery": settings.use_celery,
        "worker_queues": settings.celery_worker_queues or settings.celery_autoscale_queue,
        "unacked": unacked,
        "total_pending": total_pending,
        "active_count": len(active_tasks),
        "reserved_count": len(reserved_tasks),
        "workers_online": workers_online,
        "queues": queue_rows,
        "pending_tasks": pending_tasks,
        "active_tasks": active_tasks,
        "reserved_tasks": reserved_tasks,
        "workers": workers,
        "autoscale": {
            "min": settings.celery_autoscale_min,
            "max": settings.celery_autoscale_max,
            "poll_sec": settings.celery_autoscale_poll_sec,
            "idle_sec": settings.celery_autoscale_idle_sec,
        },
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "inspect_included": include_inspect,
        "_inspect_stats": stats_map,
        "_inspect_active": active_map,
        "_inspect_pools": _pools_from_stats(stats_map) if stats_map else [],
    }
    _set_cached(cache_key, payload)
    return payload
