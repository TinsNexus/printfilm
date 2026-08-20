"""Task scheduler that leases due tasks and starts in-process execution."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, or_, select, update

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models_tasks import TaskRun
from app.services.tasks.executor import execute_task_run
from app.services.tasks.service import append_task_event, count_user_active_runtime_tasks, reconcile_sequential_batches, reconcile_stale_pending_tasks

logger = logging.getLogger("app.tasks.scheduler")

_scheduler_task: asyncio.Task | None = None
_running_jobs: dict[int, asyncio.Task] = {}
_stop_event = asyncio.Event()


# 启动任务调度循环。
async def start_scheduler() -> None:
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        return
    await _recover_orphaned_tasks()
    _stop_event.clear()
    _scheduler_task = asyncio.create_task(_scheduler_loop())


# 停止任务调度循环并取消执行中的任务。
async def stop_scheduler() -> None:
    _stop_event.set()
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
    running_jobs = list(_running_jobs.values())
    for task in running_jobs:
        if not task.done():
            task.cancel()
    if running_jobs:
        await asyncio.gather(*running_jobs, return_exceptions=True)
    _running_jobs.clear()


# 返回当前运行中的平台任务数量。
def running_count() -> int:
    return sum(1 for task in _running_jobs.values() if not task.done())


# 周期扫描到期任务并交给执行器。
async def _scheduler_loop() -> None:
    while not _stop_event.is_set():
        try:
            await _tick()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("task scheduler tick failed")
        await asyncio.sleep(1.0)


# 扫描并租约抢占可执行任务。
async def _tick() -> None:
    now = datetime.now(UTC)
    async with AsyncSessionLocal() as db:
        await reconcile_sequential_batches(db)
        await reconcile_stale_pending_tasks(db)
    for task_id, job in list(_running_jobs.items()):
        if job.done():
            _running_jobs.pop(task_id, None)
    async with AsyncSessionLocal() as db:
        cancel_stmt = select(TaskRun.id).where(TaskRun.status == "cancel_requested")
        cancel_ids = [int(item) for item in (await db.execute(cancel_stmt)).scalars().all()]
    for task_id in cancel_ids:
        await cancel_running_task(task_id)

    capacity = max(1, int(get_settings().task_runtime_max_concurrency))
    user_limit = max(1, int(get_settings().task_user_max_concurrency))
    available_slots = max(0, capacity - running_count())
    if available_slots <= 0:
        return

    claimed_ids: list[int] = []
    async with AsyncSessionLocal() as db:
        stmt = (
            select(TaskRun.id, TaskRun.status, TaskRun.requested_by)
            .where(
                TaskRun.status.in_(("pending", "cancel_requested")),
                TaskRun.next_action_at.is_not(None),
                TaskRun.next_action_at <= now,
            )
            .order_by(TaskRun.priority.asc(), TaskRun.created_at.asc(), TaskRun.id.asc())
            .limit(max(available_slots * 4, available_slots))
        )
        candidates = list((await db.execute(stmt)).all())
        user_active_cache: dict[int, int] = {}
        for row in candidates:
            if len(claimed_ids) >= available_slots:
                break
            task_id = int(row.id)
            current_status = str(row.status)
            user_id = int(row.requested_by)
            if task_id in _running_jobs and not _running_jobs[task_id].done():
                continue
            if user_id not in user_active_cache:
                user_active_cache[user_id] = await count_user_active_runtime_tasks(db, user_id)
            if user_active_cache[user_id] >= user_limit:
                continue
            lease_token = uuid.uuid4().hex
            next_status = "leased" if current_status != "cancel_requested" else "cancel_requested"
            claim = (
                update(TaskRun)
                .where(TaskRun.id == task_id, TaskRun.status == current_status)
                .values(
                    status=next_status,
                    lease_token=lease_token,
                    lease_until=now + timedelta(minutes=10),
                )
            )
            result = await db.execute(claim)
            if int(result.rowcount or 0) != 1:
                continue
            task = await db.get(TaskRun, task_id)
            await append_task_event(
                db,
                task_id,
                event_type="task.leased",
                status=next_status,
                phase=getattr(task, "current_step_key", None),
                message="任务已被调度器领取",
            )
            claimed_ids.append(task_id)
            user_active_cache[user_id] += 1
        if claimed_ids:
            await db.commit()

    for task_id in claimed_ids:
        if task_id in _running_jobs and not _running_jobs[task_id].done():
            continue
        _running_jobs[task_id] = asyncio.create_task(_run_one(task_id))


# 包装执行器并在结束后释放运行槽位。
async def _run_one(task_id: int) -> None:
    try:
        await execute_task_run(task_id)
    finally:
        _running_jobs.pop(task_id, None)


# 取消指定任务的本地执行协程。
async def cancel_running_task(task_id: int) -> bool:
    task = _running_jobs.get(task_id)
    if not task or task.done():
        return False
    task.cancel()
    return True


# 启动时把上次进程中断留下的 leased/running 任务放回待执行队列。
async def _recover_orphaned_tasks() -> None:
    now = datetime.now(UTC)
    grace_sec = max(5, int(get_settings().task_runtime_recover_grace_sec))
    stale_before = now - timedelta(seconds=grace_sec)
    async with AsyncSessionLocal() as db:
        await reconcile_sequential_batches(db)
        await reconcile_stale_pending_tasks(db)
        stmt = select(TaskRun).where(
            or_(
                and_(TaskRun.status == "leased", TaskRun.updated_at.is_not(None), TaskRun.updated_at < stale_before),
                and_(TaskRun.status == "running", TaskRun.updated_at.is_not(None), TaskRun.updated_at < stale_before),
            )
        )
        rows = list((await db.execute(stmt)).scalars().all())
        changed = 0
        for task in rows:
            task.status = "cancel_requested" if task.cancel_requested else "pending"
            task.next_action_at = now
            task.lease_token = None
            task.lease_until = None
            await append_task_event(
                db,
                task.id,
                event_type="task.recovered",
                status=task.status,
                phase=task.current_step_key,
                message="检测到任务在上次进程退出时中断，已重新排队",
            )
            changed += 1
        if changed:
            await db.commit()
            logger.warning("recovered orphaned task runs count=%s", changed)
