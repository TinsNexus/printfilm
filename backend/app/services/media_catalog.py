"""前台图/视频模型目录：来自 TokenFree 路由快照，不再展示 Kie/方舟。"""

from __future__ import annotations

from typing import Any

from app.config import get_settings
from app.schemas_routing import DefaultModels, LogicalModel, SystemModelChannel
from app.services.model_routing_config import infer_model_capability, normalize_model_name


def _row(*, model_id: str, label: str, recommended: bool, description: str = "") -> dict[str, Any]:
    """组装前台一条模型选项。"""
    return {
        "id": model_id,
        "label": (label or model_id).strip() or model_id,
        "description": description,
        "provider": "tokenfree",
        "recommended": recommended,
    }


def build_media_catalog(
    *,
    logical_models: list[LogicalModel],
    channels: list[SystemModelChannel],
    defaults: DefaultModels,
    fallback_image: str = "",
    fallback_video: str = "",
) -> dict[str, Any]:
    """按逻辑模型 + 渠道勾选生成 image/video 目录。"""
    images: list[dict[str, Any]] = []
    videos: list[dict[str, Any]] = []
    seen_image: set[str] = set()
    seen_video: set[str] = set()

    default_image = (defaults.image_model or "").strip()
    default_video = (defaults.video_model or "").strip()

    for model in logical_models:
        if not model.enabled:
            continue
        mid = (model.id or "").strip()
        if not mid:
            continue
        key = normalize_model_name(mid)
        label = (model.name or mid).strip() or mid
        if model.capability == "image" and key not in seen_image:
            seen_image.add(key)
            images.append(_row(model_id=mid, label=label, recommended=mid == default_image))
        elif model.capability == "video" and key not in seen_video:
            seen_video.add(key)
            videos.append(_row(model_id=mid, label=label, recommended=mid == default_video))

    for channel in channels:
        if not channel.enabled:
            continue
        for raw in channel.models:
            mid = (raw or "").strip()
            if not mid:
                continue
            key = normalize_model_name(mid)
            cap = infer_model_capability(mid)
            if cap == "image" and key not in seen_image:
                seen_image.add(key)
                images.append(_row(model_id=mid, label=mid, recommended=mid == default_image))
            elif cap == "video" and key not in seen_video:
                seen_video.add(key)
                videos.append(_row(model_id=mid, label=mid, recommended=mid == default_video))

    if not default_image:
        default_image = images[0]["id"] if images else (fallback_image or "").strip()
    if not default_video:
        default_video = videos[0]["id"] if videos else (fallback_video or "").strip()
    if not images and default_image:
        images.append(_row(model_id=default_image, label=default_image, recommended=True))
    if not videos and default_video:
        videos.append(_row(model_id=default_video, label=default_video, recommended=True))

    return {
        "image_models": images,
        "video_models": videos,
        "defaults": {
            "image_model": default_image,
            "video_model": default_video,
        },
    }


def catalog_payload() -> dict[str, Any]:
    """公开目录 JSON，供前台 /api/media-models。"""
    from app.services.model_settings import get_routing_snapshot

    snap = get_routing_snapshot()
    settings = get_settings()
    return build_media_catalog(
        logical_models=list(snap.logical_models),
        channels=list(snap.channels),
        defaults=snap.default_models,
        fallback_image=settings.model_image,
        fallback_video=settings.model_video,
    )
