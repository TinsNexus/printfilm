"""Drama asset endpoints."""

from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.models_drama import DramaAsset
from app.schemas_drama import DramaAssetCreate, DramaAssetOut, DramaAssetUpdate, SeedAssetsFromScriptOut
from app.services.drama.access import get_owned_drama_project
from app.services.drama.seed import seed_assets_from_script

router = APIRouter()


@router.get("/assets", response_model=list[DramaAssetOut])
async def list_assets(
    project_id: int | None = None,
    library_only: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DramaAssetOut]:
    # Global library = all assets of user's drama projects; optional project filter
    from app.models_drama import DramaProject

    q = (
        select(DramaAsset)
        .join(DramaProject, DramaAsset.project_id == DramaProject.id)
        .where(DramaProject.user_id == user.id)
        .order_by(DramaAsset.updated_at.desc())
    )
    if project_id is not None:
        q = q.where(DramaAsset.project_id == project_id)
    rows = list((await db.execute(q)).scalars().all())
    if library_only:
        canvas_only_types = {"video", "audio", "text"}
        rows = [
            asset
            for asset in rows
            if (asset.type or "").lower() not in canvas_only_types
            and (asset.asset_type or "").lower() != "video"
        ]
    return [DramaAssetOut.model_validate(a) for a in rows]


@router.post("/assets", response_model=DramaAssetOut)
async def create_asset(
    body: DramaAssetCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DramaAssetOut:
    await get_owned_drama_project(db, body.project_id, user)
    asset = DramaAsset(
        project_id=body.project_id,
        type=body.type,
        asset_type=body.asset_type,
        name=body.name,
        cover=body.cover,
        url=body.url,
        params=body.params,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return DramaAssetOut.model_validate(asset)


@router.patch("/assets/{asset_id}", response_model=DramaAssetOut)
async def update_asset(
    asset_id: int,
    body: DramaAssetUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DramaAssetOut:
    from app.models_drama import DramaProject

    result = await db.execute(
        select(DramaAsset)
        .join(DramaProject, DramaAsset.project_id == DramaProject.id)
        .where(DramaAsset.id == asset_id, DramaProject.user_id == user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="资产不存在")
    for field in ("type", "asset_type", "name", "cover", "url", "params"):
        val = getattr(body, field)
        if val is not None:
            setattr(asset, field, val)
    await db.commit()
    await db.refresh(asset)
    return DramaAssetOut.model_validate(asset)


@router.post("/assets/{asset_id}/upload", response_model=DramaAssetOut)
async def upload_asset_media(
    asset_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DramaAssetOut:
    """Upload image/media for a drama asset directly to OSS (no local persist)."""
    from app.models_drama import DramaProject
    from app.services import oss as oss_svc

    if not oss_svc.oss_enabled():
        raise HTTPException(status_code=503, detail="OSS 未启用，无法上传资产媒体")

    result = await db.execute(
        select(DramaAsset)
        .join(DramaProject, DramaAsset.project_id == DramaProject.id)
        .where(DramaAsset.id == asset_id, DramaProject.user_id == user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="资产不存在")

    content_type = (file.content_type or "").lower()
    allowed = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    ext = allowed.get(content_type)
    if not ext:
        suffix = Path(file.filename or "").suffix.lower()
        if suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
            ext = ".jpg" if suffix == ".jpeg" else suffix
            content_type = {
                ".jpg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
                ".gif": "image/gif",
            }.get(ext, "application/octet-stream")
        else:
            raise HTTPException(status_code=400, detail="仅支持 JPG / PNG / WebP / GIF")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="空文件")
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件不能超过 20MB")

    object_key = (
        f"{oss_svc.folder_prefix()}/generated/p{asset.project_id}/"
        f"asset_{asset.id}_{uuid.uuid4().hex[:10]}{ext}"
    )
    try:
        url = oss_svc.upload_bytes(raw, object_key, content_type=content_type or "application/octet-stream")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"OSS 上传失败：{exc}") from exc

    asset.url = url
    asset.cover = url
    if not asset.asset_type or asset.asset_type == "none":
        asset.asset_type = "image"
    params = dict(asset.params or {})
    gen = params.get("generation")
    if isinstance(gen, dict):
        params["generation"] = {**gen, "status": "done", "source": "upload"}
    else:
        params["generation"] = {"status": "done", "source": "upload"}
    asset.params = params
    await db.commit()
    await db.refresh(asset)
    return DramaAssetOut.model_validate(asset)


@router.delete("/assets/{asset_id}")
async def delete_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    from app.models_drama import DramaProject

    result = await db.execute(
        select(DramaAsset)
        .join(DramaProject, DramaAsset.project_id == DramaProject.id)
        .where(DramaAsset.id == asset_id, DramaProject.user_id == user.id)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="资产不存在")
    await db.delete(asset)
    await db.commit()
    return {"ok": True}


@router.post("/assets/seed_from_script", response_model=SeedAssetsFromScriptOut)
async def seed_assets(
    project_id: int,
    refresh_prompts: bool = False,
    reextract_props: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SeedAssetsFromScriptOut:
    project = await get_owned_drama_project(db, project_id, user, with_script=True)
    try:
        result = await seed_assets_from_script(
            db,
            project,
            refresh_prompts=refresh_prompts,
            reextract_props=reextract_props,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)[:500]) from exc
    return SeedAssetsFromScriptOut(
        assets=[DramaAssetOut.model_validate(a) for a in result.assets],
        created_count=result.created_count,
        prompts_refreshed=result.prompts_refreshed,
        props_updated=result.props_updated,
        llm_errors=result.llm_errors,
    )
