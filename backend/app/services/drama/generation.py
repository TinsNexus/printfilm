"""Drama image / video generation helpers."""

from __future__ import annotations

import logging
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import User
from app.models_drama import DramaAsset, DramaEpisodeFragment, DramaFragmentAssetRef, DramaProject
from app.services.ark import get_ark
from app.services.billing import record_usage
from app.services.drama.generation_prompt import build_generation_prompt
from app.services.drama.seedream_options import resolve_seedream_model_endpoint, resolve_seedream_size

logger = logging.getLogger(__name__)


def fragment_generation_status(fragment: DramaEpisodeFragment) -> dict[str, Any]:
    """读取分镜片段生成状态（done / running / failed / idle）。"""
    params = fragment.params or {}
    gen = params.get("generation") if isinstance(params, dict) else None
    if fragment.video:
        return {"status": "done", "video": fragment.video, "cover": fragment.cover}
    if isinstance(gen, dict):
        return gen
    return {"status": "idle"}


async def generate_asset_image(
    db: AsyncSession,
    user: User,
    project: DramaProject,
    prompt: str,
    *,
    asset: DramaAsset | None = None,
    name: str | None = None,
    kind: str = "character",
    image_style_id: str | None = None,
    model_id: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
) -> DramaAsset:
    """Generate Seedream image and attach/create asset."""
    settings = get_settings()
    ark = get_ark()

    # style_id 请求优先，否则回退项目 params
    style_id = (image_style_id or "").strip() or str(
        (project.params or {}).get("image_style_id") or ""
    ).strip() or None
    # ratio 默认：角色 3:4，其它 16:9
    ratio = (aspect_ratio or "").strip() or (
        "3:4" if (kind or "").lower() == "character" else "16:9"
    )
    res = (resolution or "").strip() or "3K"
    size = resolve_seedream_size(aspect_ratio=ratio, resolution=res)
    model = resolve_seedream_model_endpoint(model_id)
    full_prompt = build_generation_prompt(prompt, asset_type=kind, style_id=style_id)

    logger.info(
        "调用 Seedream 生图 project_id=%s asset_id=%s kind=%s style=%s model=%s size=%s prompt_len=%s",
        project.id,
        asset.id if asset else None,
        kind,
        style_id,
        model,
        size,
        len(full_prompt or ""),
    )
    result = await ark.gen_image(
        full_prompt.strip(),
        project_id=project.id,
        size=size,
        model=model,
    )
    url = result.local_url or ""
    logger.info("Seedream 返回 project_id=%s url=%s", project.id, (url or "")[:100])

    await record_usage(
        db,
        user_id=user.id,
        project_id=None,
        drama_project_id=project.id,
        billing_key="seedream",
        model=model or settings.model_image,
        estimated=True,
    )

    # gen_meta 写入资产 params，便于前端回显上次选项
    gen_meta = {
        "prompt": prompt,
        "image_style_id": style_id,
        "model_id": model_id or "seedream-5.0",
        "aspect_ratio": ratio,
        "resolution": res,
    }

    if asset is None:
        asset = DramaAsset(
            project_id=project.id,
            type=kind,
            asset_type="image",
            name=name or "未命名资产",
            cover=url,
            url=url,
            params=gen_meta,
        )
        db.add(asset)
    else:
        asset.cover = url
        asset.url = url
        params = dict(asset.params or {})
        params.update(gen_meta)
        asset.params = params

    await db.commit()
    await db.refresh(asset)
    return asset


async def generate_fragment_video(
    db: AsyncSession,
    user: User,
    project: DramaProject,
    fragment: DramaEpisodeFragment,
) -> DramaEpisodeFragment:
    """为单个分镜片段生成 Seedance 视频。"""
    settings = get_settings()
    ark = get_ark()
    prompt = (fragment.content or "").strip() or "短剧分镜"
    duration = int(fragment.duration_sec or 8)
    duration = max(settings.seedance_duration_min, min(duration, settings.seedance_duration_max))

    refs = (
        await db.execute(
            select(DramaFragmentAssetRef)
            .where(DramaFragmentAssetRef.fragment_id == fragment.id)
            .order_by(DramaFragmentAssetRef.id.asc())
        )
    ).scalars().all()
    image_url = ""
    for ref in refs:
        asset = await db.get(DramaAsset, ref.asset_id)
        if asset and (asset.url or asset.cover):
            image_url = asset.url or asset.cover or ""
            break

    t0 = time.time()
    if image_url:
        local_video = await ark.gen_and_wait_video(
            image_url,
            prompt,
            duration,
            project_id=project.id,
            shot_no=fragment.id,
            ratio="16:9",
        )
    else:
        still = await ark.gen_image(prompt[:500], project_id=project.id, shot_no=fragment.id)
        local_video = await ark.gen_and_wait_video(
            still.local_url,
            prompt,
            duration,
            project_id=project.id,
            shot_no=fragment.id,
            ratio="16:9",
        )

    fragment.video = local_video
    fragment.cover = fragment.cover or image_url
    await record_usage(
        db,
        user_id=user.id,
        project_id=None,
        drama_project_id=project.id,
        billing_key="seedance",
        model=settings.model_video,
        estimated=True,
    )
    await db.commit()
    await db.refresh(fragment)
    logger.info(
        "fragment video done id=%s secs=%.1f url=%s",
        fragment.id,
        time.time() - t0,
        (local_video or "")[:80],
    )
    return fragment
