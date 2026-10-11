"""按订阅套餐（users.plan）选择 9Router API Key。

管理端为每个套餐配置一把 9Router Key（在 9Router 侧限定该 Key 可用的 model/combo），
任务执行时按任务发起人的 plan 取 Key；没有对应套餐 Key 时回落默认 NINEROUTER_API_KEY。
"""

from __future__ import annotations

import json
from contextvars import ContextVar

_current_plan: ContextVar[str | None] = ContextVar("ninerouter_plan", default=None)


def parse_plan_keys(raw: str | None) -> dict[str, str]:
    """解析存库的 JSON：{plan: key}；非法内容返回空表。"""
    try:
        data = json.loads(raw or "")
    except (TypeError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(k).strip(): str(v).strip() for k, v in data.items() if str(k).strip() and str(v or "").strip()}


def merge_plan_keys(raw: str | None, patch: dict[str, str]) -> str:
    """合并增量：键非空则设置/覆盖，空串则删除该套餐；返回新的 JSON 文本。"""
    current = parse_plan_keys(raw)
    for plan, key in patch.items():
        name = str(plan or "").strip()
        if not name:
            continue
        value = str(key or "").strip()
        if value:
            current[name] = value
        else:
            current.pop(name, None)
    return json.dumps(current, ensure_ascii=False) if current else ""


def set_current_plan(plan: str | None):
    """设置当前请求所属套餐，返回 token 供 reset。"""
    return _current_plan.set((plan or "").strip() or None)


def reset_current_plan(token) -> None:
    _current_plan.reset(token)


def plan_api_key_override() -> str:
    """当前套餐对应的 9Router Key；非 9Router、无套餐或未配置时返回空串。"""
    plan = _current_plan.get()
    if not plan:
        return ""
    from app.config import get_settings
    from app.services.nine_router.config import is_9router_active

    s = get_settings()
    if not is_9router_active(s):
        return ""
    return parse_plan_keys(getattr(s, "ninerouter_plan_keys", "")).get(plan, "")
