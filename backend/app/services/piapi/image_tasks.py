"""PiAPI 统一任务接口：各图片模型的任务体构造与参考价。

模型 id 与 `media_models` 策略一致；任务体字段按 PiAPI 文档（2026-11）：
- Gemini（nano-banana-*）、Seedream 5：原生档位，直接传 1K/2K/3K/4K
- Qwen / Z-Image / MiniMax / Flux：只收宽高，按画幅和像素上限换算
"""

from __future__ import annotations

import math
from typing import Any, Callable

# 参考价（美元/张，PiAPI 官网文档）：初始化价格草稿用，不是用户实收价
PIAPI_IMAGE_REFERENCE_USD: dict[str, dict[str, str]] = {
    "nano-banana-pro": {"1K": "0.105", "2K": "0.105", "4K": "0.18"},
    "nano-banana-2": {"1K": "0.06", "2K": "0.08", "4K": "0.12"},
    "nano-banana-2.1": {"1K": "0.03", "2K": "0.04", "4K": "0.09"},
    "gemini-2.5-flash-image": {"1K": "0.03"},
    "seedream-5.0-lite": {"2K": "0.052", "3K": "0.052"},
    "qwen-image": {"1K": "0.025"},  # 文生图 0.015、改图 0.025，按高的一档
    "qwen-image-2.1": {"1K": "0.015"},
    "z-image": {"1K": "0.006"},  # 非方图略超 1MP，按 0.006 档
    "minimax-image-01": {"1K": "0.01", "2K": "0.01"},
}

_GEMINI_TASKS = {
    "nano-banana-pro": "nano-banana-pro",
    "nano-banana-2": "nano-banana-2",
    "nano-banana-2.1": "nano-banana-2.1",
    "gemini-2.5-flash-image": "gemini-2.5-flash-image",
}
_SEEDREAM_TASKS = {"seedream-5.0-pro": "seedream-5-pro", "seedream-5.0-lite": "seedream-5-lite"}
# PiAPI Gemini / Seedream 接受的画幅；不在列表（如 auto）就不传，让上游按参考图或默认出图
_NATIVE_RATIOS = {"1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "4:5", "5:4"}


def _ratio_value(size: str | None, aspect_ratio: str | None) -> float | None:
    """从 WxH 或 a:b 取宽高比；取不到返回 None。"""
    for raw, sep in (((size or "").strip().lower(), "x"), ((aspect_ratio or "").strip(), ":")):
        if sep not in raw:
            continue
        try:
            a, b = (float(v) for v in raw.split(sep, 1))
        except ValueError:
            continue
        if a > 0 and b > 0:
            return a / b
    return None


def fit_size(
    size: str | None,
    aspect_ratio: str | None,
    *,
    max_pixels: int,
    max_side: int = 4096,
    min_side: int = 64,
    step: int = 32,
) -> tuple[int, int]:
    """按画幅挑宽高：面积不超过 max_pixels、单边在 [min_side, max_side]、取 step 的倍数；无画幅出方图。"""
    ratio = _ratio_value(size, aspect_ratio)
    ratio = 1.0 if ratio is None else max(0.4, min(2.5, ratio))
    height = math.sqrt(max_pixels / ratio)
    width = ratio * height
    scale = min(1.0, max_side / width, max_side / height)
    width, height = width * scale, height * scale

    def snap(value: float) -> int:
        return max(min_side, min(max_side, int(value) // step * step))

    return snap(width), snap(height)


def _native_ratio(aspect_ratio: str | None) -> str | None:
    """Gemini / Seedream 画幅：只传上游认识的值。"""
    value = (aspect_ratio or "").strip()
    return value if value in _NATIVE_RATIOS else None


def _gemini(model_id: str, prompt: str, resolution: str, aspect_ratio: str | None, refs: list[str], size: str | None):
    """Nano Banana / Gemini Flash Image：model 固定 gemini，task_type 区分版本。"""
    body: dict[str, Any] = {"prompt": prompt, "output_format": "png"}
    if model_id != "gemini-2.5-flash-image":
        body["resolution"] = resolution
    if ratio := _native_ratio(aspect_ratio):
        body["aspect_ratio"] = ratio
    if refs:
        body["image_urls"] = refs[:14]
    return {"model": "gemini", "task_type": _GEMINI_TASKS[model_id], "input": body}


def _seedream(model_id: str, prompt: str, resolution: str, aspect_ratio: str | None, refs: list[str], size: str | None):
    """Seedream 5：size 直接传档位，参考图最多 10 张。"""
    body: dict[str, Any] = {"prompt": prompt, "size": resolution, "output_format": "png"}
    if ratio := _native_ratio(aspect_ratio):
        body["aspect_ratio"] = ratio
    if refs:
        body["image_urls"] = refs[:10]
    return {"model": "seedream", "task_type": _SEEDREAM_TASKS[model_id], "input": body}


def _qwen(model_id: str, prompt: str, resolution: str, aspect_ratio: str | None, refs: list[str], size: str | None):
    """Qwen Image：有参考图走 image-edit（image1..3），否则文生图按面积上限出宽高。"""
    if refs and model_id == "qwen-image":
        body: dict[str, Any] = {"prompt": prompt}
        for i, url in enumerate(refs[:3], start=1):
            body[f"image{i}"] = url
        return {"model": "Qubico/qwen-image", "task_type": "image-edit", "input": body}
    cap = 1_763_584 if model_id == "qwen-image-2.1" else 1_048_576
    width, height = fit_size(size, aspect_ratio, max_pixels=cap)
    return {
        "model": f"Qubico/{model_id}",
        "task_type": "txt2img",
        "input": {"prompt": prompt, "width": width, "height": height},
    }


def _z_image(model_id: str, prompt: str, resolution: str, aspect_ratio: str | None, refs: list[str], size: str | None):
    """Z-Image：单边 ≤1440，按 1MP 出图（官方推荐 1024²）。"""
    width, height = fit_size(size, aspect_ratio, max_pixels=1024 * 1024, max_side=1440)
    return {
        "model": "Qubico/z-image",
        "task_type": "txt2img",
        "input": {"prompt": prompt, "width": width, "height": height, "batch_size": 1},
    }


def _minimax(model_id: str, prompt: str, resolution: str, aspect_ratio: str | None, refs: list[str], size: str | None):
    """MiniMax image-01：size 为 WxH，单边 512–2048 且是 8 的倍数。"""
    pixels = 2048 * 2048 if resolution == "2K" else 1024 * 1024
    width, height = fit_size(size, aspect_ratio, max_pixels=pixels, max_side=2048, min_side=512, step=8)
    return {
        "model": "minimax",
        "task_type": "image-01",
        "input": {"prompt": prompt, "n": 1, "size": f"{width}x{height}", "response_format": "url"},
    }


_BUILDERS: dict[str, Callable[..., dict[str, Any]]] = {
    **{mid: _gemini for mid in _GEMINI_TASKS},
    **{mid: _seedream for mid in _SEEDREAM_TASKS},
    "qwen-image": _qwen,
    "qwen-image-2.1": _qwen,
    "z-image": _z_image,
    "minimax-image-01": _minimax,
}


def supported_piapi_image_models() -> tuple[str, ...]:
    """非 Flux 的 PiAPI 图片模型 id（Flux 由 image.py 自己处理）。"""
    return tuple(_BUILDERS)


def build_native_task(
    *,
    model_id: str,
    prompt: str,
    resolution: str,
    size: str | None = None,
    aspect_ratio: str | None = None,
    ref_urls: list[str] | None = None,
) -> dict[str, Any] | None:
    """按模型 id 构造任务体；不认识的模型返回 None，由调用方回落 Flux。"""
    builder = _BUILDERS.get((model_id or "").strip().lower())
    if builder is None:
        return None
    refs = [u.strip() for u in (ref_urls or []) if (u or "").strip()]
    return builder(model_id.strip().lower(), prompt, resolution or "1K", aspect_ratio, refs, size)
