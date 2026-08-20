"""NIO-style Selector：集中非阻塞轮询 awaiting_poll 上游任务。"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models_tasks import TaskRun
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
