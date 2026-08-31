"""任务计费 settlement 单元测试（无 DB 依赖）。"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models import User
from app.models_tasks import TaskRun
from app.services.billing.http import http_exception_for_value_error
from app.services.billing.settlement import billing_active, freeze_for_task


def test_billing_active_respects_unlimited() -> None:
    user = User(id=1, billing_unlimited=True)
    assert billing_active(user) is False


def test_http_exception_maps_insufficient_balance_to_402() -> None:
    exc = http_exception_for_value_error(ValueError("余额不足：需要 ¥1.00，当前 ¥0.00，请先充值"))
    assert exc.status_code == 402
    assert "余额不足" in exc.detail


def test_http_exception_maps_other_value_error_to_400() -> None:
    exc = http_exception_for_value_error(ValueError("参数错误"))
    assert exc.status_code == 400


@pytest.mark.asyncio
async def test_freeze_for_task_idempotent_when_already_frozen() -> None:
    """多阶段任务重入时不应重复扣款。"""
    task = TaskRun(
        id=99,
        domain="drama",
        task_type="fragment_video",
        requested_by=1,
        billing_status="frozen",
        billing_estimate_fen=500,
    )
    result = MagicMock()
    result.scalar_one_or_none = MagicMock(return_value=task)
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    db.flush = AsyncMock()

    need = await freeze_for_task(db, task)

    assert need == 500
    assert task.billing_status == "frozen"
    # 幂等早退：不应再查用户或写 ledger
    assert db.execute.await_count == 1
    db.flush.assert_not_awaited()
