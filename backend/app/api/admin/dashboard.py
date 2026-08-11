# Dashboard stats for admin console
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_admin
from app.models import Order, Project, User
from app.schemas import AdminStatsOut

router = APIRouter()


@router.get("/stats", response_model=AdminStatsOut)
async def admin_stats(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminStatsOut:
    # Aggregate users, paid order amounts, project status histogram
    user_count = int((await db.execute(select(func.count()).select_from(User))).scalar_one() or 0)

    paid_total = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(Order.amount_fen), 0)).where(Order.status == "paid")
            )
        ).scalar_one()
        or 0
    )

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    paid_today = int(
        (
            await db.execute(
                select(func.coalesce(func.sum(Order.amount_fen), 0)).where(
                    Order.status == "paid",
                    Order.paid_at.is_not(None),
                    Order.paid_at >= today_start,
                )
            )
        ).scalar_one()
        or 0
    )

    status_rows = (
        await db.execute(select(Project.status, func.count()).group_by(Project.status))
    ).all()
    project_status_counts = {str(status): int(cnt) for status, cnt in status_rows}

    return AdminStatsOut(
        user_count=user_count,
        order_paid_total_fen=paid_total,
        order_paid_today_fen=paid_today,
        project_status_counts=project_status_counts,
    )
