"""Adapter linking 9Router package with Printfilm routing models and settings."""

from __future__ import annotations

from typing import Any

from app.schemas_routing import SystemModelChannel
from app.services.nine_router.config import (
    NINEROUTER_CHANNEL_ID,
    NINEROUTER_CHANNEL_NAME,
    NINEROUTER_DEFAULT_BASE_URL,
    resolve_9router_api_key,
    resolve_9router_base_url,
)


def create_9router_channel(
    *,
    api_key: str = "",
    has_api_key: bool | None = None,
    base_url: str = "",
    models: list[str] | None = None,
    enabled: bool = True,
) -> SystemModelChannel:
    """Construct SystemModelChannel for 9Router."""
    key = (api_key or resolve_9router_api_key() or "").strip()
    url = (base_url or resolve_9router_base_url()).strip()
    return SystemModelChannel(
        id=NINEROUTER_CHANNEL_ID,
        name=NINEROUTER_CHANNEL_NAME,
        base_url=url,
        api_key=key,
        has_api_key=bool(key) if has_api_key is None else bool(has_api_key),
        api_format="openai",
        protocol="openai",
        models=list(dict.fromkeys(m.strip() for m in (models or []) if m and m.strip())),
        enabled=enabled,
        sort_order=0,
    )


def apply_9router_flat_overlay(
    flat: dict[str, Any],
    channels: list[SystemModelChannel],
) -> dict[str, Any]:
    """Overlay 9Router configuration onto runtime LLM / Ark settings."""
    channel = next((item for item in channels if item.id == NINEROUTER_CHANNEL_ID), None)
    if channel is None:
        return flat
    out = dict(flat)
    url = channel.base_url or NINEROUTER_DEFAULT_BASE_URL
    out["openai_base_url"] = url
    out["ark_base_url"] = url
    key = (channel.api_key or "").strip()
    if key:
        out["openai_api_key"] = key
        out["ark_api_key"] = key
    return out


def is_9router_channel(channel_id: str | None, base_url: str | None = None) -> bool:
    """Check if given channel represents 9Router."""
    cid = (channel_id or "").strip().lower()
    if cid in {NINEROUTER_CHANNEL_ID, "9_router", "nine_router"}:
        return True
    b = (base_url or "").strip().lower()
    if "localhost:20128" in b or "127.0.0.1:20128" in b or "9router" in b:
        return True
    return False
