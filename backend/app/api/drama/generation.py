"""Drama Seedream generation endpoint."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.models_drama import DramaAsset
from app.schemas_drama import DramaAssetOut, DramaImageGenerateRequest
from app.services.drama.access import get_owned_drama_project
from app.services.drama.jobs import dispatch_asset_image_job

router = APIRouter()
logger = logging.getLogger("app.drama.generation")


@router.post("/generation/image")
async def generate_image(
    body: DramaImageGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    # 入队生图；返回 queued，前端轮询资产 params.generation / 列表刷新
    project = await get_owned_drama_project(db, body.project_id, user, with_script=True)
    asset = None
    if body.asset_id:
        asset = await db.get(DramaAsset, body.asset_id)
        if not asset or asset.project_id != project.id:
            raise HTTPException(status_code=404, detail="资产不存在")
        params = dict(asset.params or {})
        params["generation"] = {"status": "generating"}
        asset.params = params
        await db.commit()
        await db.refresh(asset)

    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="缺少 prompt")

    kind = body.asset_type_kind or (asset.type if asset else "character")
    # style_id 请求优先，否则回退项目 params
    style_id = (body.image_style_id or "").strip() or str(
        (project.params or {}).get("image_style_id") or ""
    ).strip() or None
    task_id = dispatch_asset_image_job(
        project.id,
        user.id,
        prompt,
        asset_id=asset.id if asset else None,
        name=body.name,
        kind=kind,
        image_style_id=style_id,
        model_id=body.model_id,
        aspect_ratio=body.aspect_ratio,
        resolution=body.resolution,
    )
    logger.info(
        "已入队资产生图 project_id=%s asset_id=%s kind=%s style=%s model=%s size=%s/%s task_id=%s prompt_len=%s",
        project.id,
        asset.id if asset else None,
        kind,
        style_id,
        body.model_id,
        body.aspect_ratio,
        body.resolution,
        task_id,
        len(prompt),
    )
    return {
        "ok": True,
        "queued": True,
        "status": "generating",
        "task_id": task_id,
        "asset_id": asset.id if asset else None,
        "asset": DramaAssetOut.model_validate(asset).model_dump() if asset else None,
    }
