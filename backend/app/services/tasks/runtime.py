"""Lifecycle helpers for the in-process task runtime."""

from __future__ import annotations

from app.services.tasks.poller import poller_status, start_poller, stop_poller
from app.services.tasks.scheduler import running_count, start_scheduler, stop_scheduler


# 启动统一任务平台运行时（Worker 调度 + Selector 轮询）。
async def start_task_runtime() -> None:
    await start_scheduler()
    await start_poller()


# 停止统一任务平台运行时。
async def stop_task_runtime() -> None:
    await stop_poller()
    await stop_scheduler()


# 返回任务平台运行时摘要（Worker 槽位 + Selector 状态）。
def runtime_summary() -> dict[str, int | str]:
    return {
        "scheduler_running_jobs": running_count(),
        "poller": poller_status(),
    }
