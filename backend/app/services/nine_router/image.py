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
