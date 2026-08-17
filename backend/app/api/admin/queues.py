# Admin queue monitoring API
import asyncio

from fastapi import APIRouter, Depends, Query

from app.deps import get_current_admin
from app.models import User
from app.schemas import AdminQueuesOut
from app.services.queue_monitor import collect_queue_snapshot
from app.services.worker_manager import get_worker_control_status

router = APIRouter()


def _build_queues_response(*, detail: bool) -> dict:
    data = collect_queue_snapshot(include_inspect=detail)
    pools = data.pop("_inspect_pools", None)
    data.pop("_inspect_stats", None)
    data.pop("_inspect_active", None)
    data.pop("inspect_included", None)
    data["worker_control"] = get_worker_control_status(
        pools=pools if detail else None,
        skip_inspect=not detail,
    )
    return data


@router.get("/queues", response_model=AdminQueuesOut)
async def admin_queues(
    detail: bool = Query(default=False, description="true=含 Celery inspect 任务明细，较慢"),
    _admin: User = Depends(get_current_admin),
) -> AdminQueuesOut:
    # 队列监控：默认轻量（仅 Redis 计数）；detail=1 才拉 worker 执行态
    data = await asyncio.to_thread(_build_queues_response, detail=detail)
    return AdminQueuesOut.model_validate(data)
