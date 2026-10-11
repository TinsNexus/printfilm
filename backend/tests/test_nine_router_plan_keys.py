"""9Router 按订阅套餐（users.plan）选 Key。"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.services.nine_router import plan_keys as pk


def test_parse_and_merge_plan_keys():
    raw = pk.merge_plan_keys("", {"free": "sk-free", "pro": "sk-pro", " ": "x"})
    assert pk.parse_plan_keys(raw) == {"free": "sk-free", "pro": "sk-pro"}
    raw = pk.merge_plan_keys(raw, {"free": "", "pro": "sk-pro2"})
    assert pk.parse_plan_keys(raw) == {"pro": "sk-pro2"}
    assert pk.merge_plan_keys(raw, {"pro": ""}) == ""
    assert pk.parse_plan_keys("not json") == {}


def _settings(**kw):
    return Settings(_env_file=None, **kw)


def test_override_only_for_active_9router_and_matching_plan(monkeypatch):
    s = _settings(
        upstream_gateway_type="9router",
        ninerouter_plan_keys=pk.merge_plan_keys("", {"pro": "sk-pro"}),
    )
    monkeypatch.setattr("app.config.get_settings", lambda: s)
    token = pk.set_current_plan("pro")
    try:
        assert pk.plan_api_key_override() == "sk-pro"
    finally:
        pk.reset_current_plan(token)
    token = pk.set_current_plan("free")
    try:
        assert pk.plan_api_key_override() == ""
    finally:
        pk.reset_current_plan(token)
    assert pk.plan_api_key_override() == ""


def test_override_ignored_when_tokenfree(monkeypatch):
    s = _settings(upstream_gateway_type="tokenfree", ninerouter_plan_keys=pk.merge_plan_keys("", {"pro": "sk-pro"}))
    monkeypatch.setattr("app.config.get_settings", lambda: s)
    token = pk.set_current_plan("pro")
    try:
        assert pk.plan_api_key_override() == ""
    finally:
        pk.reset_current_plan(token)


@pytest.mark.asyncio
async def test_billing_scope_sets_plan_from_user_plan(monkeypatch):
    from app.services.billing.context import billing_scope

    s = _settings(upstream_gateway_type="9router", ninerouter_plan_keys=pk.merge_plan_keys("", {"pro": "sk-pro"}))
    monkeypatch.setattr("app.config.get_settings", lambda: s)
    async with billing_scope(7, user_plan="pro"):
        assert pk.plan_api_key_override() == "sk-pro"
    assert pk.plan_api_key_override() == ""
