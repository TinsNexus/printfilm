# -*- coding: utf-8 -*-
"""任务计费上下文：当前 task_run_id。"""
from __future__ import annotations

from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import AsyncIterator

_current_task_run_id: ContextVar[int | None] = ContextVar("billing_task_run_id", default=None)


def get_current_task_run_id() -> int | None:
    return _current_task_run_id.get()


def set_current_task_run_id(task_run_id: int | None) -> None:
    _current_task_run_id.set(task_run_id)


async def _lookup_task_plan(task_run_id: int) -> str | None:
    """9Router 按套餐选 Key：取任务发起人的 users.plan；未配置套餐 Key 时直接跳过查询。"""
    from app.config import get_settings
    from app.services.nine_router.config import is_9router_active

    s = get_settings()
    if not is_9router_active(s) or not (getattr(s, "ninerouter_plan_keys", "") or "").strip():
        return None
    try:
        from sqlalchemy import select

        from app.database import AsyncSessionLocal
        from app.models import User
        from app.models_tasks import TaskRun

        async with AsyncSessionLocal() as db:
            row = await db.execute(
                select(User.plan).join(TaskRun, TaskRun.requested_by == User.id).where(TaskRun.id == task_run_id)
            )
            return row.scalar_one_or_none()
    except Exception:  # noqa: BLE001 — 查不到套餐就用默认 Key，不影响任务
        return None


@asynccontextmanager
async def billing_scope(task_run_id: int | None, user_plan: str | None = None) -> AsyncIterator[None]:
    token = _current_task_run_id.set(task_run_id)
    plan_token = None
    if task_run_id:
        from app.services.nine_router.plan_keys import reset_current_plan, set_current_plan

        # 轻量任务在同一事务内刚 flush，别的会话查不到，调用方直接传入 user.plan
        plan = user_plan or await _lookup_task_plan(task_run_id)
        if plan:
            plan_token = set_current_plan(plan)
    try:
        yield
    finally:
        _current_task_run_id.reset(token)
        if plan_token is not None:
            reset_current_plan(plan_token)
