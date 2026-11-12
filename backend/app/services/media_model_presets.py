"""站点预设模型清单 + 按模型生成参数白名单。"""

from __future__ import annotations

from typing import Any

from app.schemas_routing import LogicalModelCapability
from app.services.model_routing_config import normalize_model_name

# 管理端四下拉 + 渠道 models 硬编码白名单（含前台展示文案）
# id 与 TokenFree 目录展示名对齐（点分：seedance-2.0 / seedream-5.0-pro）
PRESET_MODELS: dict[LogicalModelCapability, tuple[dict[str, str], ...]] = {
    "text": (
        {
            "id": "kimi-k2.6",
            "label": "Kimi K2.6",
            "note": "默认剧本/分镜，中文长上下文表现稳定",
            "pricing_hint": "适合长剧本",
        },
        {
            "id": "deepseek-v4-pro",
            "label": "DeepSeek V4 Pro",
            "note": "推理强、性价比高，适合扩写与润色",
            "pricing_hint": "通常更省",
        },
        {
            "id": "gpt-5.5",
            "label": "GPT 5.5",
            "note": "综合能力强，复杂指令与英文场景更稳",
            "pricing_hint": "相对更贵",
        },
        {
            "id": "gpt-4o",
            "label": "GPT-4o",
            "note": "PiAPI 文本模型，响应快、综合能力均衡",
            "pricing_hint": "按 Token 计费",
            "gateways": "piapi",
        },
        {
            "id": "gpt-5",
            "label": "GPT-5",
            "note": "PiAPI 文本模型，复杂剧本与长指令更稳",
            "pricing_hint": "相对更贵",
            "gateways": "piapi",
        },
        {
            "id": "claude-sonnet-4-6",
            "label": "Claude Sonnet 4.6",
            "note": "PiAPI 文本模型，长文写作与润色表现好",
            "pricing_hint": "相对更贵",
            "gateways": "piapi",
        },
    ),
    "image": (
        {
            "id": "seedream-5.0-pro",
            "label": "Seedream 5.0 Pro",
            "note": "成片定妆首选，角色一致性好；按清晰度计费",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 20–60 秒/张",
            "gateways": "tokenfree,piapi",
        },
        {
            "id": "seedream-5.0",
            "label": "Seedream 5.0",
            "note": "标准静帧，质量与成本均衡",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 15–40 秒/张",
        },
        {
            "id": "seedream-5.0-flash",
            "label": "Seedream 5.0 Flash",
            "note": "更快更省，适合草稿与批量试错",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 10–25 秒/张",
        },
        {
            "id": "gpt-image-2",
            "label": "GPT Image 2",
            "note": "OpenAI 生图，光影与文字表现好，适合海报与精细静帧",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 30–90 秒/张",
        },
        {
            "id": "gpt-image-2.5",
            "label": "GPT Image 2.5",
            "note": "OpenAI 新一代生图，细节与文字更稳，适合定妆与精细静帧",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 30–120 秒/张",
        },
        {
            "id": "flux1-dev",
            "label": "Flux.1 Dev",
            "note": "PiAPI 生图，质感细腻；仅 1K，参考图只用首张",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 20–60 秒/张",
            "gateways": "piapi",
        },
        {
            "id": "flux1-schnell",
            "label": "Flux.1 Schnell",
            "note": "PiAPI 快速生图，适合草稿与批量试错；仅 1K",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 5–20 秒/张",
            "gateways": "piapi",
        },
        {
            "id": "nano-banana-pro",
            "label": "Nano Banana Pro",
            "note": "PiAPI · Gemini 3 Pro 生图，构图与文字最稳；1K/2K/4K，最多 14 张参考图",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 20–60 秒/张",
            "gateways": "piapi",
        },
        {
            "id": "nano-banana-2",
            "label": "Nano Banana 2",
            "note": "PiAPI · Gemini 生图，质量与速度均衡；1K/2K/4K，最多 14 张参考图",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 15–40 秒/张",
            "gateways": "piapi",
        },
        {
            "id": "nano-banana-2.1",
            "label": "Nano Banana 2.1",
            "note": "PiAPI · Gemini 生图省钱档；1K/2K/4K，最多 14 张参考图",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 15–40 秒/张",
            "gateways": "piapi",
        },
        {
            "id": "gemini-2.5-flash-image",
            "label": "Gemini 2.5 Flash Image",
            "note": "PiAPI · Gemini 快速生图与改图；仅 1K",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 10–30 秒/张",
            "gateways": "piapi",
        },
        {
            "id": "seedream-5.0-lite",
            "label": "Seedream 5.0 Lite",
            "note": "PiAPI · Seedream 轻量版；2K/3K，最多 10 张参考图",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 20–60 秒/张",
            "gateways": "piapi",
        },
        {
            "id": "qwen-image",
            "label": "Qwen Image",
            "note": "PiAPI · 通义生图，带参考图时改图（最多 3 张）；仅 1K",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 10–30 秒/张",
            "gateways": "piapi",
        },
        {
            "id": "qwen-image-2.1",
            "label": "Qwen Image 2.1",
            "note": "PiAPI · 通义生图 2.1，只支持文生图；仅 1K",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 10–30 秒/张",
            "gateways": "piapi",
        },
        {
            "id": "z-image",
            "label": "Z-Image",
            "note": "PiAPI · 极低价文生图，适合草稿；仅 1K，不支持参考图",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 5–15 秒/张",
            "gateways": "piapi",
        },
        {
            "id": "minimax-image-01",
            "label": "MiniMax Image-01",
            "note": "PiAPI · MiniMax 文生图；1K/2K，不支持参考图",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 10–30 秒/张",
            "gateways": "piapi",
        },
    ),
    "video": (
        {
            "id": "seedance-2.5",
            "label": "Seedance 2.5",
            "note": "成片首选，画质更好；4–30 秒，支持到 1080p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 3–8 分钟/镜",
            "gateways": "tokenfree,piapi",
        },
        {
            "id": "seedance-2.0",
            "label": "Seedance 2.0",
            "note": "标准成片，运镜较稳；4–15 秒，最高 720p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–5 分钟/镜",
            "gateways": "tokenfree,piapi",
        },
        {
            "id": "seedance-2.0-fast",
            "label": "Seedance 2.0 Fast",
            "note": "2.0 加速档，适合赶进度；4–15 秒，最高 720p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 1–4 分钟/镜",
            "gateways": "tokenfree,piapi",
        },
        # seedance-2.0-mini：TokenFree 会转到 doubao-seedance-2-0-mini-260615，
        # 上游 Ark 未开通 → ModelNotOpen；暂不进预设，别名钳到 2.0
        {
            "id": "MiniMax-H3",
            "label": "MiniMax H3",
            "note": "节奏感强、人物生动；4–15 秒，480p / 768p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "偏慢，4s 约 15 分钟起",
            "gateways": "tokenfree,piapi",
        },
        {
            "id": "kling-3.0",
            "label": "Kling 3.0",
            "note": "PiAPI 视频，支持首尾帧；3–15 秒，720p / 1080p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–6 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "kling-4.0",
            "label": "Kling 4.0",
            "note": "PiAPI 视频，支持首尾帧；3–30 秒，720p / 1080p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 3–8 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "veo3.1",
            "label": "Veo 3.1",
            "note": "PiAPI 视频，画质高、可带声音；4–8 秒，720p / 1080p，仅横竖屏",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–6 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "veo3.1-fast",
            "label": "Veo 3.1 Fast",
            "note": "Veo 3.1 加速档，更快更省；4–8 秒，720p / 1080p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 1–4 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "seedance-2-mini",
            "label": "Seedance 2.0 Mini",
            "note": "PiAPI · Seedance 省钱档；4–15 秒，最高 720p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 1–4 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "kling-4.0-flash",
            "label": "Kling 4.0 Flash",
            "note": "PiAPI · Kling 4.0 加速档；3–20 秒，720p，只认首帧",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 1–4 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "kling-3.0-turbo",
            "label": "Kling 3.0 Turbo",
            "note": "PiAPI · Kling 3.0 加速档；3–15 秒，720p / 1080p，支持首尾帧",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 1–4 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "kling-2.6",
            "label": "Kling 2.6",
            "note": "PiAPI · Kling 2.6；5 / 10 秒，720p / 1080p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–6 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "kling-2.5",
            "label": "Kling 2.5",
            "note": "PiAPI · Kling 2.5；5 / 10 秒，720p / 1080p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–6 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "kling-2.1",
            "label": "Kling 2.1",
            "note": "PiAPI · Kling 2.1；5 / 10 秒，720p / 1080p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–6 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "veo3",
            "label": "Veo 3",
            "note": "PiAPI · Veo 3，可带声音；4–8 秒，720p / 1080p，仅横竖屏",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–6 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "veo3-fast",
            "label": "Veo 3 Fast",
            "note": "PiAPI · Veo 3 加速档；4–8 秒，720p / 1080p，仅横竖屏",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 1–4 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "wan-2.6",
            "label": "Wan 2.6",
            "note": "PiAPI · 通义万相 2.6，可带声音；5 / 10 / 15 秒，720p / 1080p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–6 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "wan-2.2",
            "label": "Wan 2.2",
            "note": "PiAPI · 通义万相 2.2；约 5 秒，720p，按条计费",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–5 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "wan-2.1",
            "label": "Wan 2.1",
            "note": "PiAPI · 通义万相 2.1；约 5 秒，480p，支持首尾帧",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–5 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "hailuo-2.3",
            "label": "Hailuo 2.3",
            "note": "PiAPI · 海螺 2.3；6 / 10 秒，768p / 1080p（1080p 仅 6 秒）",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–6 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "hailuo-2.3-fast",
            "label": "Hailuo 2.3 Fast",
            "note": "PiAPI · 海螺 2.3 加速档；6 / 10 秒，768p / 1080p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 1–4 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "hunyuan-video",
            "label": "Hunyuan Video",
            "note": "PiAPI · 混元视频；约 5 秒，按条计费",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–6 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "hunyuan-video-fast",
            "label": "Hunyuan Video Fast",
            "note": "PiAPI · 混元视频快速档，只做文生视频；约 5 秒",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 1–3 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "luma-ray-2",
            "label": "Luma Ray 2",
            "note": "PiAPI · Luma Dream Machine；5 / 9 秒，支持首尾帧",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–6 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "skyreels",
            "label": "SkyReels",
            "note": "PiAPI · 只做图生视频（需首帧）；约 5 秒",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 2–5 分钟/镜",
            "gateways": "piapi",
        },
        {
            "id": "framepack",
            "label": "FramePack",
            "note": "PiAPI · 图生长镜头（需首帧，可带尾帧）；10–30 秒，480p",
            "pricing_hint": "按模型与分辨率定价",
            "eta_hint": "约 3–10 分钟/镜",
            "gateways": "piapi",
        },
    ),
    "audio": (
        {
            "id": "qwen-tts-2025-05-22",
            "label": "Qwen TTS",
            "note": "阿里云百炼 Qwen 配音，站点唯一语音预设",
            "pricing_hint": "按 Token 计费",
            "eta_hint": "约数秒～十几秒",
        },
    ),
}

# 生图常用比例（与 Seedream 尺寸表交集）
IMAGE_ASPECT_RATIOS: tuple[str, ...] = (
    "auto",
    "1:1",
    "16:9",
    "9:16",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "21:9",
)
# Seedream / GPT Image 2：前端只给 1K/2K，避免选更高档被静默降档
IMAGE_RESOLUTIONS_STANDARD: tuple[str, ...] = ("1K", "2K")
# GPT Image 2.5 支持到 4K
IMAGE_RESOLUTIONS_GPT_IMAGE_25: tuple[str, ...] = ("1K", "2K", "4K")

VIDEO_ASPECT_RATIOS: tuple[str, ...] = ("9:16", "16:9", "1:1")
VIDEO_RESOLUTIONS_FULL: tuple[str, ...] = ("480p", "720p", "1080p")
VIDEO_RESOLUTIONS_SAFE: tuple[str, ...] = ("480p", "720p")
# MiniMax-H3：内部统一小写；不同上游插件的大小写由提交适配层兼容。
VIDEO_RESOLUTIONS_MINIMAX_H3: tuple[str, ...] = ("480p", "768p")


# 历史友好别名 / 旧连字符 id → TokenFree 点分规范 id
PRESET_MODEL_ALIASES: dict[str, str] = {
    "seedance-2-5": "seedance-2.5",
    "seedance2.5": "seedance-2.5",
    "seedance-2": "seedance-2.0",
    "seedance2": "seedance-2.0",
    "seedance-2-0": "seedance-2.0",
    "seedance2.0": "seedance-2.0",
    # Mini 上游未开通：历史选择一律落到 2.0，避免 ModelNotOpen
    "seedance-2-0-mini": "seedance-2.0",
    "seedance-2.0-mini": "seedance-2.0",
    "doubao-seedance-2-0-mini-260615": "seedance-2.0",
    "seedance-2-0-fast": "seedance-2.0-fast",
    "seedance-2.0-fast": "seedance-2.0-fast",
    "seedream-5-0-pro": "seedream-5.0-pro",
    "seedream-5.0-pro": "seedream-5.0-pro",
    "seedream-5-0": "seedream-5.0",
    "seedream-5": "seedream-5.0",
    "seedream5.0": "seedream-5.0",
    "seedream5": "seedream-5.0",
    "seedream-5-0-flash": "seedream-5.0-flash",
    "seedream-5.0-flash": "seedream-5.0-flash",
    "gpt-image-2-5": "gpt-image-2.5",
    "gpt-image-2.5": "gpt-image-2.5",
    "gpt-image-2.5-sunburst": "gpt-image-2.5",
    "gpt-image-2-5-sunburst": "gpt-image-2.5",
    "gpt-image-2.5-flare": "gpt-image-2.5",
    "gpt-image-2-5-flare": "gpt-image-2.5",
    "gemini-3.1-flash-tts": "qwen-tts-2025-05-22",
    "gemini-3.1-flash": "qwen-tts-2025-05-22",
}


def _row_supported_by_gateway(row: dict[str, str]) -> bool:
    """预设是否属于当前上游：未标 gateways 的属于 TokenFree / 9Router，标了 piapi 的在 PiAPI 下可用。"""
    from app.services.piapi.config import is_piapi_active

    gateways = {g.strip() for g in str(row.get("gateways") or "tokenfree").split(",")}
    return "piapi" in gateways if is_piapi_active() else "tokenfree" in gateways


def is_piapi_only_model(model_id: str | None) -> bool:
    """预设是否只属于 PiAPI（TokenFree 价目里没有，不能用 TokenFree 估价）。"""
    row = lookup_preset_row(model_id)
    gateways = {g.strip() for g in str((row or {}).get("gateways") or "tokenfree").split(",")}
    return row is not None and "tokenfree" not in gateways


def gateway_supports_model(model_id: str | None) -> bool:
    """当前上游是否支持该预设模型；不在预设内的自定义模型名一律放行，9Router（自由填写模型）也不限制。"""
    from app.services.nine_router.config import is_9router_active

    if is_9router_active():
        return True
    row = lookup_preset_row(model_id)
    return True if row is None else _row_supported_by_gateway(row)


def preset_ids(capability: LogicalModelCapability, *, all_gateways: bool = False) -> list[str]:
    """某能力下的预设上游 id；默认只返回当前上游支持的，all_gateways=True 返回全部。"""
    return [
        str(row["id"])
        for row in PRESET_MODELS.get(capability, ())
        if all_gateways or _row_supported_by_gateway(row)
    ]


def resolve_preset_alias(model_id: str | None) -> str:
    """将历史别名映射到预设规范 id；无映射则原样返回。"""
    raw = (model_id or "").strip()
    if not raw:
        return ""
    key = normalize_model_name(raw)
    for alias, canonical in PRESET_MODEL_ALIASES.items():
        if normalize_model_name(alias) == key:
            return canonical
    return raw


def lookup_preset_row(model_id: str | None) -> dict[str, str] | None:
    """按 id（含别名）查找预设行。"""
    mid = normalize_model_name(resolve_preset_alias(model_id))
    if not mid:
        return None
    for rows in PRESET_MODELS.values():
        for row in rows:
            if normalize_model_name(row["id"]) == mid:
                return dict(row)
    return None


def preset_display_meta(model_id: str | None) -> dict[str, str]:
    """前台目录展示：友好名、介绍、资费与大致出片时长。"""
    row = lookup_preset_row(model_id)
    if not row:
        return {"label": "", "note": "", "pricing_hint": "", "eta_hint": ""}
    return {
        "label": str(row.get("label") or ""),
        "note": str(row.get("note") or ""),
        "pricing_hint": str(row.get("pricing_hint") or ""),
        "eta_hint": str(row.get("eta_hint") or ""),
    }


def all_preset_channel_models() -> list[str]:
    """写入网关渠道的全部预设 id（文/图/视/音，含各上游专属预设，切换网关后无需重建渠道）。"""
    out: list[str] = []
    seen: set[str] = set()
    for cap in ("text", "image", "video", "audio"):
        for mid in preset_ids(cap, all_gateways=True):  # type: ignore[arg-type]
            key = normalize_model_name(mid)
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(mid)
    return out


def is_preset_model(capability: LogicalModelCapability, model_id: str | None) -> bool:
    """默认模型是否落在对应预设内（含历史别名）。"""
    mid = normalize_model_name(resolve_preset_alias(model_id))
    if not mid:
        return False
    return mid in {normalize_model_name(x) for x in preset_ids(capability)}


def clamp_default_to_preset(capability: LogicalModelCapability, model_id: str | None) -> str:
    """非法或不空缺省时落到该能力第一项预设。"""
    raw = resolve_preset_alias(model_id)
    if is_preset_model(capability, raw):
        # 返回预设表里的规范写法
        for mid in preset_ids(capability):
            if normalize_model_name(mid) == normalize_model_name(raw):
                return mid
    ids = preset_ids(capability)
    return ids[0] if ids else ""


def model_generation_options(model_id: str | None) -> dict[str, Any]:
    """Compatibility facade; model capabilities are owned by registered strategies."""
    from app.services.media_models import get_strategy
    try:
        return get_strategy(model_id or "").describe()
    except ValueError:
        return {}
