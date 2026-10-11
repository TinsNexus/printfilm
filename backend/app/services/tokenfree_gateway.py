"""Unified upstream model gateway supporting both TokenFree New API and 9Router.

Provides seamless backward compatibility for TokenFree while dynamically delegating
to 9Router when configured.
"""

from __future__ import annotations

import os
from typing import Any

from app.schemas_routing import SystemModelChannel
from app.services.nine_router.config import (
    GATEWAY_TYPE_9ROUTER,
    GATEWAY_TYPE_TOKENFREE,
    NINEROUTER_CHANNEL_ID,
    NINEROUTER_CHANNEL_NAME,
    NINEROUTER_DEFAULT_BASE_URL,
    get_upstream_gateway_type,
    is_9router_active,
    is_9router_type,
    normalize_9router_base_url,
    resolve_9router_api_key,
    resolve_9router_base_url,
    site_origin_9router,
)

# TokenFree defaults
TOKENFREE_CHANNEL_ID = "tokenfree"
TOKENFREE_CHANNEL_NAME = "TokenFree New API"
TOKENFREE_BASE_URL = "https://www.tokenfree.com/v1"
TOKENFREE_CONSOLE_URL = "https://www.tokenfree.com/channels"
TOKENFREE_QUOTA_PER_USD = 500_000

# Channel IDs recognized as primary gateway
PRIMARY_GATEWAY_CHANNEL_IDS: frozenset[str] = frozenset(
    {TOKENFREE_CHANNEL_ID, NINEROUTER_CHANNEL_ID}
)


def get_active_gateway_type() -> str:
    """Return active gateway type: '9router' or 'tokenfree'."""
    if is_9router_active():
        return GATEWAY_TYPE_9ROUTER
    return GATEWAY_TYPE_TOKENFREE


def get_active_channel_id() -> str:
    """Return active gateway channel ID."""
    if is_9router_active():
        return NINEROUTER_CHANNEL_ID
    return TOKENFREE_CHANNEL_ID


def get_active_channel_name() -> str:
    """Return active gateway display name."""
    if is_9router_active():
        return NINEROUTER_CHANNEL_NAME
    return TOKENFREE_CHANNEL_NAME


def get_active_base_url() -> str:
    """Return active gateway base URL."""
    if is_9router_active():
        return resolve_9router_base_url()
    return TOKENFREE_BASE_URL


def is_gateway_channel(channel_id: str | None = None, base_url: str | None = None) -> bool:
    """Check if channel ID or base URL belongs to supported gateway (TokenFree or 9Router)."""
    cid = (channel_id or "").strip().lower()
    if cid in PRIMARY_GATEWAY_CHANNEL_IDS:
        return True
    raw_base = (base_url or "").strip().lower()
    if "tokenfree.com" in raw_base or "localhost:20128" in raw_base or "127.0.0.1:20128" in raw_base or "9router" in raw_base:
        return True
    return False


def tokenfree_site_origin(base_url: str | None = None) -> str:
    """Convert /v1 base URL to origin URL for dashboard/pricing."""
    if is_9router_active():
        return site_origin_9router(base_url or get_active_base_url())
    raw = (base_url or TOKENFREE_BASE_URL).strip().rstrip("/")
    if raw.endswith("/v1"):
        return raw[: -len("/v1")].rstrip("/")
    return raw


def resolve_tokenfree_api_key() -> str:
    """Resolve API key for active gateway (9Router or TokenFree)."""
    if is_9router_active():
        return resolve_9router_api_key()

    try:
        from app.services.model_settings import get_routing_snapshot

        channels = get_routing_snapshot().channels
    except Exception:  # noqa: BLE001
        channels = []

    for channel in channels:
        if channel.id in PRIMARY_GATEWAY_CHANNEL_IDS and (channel.api_key or "").strip():
            return (channel.api_key or "").strip()

    from app.config import get_settings

    s = get_settings()
    return (s.openai_api_key or s.ark_api_key or "").strip()


def locked_tokenfree_channel(
    *,
    api_key: str = "",
    has_api_key: bool | None = None,
    models: list[str] | None = None,
    enabled: bool = True,
    force_tokenfree: bool = False,
) -> SystemModelChannel:
    """Construct SystemModelChannel for active gateway (dynamically chooses 9Router or TokenFree)."""
    key = (api_key or "").strip()

    if is_9router_active() and not force_tokenfree:
        base_url = resolve_9router_base_url()
        channel_name = NINEROUTER_CHANNEL_NAME
        channel_id = TOKENFREE_CHANNEL_ID  # Preserve id for DB consistency or use NINEROUTER_CHANNEL_ID
        protocol = "openai"
    else:
        base_url = TOKENFREE_BASE_URL
        channel_name = TOKENFREE_CHANNEL_NAME
        channel_id = TOKENFREE_CHANNEL_ID
        protocol = "auto"

    return SystemModelChannel(
        id=channel_id,
        name=channel_name,
        base_url=base_url,
        api_key=key,
        has_api_key=bool(key) if has_api_key is None else bool(has_api_key),
        api_format="openai",
        protocol=protocol,
        models=list(dict.fromkeys(m.strip() for m in (models or []) if m and m.strip())),
        enabled=enabled,
        sort_order=0,
    )


def pick_migratable_api_key(channels: list[SystemModelChannel]) -> str:
    """Pick migratable API key from gateway channels."""
    for channel in channels:
        if channel.id in PRIMARY_GATEWAY_CHANNEL_IDS and (channel.api_key or "").strip():
            return (channel.api_key or "").strip()
    for channel in channels:
        key = (channel.api_key or "").strip()
        base = (channel.base_url or "").strip().lower()
        if key and ("tokenfree.com" in base or "localhost:20128" in base or "9router" in base):
            return key
    return ""


def gateway_from_flat(flat: dict[str, Any]) -> tuple[bool, str, str]:
    """按 flat 配置（而非已缓存的 Settings）判断是否 9Router，返回 (active, base_url, api_key)。"""
    if not is_9router_type(str(flat.get("upstream_gateway_type") or "")):
        return False, TOKENFREE_BASE_URL, ""
    return (
        True,
        normalize_9router_base_url(str(flat.get("ninerouter_base_url") or "")),
        str(flat.get("ninerouter_api_key") or "").strip(),
    )


def apply_gateway_to_channels(channels: list[SystemModelChannel], flat: dict[str, Any]) -> list[SystemModelChannel]:
    """运行时覆盖：9Router 开启时把 TokenFree 渠道的地址/Key/名称换成 9Router，数据库里的 TokenFree 配置保持不变。"""
    active, base, key = gateway_from_flat(flat)
    if not active:
        return channels
    return [
        ch.model_copy(
            update={
                "name": NINEROUTER_CHANNEL_NAME,
                "base_url": base,
                "api_key": key,
                "has_api_key": bool(key),
                "protocol": "openai",
            }
        )
        if ch.id == TOKENFREE_CHANNEL_ID
        else ch
        for ch in channels
    ]


def apply_tokenfree_flat_overlay(flat: dict[str, Any], channels: list[SystemModelChannel]) -> dict[str, Any]:
    """把当前上游（TokenFree 或 9Router）的 Base URL / Key 同步到 LLM 与方舟客户端共用字段。"""
    channel = next((item for item in channels if item.id in PRIMARY_GATEWAY_CHANNEL_IDS), None)
    if channel is None:
        return flat
    out = dict(flat)
    active, base, key = gateway_from_flat(flat)
    if not active:
        key = (channel.api_key or "").strip()
    out["openai_base_url"] = base
    out["ark_base_url"] = base
    if key:
        out["openai_api_key"] = key
        out["ark_api_key"] = key
    return out
