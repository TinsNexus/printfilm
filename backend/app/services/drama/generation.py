"""Drama image / video generation helpers."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import User
from app.models_drama import DramaAsset, DramaEpisodeFragment, DramaFragmentAssetRef, DramaProject
from app.services.ark import get_ark
from app.services.billing import record_usage
from app.services.drama.build_seedance_generate_body import (
    ASSET_MENTION_TOKEN_PATTERN,
    build_seedance_generate_body,
    build_seedance_reference_catalog,
    drama_asset_to_payload,
    read_asset_voice_audio_url,
)
from app.services.drama.generation_prompt import build_generation_prompt
from app.services.drama.seedream_options import resolve_seedream_model_endpoint, resolve_seedream_size
from app.services.drama.visual_prompt import resolve_visual_prompt_for_asset
from app.services.drama.voice_synthesis import synthesize_voice_asset

logger = logging.getLogger(__name__)

# 分镜视频前需要参考图的资产类型
IMAGE_REF_ASSET_TYPES = frozenset({"character", "scene", "prop"})


# 读取分镜已落盘的尾帧 URL
def read_fragment_last_frame_url(fragment: DramaEpisodeFragment | None) -> str | None:
    if not fragment:
        return None
    params = fragment.params if isinstance(fragment.params, dict) else {}
    for key in ("lastFrameUrl", "last_frame_url"):
        value = params.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


# 写入分镜尾帧 URL（生成完成后持久化，供下一镜衔接）
def write_fragment_last_frame_url(fragment: DramaEpisodeFragment, url: str | None) -> None:
    params = dict(fragment.params or {}) if isinstance(fragment.params, dict) else {}
    cleaned = (url or "").strip()
    if cleaned:
        params["lastFrameUrl"] = cleaned
    else:
        params.pop("lastFrameUrl", None)
        params.pop("last_frame_url", None)
    fragment.params = params


# 项目是否开启「上一镜尾帧 → 本镜首帧」衔接（默认开启）
def project_link_last_frame_enabled(project: DramaProject) -> bool:
    params = project.params if isinstance(project.params, dict) else {}
    raw = params.get("linkLastFrame")
    if raw is None:
        raw = params.get("link_last_frame")
    if raw is None:
        return True
    return bool(raw)


# 查找同集中 sort_order 更小的上一镜
async def find_previous_episode_fragment(
    db: AsyncSession,
    fragment: DramaEpisodeFragment,
) -> DramaEpisodeFragment | None:
    result = await db.execute(
        select(DramaEpisodeFragment)
        .where(
            DramaEpisodeFragment.episode_id == fragment.episode_id,
            DramaEpisodeFragment.sort_order < int(fragment.sort_order or 0),
        )
        .order_by(DramaEpisodeFragment.sort_order.desc())
        .limit(1)
    )
    return result.scalars().first()


def fragment_generation_status(fragment: DramaEpisodeFragment) -> dict[str, Any]:
    """读取分镜片段生成状态（done / running / failed / idle）。"""
    params = fragment.params or {}
    gen = params.get("generation") if isinstance(params, dict) else None
    if fragment.video:
        return {"status": "done", "video": fragment.video, "cover": fragment.cover}
    if isinstance(gen, dict):
        return gen
    return {"status": "idle"}


# 从分镜正文提取 @asset:id
def extract_asset_ids_from_content(content: str) -> list[int]:
    ids: list[int] = []
    seen: set[int] = set()
    for match in ASSET_MENTION_TOKEN_PATTERN.finditer(content or ""):
        asset_id = int(match.group(1))
        if asset_id in seen:
            continue
        seen.add(asset_id)
        ids.append(asset_id)
    return ids


# 判断资产是否缺参考图
def asset_needs_reference_image(asset: DramaAsset) -> bool:
    kind = (asset.type or "").strip().lower()
    if kind not in IMAGE_REF_ASSET_TYPES:
        return False
    cover = (asset.cover or "").strip()
    url = (asset.url or "").strip()
    return not cover and not url


# 读取资产生图提示词（缺省时用名称兜底）
def read_asset_visual_prompt(asset: DramaAsset) -> str:
    params = asset.params if isinstance(asset.params, dict) else {}
    stored = str(
        params.get("visualPrompt")
        or params.get("visualImage")
        or ""
    ).strip()
    if stored:
        return stored
    name = (asset.name or "").strip() or f"资产{asset.id}"
    kind = (asset.type or "character").strip()
    return f"{kind} {name}"


async def _set_fragment_generation(
    db: AsyncSession,
    fragment: DramaEpisodeFragment,
    payload: dict[str, Any],
) -> None:
    # 写入分镜 generation 状态供前端轮询
    params = dict(fragment.params or {})
    params["generation"] = payload
    fragment.params = params
    await db.commit()


async def ensure_fragment_reference_images(
    db: AsyncSession,
    user: User,
    project: DramaProject,
    fragment: DramaEpisodeFragment,
    *,
    ref_assets: list[DramaAsset] | None = None,
) -> list[DramaAsset]:
    """
    分镜视频生成前：收集引用资产，对缺图的角色/场景/道具动态 Seedream 生图。
    返回刷新后的参考资产列表（含正文 @asset 与引用表）。
    """
    # collected_ids 引用表 + 正文 @asset
    collected_ids: list[int] = []
    seen: set[int] = set()

    refs = (
        await db.execute(
            select(DramaFragmentAssetRef)
            .where(DramaFragmentAssetRef.fragment_id == fragment.id)
            .order_by(DramaFragmentAssetRef.id.asc())
        )
    ).scalars().all()
    for ref in refs:
        if ref.asset_id in seen:
            continue
        seen.add(ref.asset_id)
        collected_ids.append(ref.asset_id)

    for asset_id in extract_asset_ids_from_content(fragment.content or ""):
        if asset_id in seen:
            continue
        seen.add(asset_id)
        collected_ids.append(asset_id)

    assets_by_id: dict[int, DramaAsset] = {}
    if ref_assets:
        for asset in ref_assets:
            assets_by_id[asset.id] = asset

    for asset_id in collected_ids:
        if asset_id in assets_by_id:
            continue
        asset = await db.get(DramaAsset, asset_id)
        if asset and asset.project_id == project.id:
            assets_by_id[asset_id] = asset

    ordered = [assets_by_id[i] for i in collected_ids if i in assets_by_id]
    missing = [a for a in ordered if asset_needs_reference_image(a)]
    if not missing:
        return ordered

    logger.info(
        "分镜缺图资产动态生成 fragment_id=%s count=%s ids=%s",
        fragment.id,
        len(missing),
        [a.id for a in missing],
    )
    await _set_fragment_generation(
        db,
        fragment,
        {
            "status": "running",
            "phase": "assets",
            "message": f"正在生成参考图 0/{len(missing)}",
            "assets_total": len(missing),
            "assets_done": 0,
        },
    )

    # 补齐正文提到但引用表没有的关联
    existing_ref_ids = {ref.asset_id for ref in refs}
    for asset in ordered:
        if asset.id in existing_ref_ids:
            continue
        if (asset.type or "").lower() not in IMAGE_REF_ASSET_TYPES:
            continue
        db.add(DramaFragmentAssetRef(fragment_id=fragment.id, asset_id=asset.id))
        existing_ref_ids.add(asset.id)
    await db.flush()

    for index, asset in enumerate(missing):
        try:
            prompt = await resolve_visual_prompt_for_asset(asset, project)
        except Exception:  # noqa: BLE001
            prompt = read_asset_visual_prompt(asset)
        if not (prompt or "").strip():
            prompt = read_asset_visual_prompt(asset)
        await _set_fragment_generation(
            db,
            fragment,
            {
                "status": "running",
                "phase": "assets",
                "message": f"正在生成参考图 {index + 1}/{len(missing)}：{asset.name or asset.id}",
                "assets_total": len(missing),
                "assets_done": index,
                "asset_id": asset.id,
            },
        )
        updated = await generate_asset_image(
            db,
            user,
            project,
            prompt,
            asset=asset,
            name=asset.name,
            kind=(asset.type or "character"),
            image_style_id=str((project.params or {}).get("image_style_id") or "") or None,
        )
        assets_by_id[updated.id] = updated
        logger.info(
            "分镜参考图已补齐 fragment_id=%s asset_id=%s url=%s",
            fragment.id,
            updated.id,
            (updated.cover or updated.url or "")[:80],
        )

    await _set_fragment_generation(
        db,
        fragment,
        {
            "status": "running",
            "phase": "video",
            "message": "参考图已就绪，开始生成视频",
            "assets_total": len(missing),
            "assets_done": len(missing),
        },
    )
    return [assets_by_id[i] for i in collected_ids if i in assets_by_id]


async def ensure_reference_assets_public_urls(
    db: AsyncSession,
    assets: list[DramaAsset],
) -> list[DramaAsset]:
    """将引用资产的本地 cover/url 同步上传 OSS，供 Seedance 公网拉取。"""
    from app.services import storage as storage_svc

    source_asset_cache: dict[int, DramaAsset | None] = {}

    # 角色音色优先复用 source voice asset 的公网 URL；缺失时再尝试补传本地文件。
    async def _resolve_public_voice_url(asset: DramaAsset, params: dict[str, Any]) -> str | None:
        voice_url = read_asset_voice_audio_url(params)
        if not voice_url:
            return None

        binding = params.get("voiceAudio")
        if not isinstance(binding, dict):
            canvas = params.get("canvas")
            if isinstance(canvas, dict):
                maybe_binding = canvas.get("voiceAudio")
                if isinstance(maybe_binding, dict):
                    binding = maybe_binding
        source_id = binding.get("sourceAssetId") if isinstance(binding, dict) else None
        if isinstance(source_id, int):
            source_asset = source_asset_cache.get(source_id)
            if source_id not in source_asset_cache:
                source_asset = await db.get(DramaAsset, source_id)
                source_asset_cache[source_id] = source_asset
            if source_asset and source_asset.project_id == asset.project_id:
                source_url = (source_asset.url or "").strip()
                if source_url.startswith("https://"):
                    local_source = storage_svc.local_path_from_url(source_url)
                    if local_source:
                        try:
                            await storage_svc.ensure_local_media(source_url, local_source)
                            return storage_svc.to_public_url(storage_svc.rel_static_url(local_source))
                        except Exception:  # noqa: BLE001
                            logger.exception(
                                "restore voice reference local file failed source_asset_id=%s",
                                source_asset.id,
                            )
                            return source_url
                    return source_url

        if voice_url.startswith("https://"):
            return voice_url

        published_voice = storage_svc.republish_url(voice_url, sync=True)
        if (
            published_voice
            and published_voice != voice_url
            and str(published_voice).startswith("https://")
        ):
            return str(published_voice)
        return None

    changed = False
    for asset in assets:
        for field in ("cover", "url"):
            raw = (getattr(asset, field) or "").strip()
            if not raw:
                continue
            if raw.startswith("https://"):
                continue
            published = storage_svc.republish_url(raw, sync=True)
            if published and published != raw and str(published).startswith("https://"):
                setattr(asset, field, published)
                changed = True
                logger.info(
                    "资产参考图已同步 OSS asset_id=%s field=%s",
                    asset.id,
                    field,
                )
        # 角色音色需要公网 URL；若历史绑定仍是 /static，改指向 source voice asset 的 HTTPS。
        params = dict(asset.params or {}) if isinstance(asset.params, dict) else {}
        current_voice_url = read_asset_voice_audio_url(params)
        public_voice_url = await _resolve_public_voice_url(asset, params)
        if public_voice_url and public_voice_url != current_voice_url:
            binding = params.get("voiceAudio")
            if isinstance(binding, dict):
                params["voiceAudio"] = {**binding, "url": public_voice_url}
            canvas = params.get("canvas")
            if isinstance(canvas, dict):
                voice_binding = canvas.get("voiceAudio")
                if isinstance(voice_binding, dict):
                    params["canvas"] = {
                        **canvas,
                        "voiceAudio": {**voice_binding, "url": public_voice_url},
                    }
            asset.params = params
            changed = True
    if changed:
        await db.commit()
        for asset in assets:
            await db.refresh(asset)
    return assets


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
    # Seedance 需公网图：优先同步 OSS；失败再用 Seedream 临时 CDN
    from app.services import storage as storage_svc

    url = result.local_url or ""
    if url:
        published = storage_svc.republish_url(url, sync=True)
        if published and str(published).startswith("https://"):
            url = str(published)
        elif result.remote_url and str(result.remote_url).startswith("https://"):
            url = str(result.remote_url)
            logger.warning(
                "OSS 未拿到 https，回退 Seedream CDN project_id=%s",
                project.id,
            )
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
        if prompt.strip():
            params["visualPrompt"] = prompt.strip()
            if not str(params.get("visualImage") or "").strip():
                params["visualImage"] = prompt.strip()
        asset.params = params

    await db.commit()
    await db.refresh(asset)
    return asset


async def generate_voice_asset_audio(
    db: AsyncSession,
    user: User,
    project: DramaProject,
    asset: DramaAsset,
    *,
    voice_prompt: str,
    sample_text: str | None = None,
    speaker: str | None = None,
    character_asset: DramaAsset | None = None,
) -> DramaAsset:
    """为 voice 类型资产按提示词合成参考音频。"""
    return await synthesize_voice_asset(
        db,
        user,
        project,
        asset,
        voice_prompt=voice_prompt,
        sample_text=sample_text,
        speaker=speaker,
        character_name=character_asset.name if character_asset else None,
        character_asset=character_asset,
    )


# 组装分镜 Seedance 引用 payload（含全局旁白音色）
def build_fragment_ref_payloads(
    project: DramaProject,
    ref_assets: list[DramaAsset],
) -> list[dict[str, Any]]:
    ref_payloads = [drama_asset_to_payload(a) for a in ref_assets]
    narrator_voice: Any = (project.params or {}).get("narrationVoiceAudio")
    if isinstance(narrator_voice, dict):
        narration_url = str(
            narrator_voice.get("url") or narrator_voice.get("previewUrl") or ""
        ).strip()
        if narration_url and not narration_url.startswith("https://"):
            from app.services import storage as storage_svc

            published_voice = storage_svc.republish_url(narration_url, sync=True)
            if published_voice and str(published_voice).startswith("https://"):
                narrator_voice = {**narrator_voice, "url": str(published_voice)}

        narration_voice_audio_url = str(narrator_voice.get("url") or "").strip()
        if narration_voice_audio_url:
            narrator_payload = {
                "id": -1,
                "type": "narration",
                "assetType": "audio",
                "name": "旁白",
                "cover": "",
                "url": "",
                "params": {"voiceAudio": narrator_voice},
            }
            ref_payloads = [narrator_payload, *ref_payloads]
    return ref_payloads


async def generate_fragment_video(
    db: AsyncSession,
    user: User,
    project: DramaProject,
    fragment: DramaEpisodeFragment,
) -> DramaEpisodeFragment:
    """为单个分镜片段生成 Seedance 视频（含参考图与角色音色 reference_audio）。"""
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
    ref_assets: list[DramaAsset] = []
    seen_ids: set[int] = set()
    for ref in refs:
        if ref.asset_id in seen_ids:
            continue
        asset = await db.get(DramaAsset, ref.asset_id)
        if asset:
            seen_ids.add(ref.asset_id)
            ref_assets.append(asset)

    # 缺图的引用资产先动态生图，再组 Seedance 参考
    ref_assets = await ensure_fragment_reference_images(
        db,
        user,
        project,
        fragment,
        ref_assets=ref_assets,
    )
    # 已有本地图的资产同步上 OSS，避免 Seedance 拿不到公网 URL
    ref_assets = await ensure_reference_assets_public_urls(db, ref_assets)

    ref_payloads = build_fragment_ref_payloads(project, ref_assets)
    style_id = str((project.params or {}).get("image_style_id") or "").strip() or None
    catalog = build_seedance_reference_catalog(ref_payloads)

    continuity_url: str | None = None
    if project_link_last_frame_enabled(project):
        prev = await find_previous_episode_fragment(db, fragment)
        continuity_url = read_fragment_last_frame_url(prev)
        if continuity_url:
            continuity_url = storage_svc_early_republish(continuity_url)

    t0 = time.time()
    image_url = ""
    for item in catalog.images:
        image_url = item.url
        break

    local_last_frame: str | None = None
    if ref_payloads and (catalog.images or catalog.audios):
        # ratio 优先项目 params，默认竖屏 9:16（与分集编辑页一致）
        ratio = str((project.params or {}).get("aspect_ratio") or "").strip() or "9:16"
        resolution = str((project.params or {}).get("resolution") or "").strip() or "480p"
        body = build_seedance_generate_body(
            {
                "content": prompt,
                "reference": ref_payloads,
                "video_style_id": style_id,
                "aspect_ratio": ratio,
                "resolution": resolution,
                "duration_fallback": duration,
                "continuity_first_frame_url": continuity_url,
            }
        )
        local_video, local_last_frame = await ark.gen_and_wait_seedance_body(
            body,
            project_id=project.id,
            shot_no=fragment.id,
        )
    elif image_url:
        ratio = str((project.params or {}).get("aspect_ratio") or "").strip() or "9:16"
        local_video = await ark.gen_and_wait_video(
            image_url,
            prompt,
            duration,
            project_id=project.id,
            shot_no=fragment.id,
            ratio=ratio,
            generate_audio=True,
        )
    else:
        ratio = str((project.params or {}).get("aspect_ratio") or "").strip() or "9:16"
        still = await ark.gen_image(prompt[:500], project_id=project.id, shot_no=fragment.id)
        image_url = still.local_url or ""
        local_video = await ark.gen_and_wait_video(
            still.local_url,
            prompt,
            duration,
            project_id=project.id,
            shot_no=fragment.id,
            ratio=ratio,
            generate_audio=True,
        )

    # Seedance 成片落盘后立即同步 OSS，避免库里长期留 /static
    from app.services import storage as storage_svc

    video_url = storage_svc.republish_url(local_video, sync=True) or local_video
    # 封面必须来自成片帧，禁止用角色/场景参考图冒充
    cover_url = ""
    video_path = storage_svc.local_path_from_url(local_video)
    if video_path is None and isinstance(local_video, str) and not local_video.startswith("http"):
        candidate = Path(local_video)
        if candidate.exists():
            video_path = candidate
    if video_path and video_path.exists():
        from app.services.ffmpeg_compose import extract_video_poster_frame

        poster_dest = storage_svc.project_dir(project.id) / f"shot_{fragment.id}_cover.jpg"
        if extract_video_poster_frame(video_path, poster_dest):
            cover_src = storage_svc.rel_static_url(poster_dest)
            cover_url = storage_svc.republish_url(cover_src, sync=True) or cover_src
    last_frame_url = None
    if local_last_frame:
        last_frame_url = storage_svc.republish_url(local_last_frame, sync=True) or local_last_frame
        if not cover_url:
            cover_url = last_frame_url
    fragment.video = video_url
    fragment.cover = cover_url or ""
    write_fragment_last_frame_url(fragment, last_frame_url)
    await record_usage(
        db,
        user_id=user.id,
        project_id=None,
        drama_project_id=project.id,
        billing_key="seedance2:video0",
        model=settings.model_video,
        estimated=True,
    )
    await db.commit()
    await db.refresh(fragment)
    logger.info(
        "fragment video done id=%s secs=%.1f url=%s last_frame=%s continuity=%s",
        fragment.id,
        time.time() - t0,
        (video_url or "")[:80],
        bool(last_frame_url),
        bool(continuity_url),
    )
    return fragment


# 衔接用尾帧尽量走公网 URL（本地 /static 时尝试 republish）
def storage_svc_early_republish(url: str) -> str:
    from app.services import storage as storage_svc

    return storage_svc.republish_url(url, sync=True) or url
