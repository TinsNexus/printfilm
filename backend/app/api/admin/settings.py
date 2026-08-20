# Admin model / provider settings API
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_admin
from app.models import User
from app.schemas_routing import AdminRoutingSettingsOut, AdminRoutingSettingsPatch, AdminRoutingSettingsSaveOut
from app.schemas_settings import AdminModelSettingsOut, AdminModelSettingsPatch, AdminModelSettingsSaveOut, AdminModelSettingsImportEnvOut
from app.services.model_settings import (
    get_admin_model_settings,
    get_admin_routing_settings,
    import_admin_model_settings_from_env,
    patch_admin_model_settings,
    patch_admin_routing_settings,
)

router = APIRouter()


@router.get("/settings/routing", response_model=AdminRoutingSettingsOut)
async def admin_get_routing_settings(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminRoutingSettingsOut:
    # 读取渠道 + 逻辑模型 + 默认模型完整路由配置
    return await get_admin_routing_settings(db)


@router.patch("/settings/routing", response_model=AdminRoutingSettingsSaveOut)
async def admin_patch_routing_settings(
    body: AdminRoutingSettingsPatch,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminRoutingSettingsSaveOut:
    # 保存渠道与逻辑路由；保存时自动 sync 逻辑模型绑定
    try:
        settings, applied = await patch_admin_routing_settings(db, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AdminRoutingSettingsSaveOut(settings=settings, applied=applied)


@router.get("/settings/models", response_model=AdminModelSettingsOut)
async def admin_get_model_settings(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminModelSettingsOut:
    # 读取当前生效的模型配置（DB 优先，env 兜底）
    return await get_admin_model_settings(db)


@router.patch("/settings/models", response_model=AdminModelSettingsSaveOut)
async def admin_patch_model_settings(
    body: AdminModelSettingsPatch,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminModelSettingsSaveOut:
    # 部分更新模型配置；密钥留空表示不修改
    try:
        settings, applied = await patch_admin_model_settings(db, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return AdminModelSettingsSaveOut(settings=settings, applied_fields=applied)


@router.post("/settings/models/import-env", response_model=AdminModelSettingsImportEnvOut)
async def admin_import_model_settings_from_env(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminModelSettingsImportEnvOut:
    # 一键将 .env / 环境变量中的可管理项导入 DB（空密钥跳过，避免覆盖已有密文）
    settings, imported, skipped = await import_admin_model_settings_from_env(db)
    return AdminModelSettingsImportEnvOut(
        settings=settings,
        imported_fields=imported,
        skipped_secret_fields=skipped,
    )
