# Admin model / provider settings API
import logging
import time
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_admin
from app.models import User
from app.schemas_routing import AdminRoutingSettingsOut, AdminRoutingSettingsPatch, AdminRoutingSettingsSaveOut
from app.schemas_settings import (
    AdminModelSettingsImportEnvOut,
    AdminModelSettingsOut,
    AdminModelSettingsPatch,
    AdminModelSettingsSaveOut,
)
from app.services import storage
from app.services.model_settings import (
    get_admin_model_settings,
    get_admin_routing_settings,
    import_admin_model_settings_from_env,
    patch_admin_model_settings,
    patch_admin_routing_settings,
)
from app.services.upstream_model_catalog import list_upstream_models

router = APIRouter()
logger = logging.getLogger(__name__)

_SITE_QR_MAX_BYTES = 5 * 1024 * 1024
_SITE_QR_TYPES = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class AdminUpstreamModelsRequest(BaseModel):
    """按渠道凭证拉取上游 /models 目录。"""

    channel_id: str | None = Field(default=None, max_length=64)
    protocol: str = Field(default="auto", max_length=32)
    base_url: str = Field(default="", max_length=512)
    api_key: str | None = Field(default=None, max_length=512)
    capability: str = Field(default="all", max_length=32)


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


@router.post("/settings/upstream/models")
async def admin_list_upstream_models(
    body: AdminUpstreamModelsRequest,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """按渠道协议拉取上游可用模型（TokenFree / OpenAI 兼容）。"""
    try:
        models = await list_upstream_models(
            db,
            channel_id=body.channel_id,
            protocol=body.protocol,
            base_url=body.base_url,
            api_key_override=body.api_key,
            capability=body.capability,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"models": models}


@router.get("/settings/billing/model-rates")
async def admin_billing_model_rates(
    _admin: User = Depends(get_current_admin),
) -> dict:
    """拉取 TokenFree 官方价目，返回推荐文字/图/视频模型费率。"""
    from app.services.tokenfree_pricing import billing_official_rate_rows, tokenfree_pricing_url

    items = await billing_official_rate_rows()
    return {"items": items, "source": tokenfree_pricing_url()}


@router.get("/settings/tokenfree/quota")
async def admin_tokenfree_account_quota(
    _admin: User = Depends(get_current_admin),
) -> dict:
    """查询 TokenFree / New API 账户剩余额度（与模型页同一把 Key）。"""
    from app.services.tokenfree_usage import fetch_tokenfree_account, tokenfree_usage_configured

    if not tokenfree_usage_configured():
        raise HTTPException(status_code=400, detail="未配置 TokenFree API Key（请先在「模型」填写）")
    try:
        return await fetch_tokenfree_account()
    except RuntimeError as exc:
        logger.warning("tokenfree quota query failed: %s", exc)
        raise HTTPException(status_code=502, detail="TokenFree 额度查询失败") from exc


class WechatGroupQrUploadOut(BaseModel):
    """微信群二维码上传结果。"""

    ok: bool = True
    wechat_group_qr_url: str
    settings: AdminModelSettingsOut


@router.post("/settings/site/wechat-group-qr", response_model=WechatGroupQrUploadOut)
async def admin_upload_wechat_group_qr(
    file: UploadFile = File(...),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> WechatGroupQrUploadOut:
    """上传并替换官网微信用户群二维码（落盘 /static/site，写入 settings）。"""
    content_type = (file.content_type or "").lower()
    ext = _SITE_QR_TYPES.get(content_type)
    if not ext:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix in {".jpg", ".jpeg", ".png", ".webp"}:
            ext = ".jpg" if suffix == ".jpeg" else suffix
        else:
            raise HTTPException(status_code=400, detail="仅支持 JPG / PNG / WebP")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="空文件")
    if len(raw) > _SITE_QR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="图片不能超过 5MB")

    site_dir = storage.STATIC_ROOT / "site"
    site_dir.mkdir(parents=True, exist_ok=True)
    # 固定文件名覆盖，避免旧码残留；query 防 CDN 缓存
    dest = site_dir / f"wechat_group_qr{ext}"
    for stale in site_dir.glob("wechat_group_qr.*"):
        if stale.resolve() != dest.resolve():
            try:
                stale.unlink()
            except OSError:
                logger.warning("failed to remove old wechat qr %s", stale)
    dest.write_bytes(raw)
    published = storage.publish_local(dest, sync=True)
    # 相对路径加版本；完整 OSS URL 也追加，便于刷缓存
    sep = "&" if "?" in published else "?"
    url = f"{published}{sep}v={int(time.time())}"

    try:
        settings_out, _applied = await patch_admin_model_settings(
            db,
            AdminModelSettingsPatch(wechat_group_qr_url=url),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return WechatGroupQrUploadOut(wechat_group_qr_url=url, settings=settings_out)
