"""Catalog discovery and capability inference for models hosted behind 9Router."""

from __future__ import annotations

import logging
from typing import Any

from app.services.model_routing_config import infer_model_capability, normalize_model_name
from app.services.nine_router.client import NineRouterClient

logger = logging.getLogger(__name__)


def infer_9router_capability(model_id: str) -> str:
    """Infer capability of a model id from 9Router."""
    low = (model_id or "").lower()
    if any(k in low for k in ("tts", "speech", "voice", "audio", "whisper", "elevenlabs")):
        return "audio"
    if any(k in low for k in ("image", "dall-e", "flux", "midjourney", "imagen", "seedream")):
        return "image"
    if any(k in low for k in ("video", "sora", "seedance", "luma", "kling", "gen-2", "gen-3", "minimax-h")):
        return "video"
    # Default fallback to standard inference
    return infer_model_capability(model_id)


async def list_9router_catalog_models(
    client: NineRouterClient | None = None,
    capability: str = "all",
) -> list[dict[str, str]]:
    """Fetch model list from 9Router and return normalized dicts for Printfilm."""
    cli = client or NineRouterClient()
    items = await cli.list_models()
    cap_filter = (capability or "all").strip().lower()

    out: list[dict[str, str]] = []
    seen: set[str] = set()

    for item in items:
        mid = item.id
        cap = infer_9router_capability(mid)
        if cap_filter not in {"", "all"} and cap != cap_filter:
            continue
        key = normalize_model_name(mid)
        if key in seen:
            continue
        seen.add(key)
        label = item.display_name or mid
        out.append({"id": mid, "label": label, "capability": cap})

    out.sort(key=lambda row: row["id"])
    return out
