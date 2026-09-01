"""管理端仪表盘 / 项目用量聚合：日趋势、补零、Top10、能力分解。"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UsageEvent
from app.services.admin.stats import aggregate_usage_summary, build_admin_dashboard_stats
from tests.conftest import make_user


def _utc_days_ago(days: int, *, hour: int = 12) -> datetime:
    base = datetime.now(timezone.utc).replace(hour=hour, minute=0, second=0, microsecond=0)
    return base - timedelta(days=days)


async def _add_usage(
    db: AsyncSession,
    *,
    user_id: int,
    charge_fen: int,
    cost_fen: int = 0,
    created_at: datetime | None = None,
    capability: str = "llm",
    domain: str = "drama",
    billing_key: str = "llm_chat",
    project_id: int | None = None,
    drama_project_id: int | None = None,
    total_tokens: int = 100,
) -> UsageEvent:
    """写入一条用量事件。"""
    ev = UsageEvent(
        user_id=user_id,
        project_id=project_id,
        drama_project_id=drama_project_id,
        domain=domain,
        capability=capability,
        billing_key=billing_key,
        model="test-model",
        prompt_tokens=total_tokens,
        completion_tokens=0,
        total_tokens=total_tokens,
        charge_fen=charge_fen,
        cost_fen=cost_fen,
        estimated=False,
        settled=True,
    )
    if created_at is not None:
        ev.created_at = created_at
    db.add(ev)
    await db.flush()
    return ev


@pytest.mark.asyncio
async def test_dashboard_daily_usage_pads_seven_days(db_session: AsyncSession) -> None:
    """近 7 日趋势固定 7 行，无数据的日期补零。"""
    user = await make_user(db_session)
    await _add_usage(
        db_session,
        user_id=user.id,
        charge_fen=50,
        cost_fen=20,
        created_at=_utc_days_ago(0),
        capability="image",
        billing_key="seedream",
    )
    await _add_usage(
        db_session,
        user_id=user.id,
        charge_fen=30,
        created_at=_utc_days_ago(2),
        capability="video",
        billing_key="seedance2:video0",
        domain="kepu",
    )
    await db_session.commit()

    stats = await build_admin_dashboard_stats(db_session)
    daily = stats["daily_usage"]
    assert len(daily) == 7
    assert all("date" in d and "calls" in d and "charge_fen" in d for d in daily)
    # 日期升序且连续
    dates = [d["date"] for d in daily]
    assert dates == sorted(dates)
    today_key = _utc_days_ago(0).date().isoformat()
    two_ago = _utc_days_ago(2).date().isoformat()
    by_day = {d["date"]: d for d in daily}
    assert by_day[today_key]["calls"] == 1
    assert by_day[today_key]["charge_fen"] == 50
    assert by_day[two_ago]["calls"] == 1
    assert by_day[two_ago]["charge_fen"] == 30
    empty_days = [d for d in daily if d["date"] not in {today_key, two_ago}]
    assert all(d["calls"] == 0 and d["charge_fen"] == 0 for d in empty_days)

    assert stats["usage_calls_total"] == 2
    assert stats["usage_charge_total_fen"] == 80
    assert stats["usage_cost_total_fen"] == 20
    assert stats["usage_calls_today"] == 1
    assert stats["usage_charge_today_fen"] == 50


@pytest.mark.asyncio
async def test_dashboard_top_users_by_charge(db_session: AsyncSession) -> None:
    """近 30 日按扣费排序，最多 10 人。"""
    high = await make_user(db_session)
    low = await make_user(db_session)
    await _add_usage(db_session, user_id=high.id, charge_fen=900, created_at=_utc_days_ago(1))
    await _add_usage(db_session, user_id=high.id, charge_fen=100, created_at=_utc_days_ago(5))
    await _add_usage(db_session, user_id=low.id, charge_fen=10, created_at=_utc_days_ago(1))
    await db_session.commit()

    stats = await build_admin_dashboard_stats(db_session)
    top = stats["top_users_by_charge"]
    assert len(top) >= 2
    assert top[0]["user_id"] == high.id
    assert top[0]["charge_fen"] == 1000
    assert top[0]["calls"] == 2
    assert top[0]["email"] == high.email
    assert top[1]["user_id"] == low.id
    assert top[1]["charge_fen"] == 10


@pytest.mark.asyncio
async def test_aggregate_usage_summary_breakdown(db_session: AsyncSession) -> None:
    """单项目用量拆分图/视/LLM/TTS。"""
    user = await make_user(db_session)
    pid = 42
    await _add_usage(
        db_session, user_id=user.id, project_id=pid, charge_fen=10, billing_key="seedream", capability="image"
    )
    await _add_usage(
        db_session,
        user_id=user.id,
        project_id=pid,
        charge_fen=20,
        billing_key="seedance2:video0",
        capability="video",
    )
    await _add_usage(
        db_session, user_id=user.id, project_id=pid, charge_fen=5, billing_key="llm_chat", capability="llm"
    )
    await _add_usage(
        db_session, user_id=user.id, project_id=pid, charge_fen=3, billing_key="tts", capability="tts"
    )
    # 其他项目不应计入
    await _add_usage(
        db_session, user_id=user.id, project_id=99, charge_fen=999, billing_key="seedream", capability="image"
    )
    await db_session.commit()

    summary = await aggregate_usage_summary(db_session, project_id=pid)
    assert summary["calls"] == 4
    assert summary["charge_fen"] == 38
    assert summary["image_gens"] == 1
    assert summary["video_gens"] == 1
    assert summary["llm_calls"] == 1
    assert summary["tts_gens"] == 1

    batch = await aggregate_usage_summary(db_session, project_ids=[pid, 99, 7])
    assert batch[pid]["tts_gens"] == 1
    assert batch[99]["image_gens"] == 1
    assert batch[99]["charge_fen"] == 999
    assert batch[7]["calls"] == 0
    assert batch[7]["tts_gens"] == 0


@pytest.mark.asyncio
async def test_aggregate_drama_project_usage(db_session: AsyncSession) -> None:
    """漫剧项目按 drama_project_id 聚合。"""
    user = await make_user(db_session)
    did = 7
    await _add_usage(
        db_session,
        user_id=user.id,
        drama_project_id=did,
        charge_fen=15,
        cost_fen=8,
        billing_key="tts",
        capability="tts",
        total_tokens=50,
    )
    await db_session.commit()

    summary = await aggregate_usage_summary(db_session, drama_project_id=did)
    assert summary["calls"] == 1
    assert summary["charge_fen"] == 15
    assert summary["cost_fen"] == 8
    assert summary["tokens"] == 50
    assert summary["tts_gens"] == 1
