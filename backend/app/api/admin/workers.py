# Admin worker control API
from fastapi import APIRouter, Depends, HTTPException

from app.deps import get_current_admin
from app.models import User
from app.schemas import (
    AdminAutoscalePatch,
    AdminWorkerActionOut,
    AdminWorkerControlOut,
)
from app.services.worker_manager import (
    get_worker_control_status,
    pool_grow,
    pool_shrink,
    restart_systemd_worker,
    start_autoscale_daemon,
    stop_autoscale_daemon,
    update_autoscale_config,
)

router = APIRouter()


@router.get("/workers", response_model=AdminWorkerControlOut)
async def admin_worker_status(_admin: User = Depends(get_current_admin)) -> AdminWorkerControlOut:
    # Worker 管理模式与 pool 状态
    return AdminWorkerControlOut.model_validate(get_worker_control_status())


@router.post("/workers/pool-grow", response_model=AdminWorkerActionOut)
async def admin_pool_grow(
    n: int = 1,
    _admin: User = Depends(get_current_admin),
) -> AdminWorkerActionOut:
    try:
        result = pool_grow(n=n)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    result["control"] = get_worker_control_status()
    return AdminWorkerActionOut.model_validate(result)


@router.post("/workers/pool-shrink", response_model=AdminWorkerActionOut)
async def admin_pool_shrink(
    n: int = 1,
    _admin: User = Depends(get_current_admin),
) -> AdminWorkerActionOut:
    try:
        result = pool_shrink(n=n)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    result["control"] = get_worker_control_status()
    return AdminWorkerActionOut.model_validate(result)


@router.post("/workers/restart", response_model=AdminWorkerActionOut)
async def admin_worker_restart(_admin: User = Depends(get_current_admin)) -> AdminWorkerActionOut:
    try:
        result = restart_systemd_worker()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    result["control"] = get_worker_control_status()
    return AdminWorkerActionOut.model_validate(result)


@router.patch("/workers/autoscale", response_model=AdminWorkerActionOut)
async def admin_autoscale_patch(
    body: AdminAutoscalePatch,
    _admin: User = Depends(get_current_admin),
) -> AdminWorkerActionOut:
    result = update_autoscale_config(
        min_workers=body.min_workers,
        max_workers=body.max_workers,
        enabled=body.enabled,
    )
    result["control"] = get_worker_control_status()
    return AdminWorkerActionOut.model_validate(result)


@router.post("/workers/autoscale/start", response_model=AdminWorkerActionOut)
async def admin_autoscale_start(_admin: User = Depends(get_current_admin)) -> AdminWorkerActionOut:
    try:
        result = start_autoscale_daemon()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    result["control"] = get_worker_control_status()
    return AdminWorkerActionOut.model_validate(result)


@router.post("/workers/autoscale/stop", response_model=AdminWorkerActionOut)
async def admin_autoscale_stop(_admin: User = Depends(get_current_admin)) -> AdminWorkerActionOut:
    try:
        result = stop_autoscale_daemon()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    result["control"] = get_worker_control_status()
    return AdminWorkerActionOut.model_validate(result)
