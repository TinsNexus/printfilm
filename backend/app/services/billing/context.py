# -*- coding: utf-8 -*-
"""任务计费上下文：当前 task_run_id。"""
from __future__ import annotations

from contextlib import asynccontextmanager
from contextvars import ContextVar
from typing import AsyncIterator

_current_task_run_id: ContextVar[int | None] = ContextVar("billing_task_run_id", default=None)
_current_team_id: ContextVar[int | None] = ContextVar("billing_team_id", default=None)


def get_current_task_run_id() -> int | None:
    return _current_task_run_id.get()


def get_current_team_id() -> int | None:
    return _current_team_id.get()


def set_current_team_id(team_id: int | None) -> None:
    _current_team_id.set(team_id)


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
async def billing_scope(task_run_id: int | None, *, team_id: int | None = None, snapshot: dict | None = None, user_plan: str | None = None) -> AsyncIterator[None]:
    # Nested contexts for the same task retain its team unless explicitly supplied.
    current_team = _current_team_id.get() if _current_task_run_id.get() == task_run_id else None
    from app.services.media_models.runtime import current_snapshot, current_operation
    inherited = current_snapshot.get() if _current_task_run_id.get() == task_run_id else None
    media_token = current_snapshot.set(snapshot if snapshot is not None else inherited)
    operation_token = current_operation.set(None)
    token = _current_task_run_id.set(task_run_id)
    team_token = _current_team_id.set(team_id if team_id is not None else current_team)
    plan_token = None
    if task_run_id:
        from app.services.nine_router.plan_keys import set_current_plan

        # 轻量任务在同一事务内刚 flush，别的会话查不到，调用方直接传入 user.plan
        plan = user_plan or await _lookup_task_plan(task_run_id)
        if plan:
            plan_token = set_current_plan(plan)
    try:
        yield
    finally:
        current_operation.reset(operation_token)
        current_snapshot.reset(media_token)
        _current_team_id.reset(team_token)
        _current_task_run_id.reset(token)
        if plan_token is not None:
            from app.services.nine_router.plan_keys import reset_current_plan

            reset_current_plan(plan_token)
