"""In-process task executor for the de-workerized task platform."""

from __future__ import annotations

from datetime import UTC, datetime

from app.database import AsyncSessionLocal
from app.services.tasks.handlers import get_task_handler
from app.services.tasks.service import append_task_event, get_task_for_runtime, set_task_step_state


# 执行单个任务并回写平台状态。
async def execute_task_run(task_id: int) -> None:
    async with AsyncSessionLocal() as db:
        task = await get_task_for_runtime(db, task_id)
        if not task:
            return
        if task.cancel_requested and task.status == "cancel_requested":
            await _mark_cancelled(db, task)
            return
        handler = get_task_handler(task.domain, task.task_type)
        if handler is None:
            task.status = "failed"
            task.error_code = "handler_missing"
            task.error_message = f"未注册任务处理器: {task.domain}/{task.task_type}"
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
        step = task.steps[0] if task.steps else None
        now = datetime.now(UTC)
        task.status = "running"
        task.started_at = task.started_at or now
        task.next_action_at = None
        task.lease_until = None
        set_task_step_state(task, step, status="submitting", now=now)
        await append_task_event(
            db,
            task.id,
            event_type="task.started",
            status=task.status,
            phase=task.current_step_key,
            message="任务开始执行",
        )
        await db.commit()

    try:
        async with AsyncSessionLocal() as db:
            task = await get_task_for_runtime(db, task_id)
            if not task:
                return
            handler = get_task_handler(task.domain, task.task_type)
            result = await handler.executor(task) if handler else {"ok": False, "error": "missing_handler"}
            task = await get_task_for_runtime(db, task_id)
            if not task:
                return
            # handler 在独立 session 提交后，本 session 可能仍缓存 running（expire_on_commit=False）
            await db.refresh(task)
            if isinstance(result, dict) and (result.get("deferred") or result.get("awaiting_poll")):
                return
            if task.status == "awaiting_poll":
                return
            if task.status == "pending" and isinstance(result, dict) and result.get("deferred"):
                return
            if isinstance(result, dict) and result.get("cancelled"):
                await _mark_cancelled(db, task)
                return
            await _complete_task(db, task, result or {"ok": True})
    except asyncio.CancelledError:
        async with AsyncSessionLocal() as db:
            task = await get_task_for_runtime(db, task_id)
            if task:
                if task.cancel_requested:
                    await _mark_cancelled(db, task)
                else:
                    await _requeue_interrupted_task(db, task)
        raise
    except Exception as exc:  # noqa: BLE001
        async with AsyncSessionLocal() as db:
            task = await get_task_for_runtime(db, task_id)
            if task:
                await _fail_task(db, task, exc)


import asyncio


# 把任务收敛到成功态。
async def _complete_task(db, task, result: dict) -> None:
    now = datetime.now(UTC)
    step = task.steps[0] if task.steps else None
    set_task_step_state(task, step, status="done", now=now)
    task.status = "cancelled" if task.cancel_requested else "succeeded"
    task.progress_percent = 100 if task.status == "succeeded" else task.progress_percent
    task.result_payload = result
    task.error_code = None
    task.error_message = None
    task.finished_at = now
    await append_task_event(
        db,
        task.id,
        event_type="task.completed" if task.status == "succeeded" else "task.cancelled",
        status=task.status,
        phase=task.current_step_key,
        message="任务执行完成" if task.status == "succeeded" else "任务已取消",
        payload=result,
    )
    await db.commit()


# 把任务收敛到失败态。
async def _fail_task(db, task, exc: Exception) -> None:
    now = datetime.now(UTC)
    step = task.steps[0] if task.steps else None
    set_task_step_state(task, step, status="failed", now=now)
    task.status = "failed"
    task.error_code = type(exc).__name__
    task.error_message = str(exc)[:500]
    task.finished_at = now
    await append_task_event(
        db,
        task.id,
        event_type="task.failed",
        status=task.status,
        phase=task.current_step_key,
        message=task.error_message,
    )
    if task.fragment_id:
        from app.models_drama import DramaEpisodeFragment

        frag = await db.get(DramaEpisodeFragment, int(task.fragment_id))
        if frag:
            params = dict(frag.params or {})
            params["generation"] = {
                "status": "failed",
                "error": task.error_message,
            }
            frag.params = params
    # 科普拼接/流水线失败时同步项目态，避免卡在 COMPOSING 等 running 状态无法重试
    if task.domain == "kepu" and task.project_id:
        from app.models import Project, ProjectStatus

        running = {
            ProjectStatus.SCRIPTING,
            ProjectStatus.IMAGING,
            ProjectStatus.VIDEOING,
            ProjectStatus.AUDIOING,
            ProjectStatus.COMPOSING,
            ProjectStatus.AUDITING,
        }
        project = await db.get(Project, int(task.project_id))
        if project and project.status in running:
            project.status = ProjectStatus.FAILED
            project.error_msg = (task.error_message or str(exc))[:2000]
    payload = task.payload if isinstance(task.payload, dict) else {}
    if payload.get("sequential") and task.batch_key:
        from app.services.tasks.service import fail_remaining_sequential_batch

        batch_index = int(payload.get("batch_index", 0))
        await fail_remaining_sequential_batch(
            db,
            task.batch_key,
            batch_index,
            "上一镜失败，无法衔接尾帧",
        )
    await db.commit()


# 把任务收敛到取消态。
async def _mark_cancelled(db, task) -> None:
    now = datetime.now(UTC)
    step = task.steps[0] if task.steps else None
    set_task_step_state(task, step, status="cancelled", now=now)
    task.status = "cancelled"
    task.finished_at = now
    task.next_action_at = None
    task.lease_until = None
    await append_task_event(
        db,
        task.id,
        event_type="task.cancelled",
        status=task.status,
        phase=task.current_step_key,
        message="任务已取消",
    )
    await db.commit()


# 应用重启或热更新中断时，把任务重新放回待执行状态。
async def _requeue_interrupted_task(db, task) -> None:
    now = datetime.now(UTC)
    step = task.steps[0] if task.steps else None
    set_task_step_state(task, step, status="pending", now=now)
    task.status = "pending"
    task.next_action_at = now
    task.lease_token = None
    task.lease_until = None
    await append_task_event(
        db,
        task.id,
        event_type="task.requeued",
        status=task.status,
        phase=task.current_step_key,
        message="任务被中断，已重新排队",
    )
    await db.commit()
