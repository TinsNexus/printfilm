"""PiAPI 出图：统一任务接口是异步的，这里在一次调用内完成「建任务 → 轮询 → 取图」。

Flux 的任务体在本文件；Gemini / Seedream / Qwen / Z-Image / MiniMax 见 image_tasks.py。

返回 OpenAI 风格 `{"data": [{"url": ...}]}`，供 ark 层沿用原有的落盘逻辑。
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from typing import Any

import httpx

from app.services.piapi.config import PIAPI_TASK_URL

logger = logging.getLogger(__name__)

# Flux 宽×高上限（PiAPI 文档：1,048,576 像素）
FLUX_MAX_PIXELS = 1024 * 1024
DEFAULT_FLUX_MODEL = "Qubico/flux1-dev"
_FLUX_MODELS = ("flux1-dev-advanced", "flux1-schnell", "flux1-dev")
_DONE = {"completed", "success", "succeeded"}
_FAILED = {"failed", "error", "cancelled", "canceled"}


def piapi_headers(api_key: str) -> dict[str, str]:
    """统一任务接口请求头。"""
    return {"X-API-Key": api_key, "Content-Type": "application/json"}


def resolve_flux_model(model: str) -> str:
    """把后台填写的模型 id 规整为 PiAPI Flux 模型名（补 `Qubico/` 前缀）；非 Flux 报错。"""
    low = (model or "").strip().lower()
    if "midjourney" in low or low.startswith("mj"):
        raise RuntimeError("PiAPI 已停止提供 Midjourney 接口，请改用 Flux 图片模型")
    if "flux" not in low:
        raise RuntimeError(f"PiAPI 暂不支持图片模型「{model}」，请在后台改选 PiAPI 图片模型")
    name = next((m for m in _FLUX_MODELS if m in low), "flux1-dev")
    return f"Qubico/{name}"


def pick_flux_size(size: str | None, aspect_ratio: str | None = None) -> tuple[int, int]:
    """按画幅挑 Flux 宽高：面积不超过上限、边长取 32 的倍数；无画幅信息出方图。"""
    ratio: float | None = None
    for raw, sep in (((size or "").strip().lower(), "x"), ((aspect_ratio or "").strip(), ":")):
        if sep not in raw:
            continue
        try:
            a, b = (float(v) for v in raw.split(sep, 1))
        except ValueError:
            continue
        if a > 0 and b > 0:
            ratio = a / b
            break
    if ratio is None:
        return 1024, 1024
    ratio = max(0.4, min(2.5, ratio))
    height = math.sqrt(FLUX_MAX_PIXELS / ratio)
    width = ratio * height
    return max(256, int(width) // 32 * 32), max(256, int(height) // 32 * 32)


def build_flux_task(
    *,
    model: str,
    prompt: str,
    size: str | None = None,
    aspect_ratio: str | None = None,
    ref_urls: list[str] | None = None,
) -> dict[str, Any]:
    """构造 Flux 任务体：有参考图走 img2img（仅首张），否则 txt2img。"""
    text = (prompt or "").strip() or "A high quality cinematic shot"
    refs = [u.strip() for u in (ref_urls or []) if (u or "").strip()]
    if refs:
        return {
            "model": resolve_flux_model(model),
            "task_type": "img2img",
            "input": {"prompt": text, "image": refs[0]},
        }
    width, height = pick_flux_size(size, aspect_ratio)
    return {
        "model": resolve_flux_model(model),
        "task_type": "txt2img",
        "input": {"prompt": text, "width": width, "height": height},
    }


def canonical_image_model(model: str) -> str:
    """后台填的模型名 → 策略 id（别名、大小写统一）；不认识的原样返回。"""
    from app.services.media_models import MediaValidationError, get_strategy

    try:
        return get_strategy(model).model_id
    except (MediaValidationError, ValueError):
        return (model or "").strip()


def build_piapi_image_task(
    *,
    model: str,
    prompt: str,
    resolution: str | None = None,
    size: str | None = None,
    aspect_ratio: str | None = None,
    ref_urls: list[str] | None = None,
) -> dict[str, Any]:
    """按模型挑任务体：已接入的原生模型走 image_tasks，其余按 Flux 处理（非 Flux 会报错）。"""
    from app.services.piapi.image_tasks import build_native_task

    text = (prompt or "").strip() or "A high quality cinematic shot"
    native = build_native_task(
        model_id=canonical_image_model(model),
        prompt=text,
        resolution=resolution or "1K",
        size=size,
        aspect_ratio=aspect_ratio,
        ref_urls=ref_urls,
    )
    if native is not None:
        return native
    return build_flux_task(model=model, prompt=text, size=size, aspect_ratio=aspect_ratio, ref_urls=ref_urls)


def _task_error(task: dict[str, Any], fallback: str) -> str:
    """从任务 error 对象取可读短句。"""
    err = task.get("error")
    if isinstance(err, dict):
        for key in ("message", "raw_message"):
            value = err.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:300]
    return fallback


def extract_piapi_image_url(task: dict[str, Any]) -> str | None:
    """从完成任务的 output 取图片地址（image_url / image_urls[0] / MiniMax 的 images[0].url）。"""
    output = task.get("output")
    if not isinstance(output, dict):
        return None
    url = output.get("image_url")
    if isinstance(url, str) and url.strip():
        return url.strip()
    urls = output.get("image_urls")
    if isinstance(urls, list) and urls and isinstance(urls[0], str) and urls[0].strip():
        return urls[0].strip()
    images = output.get("images")
    if isinstance(images, list) and images and isinstance(images[0], dict):
        url = images[0].get("url")
        if isinstance(url, str) and url.strip():
            return url.strip()
    return None


async def generate_image_via_piapi(
    *,
    api_key: str,
    model: str,
    prompt: str,
    size: str | None = None,
    aspect_ratio: str | None = None,
    ref_urls: list[str] | None = None,
    resolution: str | None = None,
    timeout_sec: float = 600.0,
    poll_interval: float = 2.0,
) -> dict[str, Any]:
    """建出图任务并轮询到完成，返回 `{"data": [{"url": ...}]}`；失败/超时抛 RuntimeError。"""
    body = build_piapi_image_task(
        model=model, prompt=prompt, resolution=resolution, size=size,
        aspect_ratio=aspect_ratio, ref_urls=ref_urls,
    )
    headers = piapi_headers(api_key)
    deadline = time.monotonic() + timeout_sec
    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=30.0)) as client:
        resp = await client.post(PIAPI_TASK_URL, headers=headers, json=body)
        if resp.status_code >= 400:
            raise RuntimeError(f"PiAPI 出图请求失败 HTTP {resp.status_code}: {resp.text[:300]}")
        created = resp.json()
        task = created.get("data") if isinstance(created.get("data"), dict) else {}
        task_id = str(task.get("task_id") or "").strip()
        if not task_id:
            raise RuntimeError(f"PiAPI 出图未返回任务 ID：{str(created.get('message') or created)[:300]}")
        while True:
            status = str(task.get("status") or "").strip().lower()
            if status in _DONE:
                url = extract_piapi_image_url(task)
                if not url:
                    raise RuntimeError("出图未返回图片地址，请稍后重试")
                return {"data": [{"url": url}], "piapi_task_id": task_id}
            if status in _FAILED:
                raise RuntimeError(f"PiAPI 出图失败：{_task_error(task, '上游任务失败')}")
            if time.monotonic() >= deadline:
                raise RuntimeError("PiAPI 出图超时，请稍后重试")
            await asyncio.sleep(poll_interval)
            try:
                poll = await client.get(f"{PIAPI_TASK_URL}/{task_id}", headers=headers)
            except httpx.HTTPError as exc:
                # 单次网络抖动继续轮询，由 deadline 收敛
                logger.warning("PiAPI image poll network error task=%s: %s", task_id, exc)
                continue
            if poll.status_code == 429 or poll.status_code >= 500:
                continue
            if poll.status_code >= 400:
                raise RuntimeError(f"PiAPI 出图查询失败 HTTP {poll.status_code}: {poll.text[:300]}")
            inner = poll.json().get("data")
            if isinstance(inner, dict):
                task = inner
