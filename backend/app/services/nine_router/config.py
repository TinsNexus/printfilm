"""Configuration settings and environment resolver for 9Router."""

from __future__ import annotations

from app.config import Settings, get_settings

NINEROUTER_CHANNEL_ID = "9router"
NINEROUTER_CHANNEL_NAME = "9Router Gateway"
NINEROUTER_DEFAULT_BASE_URL = "http://localhost:20128/v1"
NINEROUTER_DEFAULT_CONSOLE_URL = "http://localhost:20128"

# Supported upstream gateway types
GATEWAY_TYPE_TOKENFREE = "tokenfree"
GATEWAY_TYPE_9ROUTER = "9router"


def is_9router_type(value: str | None) -> bool:
    """判断网关类型字符串是否表示 9Router。"""
    return (value or "").strip().lower() in {GATEWAY_TYPE_9ROUTER, "nine_router", "9_router"}


def normalize_9router_base_url(url: str | None) -> str:
    """规整 9Router Base URL（保证以 /v1 结尾，空值回落默认）。"""
    raw = (url or "").strip().rstrip("/")
    if not raw:
        return NINEROUTER_DEFAULT_BASE_URL
    return raw if raw.endswith("/v1") else f"{raw}/v1"


def get_upstream_gateway_type(settings: Settings | None = None) -> str:
    """当前上游网关类型：'9router' 或 'tokenfree'（运行时由后台开关/环境变量决定）。"""
    s = settings or get_settings()
    return GATEWAY_TYPE_9ROUTER if is_9router_type(getattr(s, "upstream_gateway_type", "")) else GATEWAY_TYPE_TOKENFREE


def is_9router_active(settings: Settings | None = None) -> bool:
    """9Router 是否为当前上游。"""
    return get_upstream_gateway_type(settings) == GATEWAY_TYPE_9ROUTER


def resolve_9router_base_url(settings: Settings | None = None) -> str:
    """9Router Base URL（以 /v1 结尾）。"""
    s = settings or get_settings()
    return normalize_9router_base_url(getattr(s, "ninerouter_base_url", ""))


def resolve_9router_api_key(settings: Settings | None = None) -> str:
    """9Router API Key，只取 NINEROUTER 配置，不回落到 TokenFree Key。"""
    s = settings or get_settings()
    return (getattr(s, "ninerouter_api_key", "") or "").strip()


def site_origin_9router(base_url: str | None = None) -> str:
    """去掉 /v1，得到 9Router 站点 origin。"""
    raw = (base_url or NINEROUTER_DEFAULT_BASE_URL).strip().rstrip("/")
    if raw.endswith("/v1"):
        return raw[: -len("/v1")].rstrip("/")
    return raw
