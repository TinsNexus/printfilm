# Dashboard stats for admin console
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_admin
from app.models import User
from app.schemas import (
    AdminDailyUsageOut,
    AdminStatsOut,
    AdminTopUserOut,
    AdminUsageBucketOut,
)
from app.services.admin.stats import build_admin_dashboard_stats

router = APIRouter()


@router.get("/stats", response_model=AdminStatsOut)
async def admin_stats(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminStatsOut:
    """用户/充值 + AI 调用量/费用/趋势/排行。"""
    raw = await build_admin_dashboard_stats(db)
    return AdminStatsOut(
        user_count=raw["user_count"],
        order_paid_total_fen=raw["order_paid_total_fen"],
        order_paid_today_fen=raw["order_paid_today_fen"],
        project_status_counts=raw["project_status_counts"],
        drama_project_count=raw["drama_project_count"],
        usage_calls_today=raw["usage_calls_today"],
        usage_calls_month=raw["usage_calls_month"],
        usage_calls_total=raw["usage_calls_total"],
        usage_charge_today_fen=raw["usage_charge_today_fen"],
        usage_charge_month_fen=raw["usage_charge_month_fen"],
        usage_charge_total_fen=raw["usage_charge_total_fen"],
        usage_cost_today_fen=raw["usage_cost_today_fen"],
        usage_cost_month_fen=raw["usage_cost_month_fen"],
        usage_cost_total_fen=raw["usage_cost_total_fen"],
        usage_by_capability=[AdminUsageBucketOut(**x) for x in raw["usage_by_capability"]],
        usage_by_domain=[AdminUsageBucketOut(**x) for x in raw["usage_by_domain"]],
        daily_usage=[AdminDailyUsageOut(**x) for x in raw["daily_usage"]],
        top_users_by_charge=[AdminTopUserOut(**x) for x in raw["top_users_by_charge"]],
    )
