"""NIO-style Selector：集中非阻塞轮询 awaiting_poll 上游任务。"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models_tasks import TaskRun
from app.services.billing.settlement import settle_task
from app.services.tasks.service import append_task_event

logger = logging.getLogger("app.tasks.poller")

_poller_task: asyncio.Task | None = None
_stop_event = asyncio.Event()
_poll_inflight: set[int] = set()
_selector_sem: asyncio.Semaphore | None = None


# 启动 Selector 轮询循环。
async def start_poller() -> None:
    global _poller_task, _selector_sem
    if _poller_task and not _poller_task.done():
        return
    limit = max(1, int(get_settings().task_poll_max_concurrency or 20))
    _selector_sem = asyncio.Semaphore(limit)
    _stop_event.clear()
    _poller_task = asyncio.create_task(_poller_loop())


# 停止 Selector 轮询循环。
async def stop_poller() -> None:
    _stop_event.set()
    if _poller_task and not _poller_task.done():
        _poller_task.cancel()
        try:
            await _poller_task
        except asyncio.CancelledError:
            pass


# 返回 Selector 当前状态。
def poller_status() -> str:
    if _poller_task and not _poller_task.done():
        return "running"
    return "stopped"


# Selector 主循环：周期性 select 到期 channel。
async def _poller_loop() -> None:
    interval = max(1.0, float(get_settings().ark_video_poll_interval or 8.0))
    while not _stop_event.is_set():
        try:
            await _select_and_poll_due()
            await _poll_ephemeral_deferred_tasks()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("task selector failed")
        await asyncio.sleep(interval)


# 拉取到期 awaiting_poll 任务并并发非阻塞 poll（类似 NIO select + 就绪集合处理）。
async def _select_and_poll_due() -> None:
    now = datetime.now(UTC)
    batch_limit = max(1, int(get_settings().task_poll_max_concurrency or 20))
    async with AsyncSessionLocal() as db:
        stmt = (
            select(TaskRun.id)
            .where(
                TaskRun.status == "awaiting_poll",
                TaskRun.next_action_at.is_not(None),
                TaskRun.next_action_at <= now,
            )
            .order_by(TaskRun.next_action_at.asc(), TaskRun.id.asc())
            .limit(batch_limit)
        )
        task_ids = [int(item) for item in (await db.execute(stmt)).scalars().all()]

    if not task_ids:
        return

    async def _guarded_poll(task_id: int) -> None:
        if task_id in _poll_inflight:
            return
        _poll_inflight.add(task_id)
        sem = _selector_sem or asyncio.Semaphore(1)
        try:
            async with sem:
                await _poll_one_task(task_id)
        finally:
            _poll_inflight.discard(task_id)

    await asyncio.gather(*[_guarded_poll(task_id) for task_id in task_ids])


# 对单条已注册上游任务执行一次非阻塞状态查询。
async def _poll_one_task(task_id: int) -> None:
    from app.services.drama.jobs import poll_fragment_video_task

    async with AsyncSessionLocal() as db:
        task = await db.get(TaskRun, task_id)
        if not task or task.status != "awaiting_poll":
            return
        if not task.provider_task_id:
            task.status = "failed"
            task.error_code = "missing_provider_task_id"
            task.error_message = "缺少上游任务 ID，无法轮询"
            task.finished_at = datetime.now(UTC)
            await append_task_event(
                db,
                task.id,
                event_type="task.failed",
                status=task.status,
                phase=task.current_step_key,
                message=task.error_message,
            )
            try:
                await settle_task(db, task.id)
            except Exception:  # noqa: BLE001
                logger.exception("settle_task failed task_id=%s", task.id)
            await db.commit()
            return

    try:
        await poll_fragment_video_task(task_id)
    except Exception:  # noqa: BLE001
        logger.exception("selector poll failed task_id=%s", task_id)
        async with AsyncSessionLocal() as db:
            task = await db.get(TaskRun, task_id)
            if not task or task.status != "awaiting_poll":
                return
            poll_interval = max(1.0, float(get_settings().ark_video_poll_interval or 8.0))
            task.next_action_at = datetime.now(UTC) + timedelta(seconds=poll_interval)
            await db.commit()


# 后台轮询 api/studio 轻量视频任务：主动查上游终态，超时则失败并解冻。
async def _poll_ephemeral_deferred_tasks() -> None:
    from app.models import User
    from app.services.billing.ephemeral import settle_deferred_video_poll
    from app.services.studio_tools import poll_video_task

    now = datetime.now(UTC)
    timeout_sec = float(get_settings().ark_video_poll_timeout or 900.0)

    async with AsyncSessionLocal() as db:
        stmt = (
            select(TaskRun)
            .where(
                TaskRun.status == "awaiting_poll",
                TaskRun.domain.in_(["api", "studio"]),
                TaskRun.billing_status == "frozen",
            )
            .order_by(TaskRun.next_action_at.asc().nullsfirst(), TaskRun.id.asc())
            .limit(20)
        )
        rows = list((await db.execute(stmt)).scalars().all())

    for row in rows:
        task_id = int(row.id)
        async with AsyncSessionLocal() as db:
            task = await db.get(TaskRun, task_id)
            if not task or task.status != "awaiting_poll":
                continue

            started = task.started_at or task.created_at
            if started is not None and started.tzinfo is None:
                started = started.replace(tzinfo=UTC)
            if started and (now - started).total_seconds() > timeout_sec:
                task.status = "failed"
                task.error_code = "poll_timeout"
                task.error_message = "视频轮询超时，预扣已退回"
                task.finished_at = now
                await append_task_event(
                    db,
                    task.id,
                    event_type="task.failed",
                    status=task.status,
                    phase=task.current_step_key,
                    message=task.error_message,
                )
                try:
                    await settle_task(db, task.id)
                except Exception:  # noqa: BLE001
                    logger.exception("settle_task failed task_id=%s", task.id)
                await db.commit()
                continue

            user = await db.get(User, task.requested_by)
            provider_id = (task.provider_task_id or "").strip()
            if not user or not provider_id:
                continue

            data = await poll_video_task(user, provider_id)
            status = str(data.get("status") or "").strip().lower()
            if status in {"", "running", "queued"}:
                task.next_action_at = now + timedelta(
                    seconds=max(1.0, float(get_settings().ark_video_poll_interval or 8.0))
                )
                await db.commit()
                continue

            await settle_deferred_video_poll(
                db,
                user,
                provider_task_id=provider_id,
                poll_status=status,
                error=str(data.get("error") or "") or None,
                billing_task_id=task.id,
            )
            await db.commit()
