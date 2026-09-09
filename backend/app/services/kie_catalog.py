# -*- coding: utf-8 -*-
"""科普可选的主流图/视频模型目录（Kie.ai + 方舟）。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Provider = Literal["kie", "ark"]
Capability = Literal["image", "video"]
ApiKind = Literal["jobs", "veo", "ark"]


@dataclass(frozen=True)
class MediaModelSpec:
    """一条可选模型：前台 id → 上游调用参数。"""

    id: str
    label: str
    description: str
    capability: Capability
    provider: Provider
    upstream_model: str
    api_kind: ApiKind
    # 默认是否在前台高亮推荐
    recommended: bool = False


# 主流图片模型（Kie jobs + 方舟 Seedream）
IMAGE_MODELS: tuple[MediaModelSpec, ...] = (
    MediaModelSpec(
        id="kie-seedream-5",
        label="Seedream 5.0 Pro",
        description="字节 Seedream 文生图，细节与文字表现好（Kie）",
        capability="image",
        provider="kie",
        upstream_model="seedream/5-pro-text-to-image",
        api_kind="jobs",
        recommended=True,
    ),
    MediaModelSpec(
        id="kie-nano-banana-2",
        label="Nano Banana 2",
        description="Google 新一代闪图，速度快、角色一致性强（Kie）",
        capability="image",
        provider="kie",
        upstream_model="nano-banana-2",
        api_kind="jobs",
        recommended=True,
    ),
    MediaModelSpec(
        id="kie-nano-banana",
        label="Nano Banana",
        description="Google 闪图基础版，成本更低（Kie）",
        capability="image",
        provider="kie",
        upstream_model="google/nano-banana",
        api_kind="jobs",
    ),
    MediaModelSpec(
        id="ark-seedream",
        label="Seedream（方舟直连）",
        description="火山方舟 Seedream，沿用站点默认接入点",
        capability="image",
        provider="ark",
        upstream_model="",
        api_kind="ark",
    ),
)

# 主流视频模型（Kie Seedance / Veo + 方舟 Seedance）
VIDEO_MODELS: tuple[MediaModelSpec, ...] = (
    MediaModelSpec(
        id="kie-seedance-2.5",
        label="Seedance 2.5",
        description="字节 Seedance 图生视频，适合科普分镜（Kie）",
        capability="video",
        provider="kie",
        upstream_model="bytedance/seedance-2-5",
        api_kind="jobs",
        recommended=True,
    ),
    MediaModelSpec(
        id="kie-veo3-fast",
        label="Veo 3.1 Fast",
        description="Google Veo 快速版，运动自然（Kie）",
        capability="video",
        provider="kie",
        upstream_model="veo3_fast",
        api_kind="veo",
        recommended=True,
    ),
    MediaModelSpec(
        id="kie-veo3",
        label="Veo 3.1 Quality",
        description="Google Veo 画质版，更慢更稳（Kie）",
        capability="video",
        provider="kie",
        upstream_model="veo3",
        api_kind="veo",
    ),
    MediaModelSpec(
        id="ark-seedance",
        label="Seedance（方舟直连）",
        description="火山方舟 Seedance，沿用站点默认接入点",
        capability="video",
        provider="ark",
        upstream_model="",
        api_kind="ark",
    ),
)

# 前台新建项目推荐默认（Kie 主流）
DEFAULT_IMAGE_MODEL_ID = "kie-seedream-5"
DEFAULT_VIDEO_MODEL_ID = "kie-seedance-2.5"
# 未选模型时后端回退：保持方舟直连，兼容旧项目
LEGACY_IMAGE_MODEL_ID = "ark-seedream"
LEGACY_VIDEO_MODEL_ID = "ark-seedance"

_ALL = {m.id: m for m in (*IMAGE_MODELS, *VIDEO_MODELS)}


def get_media_model(model_id: str | None) -> MediaModelSpec | None:
    """按前台 id 取模型规格。"""
    mid = (model_id or "").strip()
    return _ALL.get(mid)


def resolve_image_model_id(model_id: str | None) -> str:
    """归一化图片模型 id；空/未知回退方舟。"""
    mid = (model_id or "").strip()
    if not mid:
        return LEGACY_IMAGE_MODEL_ID
    spec = _ALL.get(mid)
    if spec and spec.capability == "image":
        return spec.id
    # 漫剧/旧逻辑模型名仍走方舟路由
    return mid


def resolve_video_model_id(model_id: str | None) -> str:
    """归一化视频模型 id；空/未知回退方舟。"""
    mid = (model_id or "").strip()
    if not mid:
        return LEGACY_VIDEO_MODEL_ID
    spec = _ALL.get(mid)
    if spec and spec.capability == "video":
        return spec.id
    return mid


def catalog_payload() -> dict:
    """公开目录 JSON。"""
    def _row(m: MediaModelSpec) -> dict:
        return {
            "id": m.id,
            "label": m.label,
            "description": m.description,
            "provider": m.provider,
            "recommended": m.recommended,
        }

    return {
        "image_models": [_row(m) for m in IMAGE_MODELS],
        "video_models": [_row(m) for m in VIDEO_MODELS],
        "defaults": {
            "image_model": DEFAULT_IMAGE_MODEL_ID,
            "video_model": DEFAULT_VIDEO_MODEL_ID,
        },
    }


def kie_upstream_catalog(*, capability: str = "all") -> list[dict[str, str]]:
    """后台「从上游拉取」用的 Kie 模型目录（id 用前台 catalog id）。"""
    cap = (capability or "all").strip().lower()
    out: list[dict[str, str]] = []
    for m in (*IMAGE_MODELS, *VIDEO_MODELS):
        if m.provider != "kie":
            continue
        if cap not in {"", "all"} and m.capability != cap:
            continue
        out.append(
            {
                "id": m.id,
                "label": m.label,
                "capability": m.capability,
                "upstream_model": m.upstream_model,
            }
        )
    return out


def default_kie_channel_models() -> list[str]:
    """新建/引导 Kie 渠道时预填的主流模型 id。"""
    return [m.id for m in (*IMAGE_MODELS, *VIDEO_MODELS) if m.provider == "kie"]
