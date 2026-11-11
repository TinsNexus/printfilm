"""Image generation module for 9Router gateway.

Uses OpenAI standard POST /v1/images/generations rather than TokenFree's custom /v1/responses.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.nine_router.client import NineRouterClient
from app.services.nine_router.models import (
    NineRouterImageGenerationRequest,
    NineRouterImageResponse,
)

logger = logging.getLogger(__name__)


def build_9router_image_request(
    *,
    model: str,
    prompt: str,
    size: str = "1024x1024",
    ref_urls: list[str] | None = None,
    style_ref_urls: list[str] | None = None,
    quality: str = "standard",
    n: int = 1,
) -> NineRouterImageGenerationRequest:
    """Build standard OpenAI image request body with embedded style / reference cues."""
    text = (prompt or "").strip() or "A high quality cinematic shot"
    refs = [u.strip() for u in (ref_urls or []) if (u or "").strip()]
    style_refs = [u.strip() for u in (style_ref_urls or []) if (u or "").strip()]

    # If reference images are passed, append hints for modern multimodal/image-to-image models
    if style_refs:
        text = f"{text}. Style reference: {' '.join(style_refs)}"
    if refs:
        text = f"{text}. Composition reference: {' '.join(refs)}"

    # Normalize size format (e.g., '2k' -> '1792x1024' or preserve if standard widthxheight)
    normalized_size = normalize_image_size(size)

    extra_params: dict[str, Any] = {}
    if refs:
        extra_params["reference_images"] = refs

    return NineRouterImageGenerationRequest(
        model=model or "dall-e-3",
        prompt=text,
        size=normalized_size,
        quality=quality,
        n=n,
        extra_params=extra_params,
    )


def normalize_image_size(size: str) -> str:
    """Map Printfilm resolution tags to standard OpenAI image dimensions."""
    s = (size or "").strip().lower()
    if not s or s == "default":
        return "1024x1024"
    if s in {"1024x1024", "1792x1024", "1024x1792", "512x512"}:
        return s
    if s == "2k" or s == "16:9":
        return "1792x1024"
    if s == "9:16":
        return "1024x1792"
    if "x" in s:
        return s
    return "1024x1024"


def pick_9router_image_size(size: str | None, aspect_ratio: str | None = None) -> str:
    """按画幅挑 9Router/OpenAI 通用尺寸：横 1792x1024、竖 1024x1792、方 1024x1024。

    size 为 WxH 时按其宽高比；为 1K/2K 等档位时看 aspect_ratio（如 9:16）；都没有则方图。
    """
    ratio: float | None = None
    raw = (size or "").strip().lower()
    if "x" in raw:
        try:
            w, h = raw.split("x", 1)
            if int(w) > 0 and int(h) > 0:
                ratio = int(w) / int(h)
        except ValueError:
            ratio = None
    if ratio is None and ":" in (aspect_ratio or ""):
        try:
            a, b = str(aspect_ratio).split(":", 1)
            if float(a) > 0 and float(b) > 0:
                ratio = float(a) / float(b)
        except ValueError:
            ratio = None
    if ratio is None:
        return "1024x1024"
    if ratio > 1.2:
        return "1792x1024"
    if ratio < 0.83:
        return "1024x1792"
    return "1024x1024"


async def generate_image_via_9router(
    client: NineRouterClient,
    *,
    model: str,
    prompt: str,
    size: str = "1024x1024",
    ref_urls: list[str] | None = None,
    style_ref_urls: list[str] | None = None,
) -> str | None:
    """Generate image via 9Router and extract primary image URL."""
    req = build_9router_image_request(
        model=model,
        prompt=prompt,
        size=size,
        ref_urls=ref_urls,
        style_ref_urls=style_ref_urls,
    )
    resp: NineRouterImageResponse = await client.generate_images(req)
    if resp.data:
        first = resp.data[0]
        if first.url:
            return first.url
        if first.b64_json:
            return f"data:image/png;base64,{first.b64_json}"
    return None
