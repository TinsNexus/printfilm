# -*- coding: utf-8 -*-
"""Token 单价与费用换算。"""
from __future__ import annotations

import math
from typing import Any

from app.config import Settings, get_settings

SKUS: list[dict[str, Any]] = [
    {"id": "topup_10", "name": "体验充值", "amount_fen": 10000, "credit_fen": 10000},
    {"id": "topup_49", "name": "基础充值", "amount_fen": 49000, "credit_fen": 49000},
    {"id": "topup_99", "name": "进阶充值", "amount_fen": 99000, "credit_fen": 104000, "recommended": True},
    {"id": "topup_199", "name": "专业充值", "amount_fen": 199000, "credit_fen": 220000},
]

ORDER_EXPIRE_SECONDS = 300

# Kie 1 credit ≈ $0.005；按约 7 CNY/USD 折合 ¥0.035 ≈ 3.5 分（可配置）
DEFAULT_KIE_FEN_PER_CREDIT = 3.5


def provider_yuan_per_m(billing_key: str, settings: Settings | None = None) -> float:
    s = settings or get_settings()
    table = {
        "seedance2:video0": s.billing_seedance_video0,
        "seedance2:video1": s.billing_seedance_video1,
        "llm_chat": s.billing_llm_per_m,
        "seedream": s.billing_seedream_per_m,
        "tts": s.billing_tts_per_m,
    }
    return float(table.get(billing_key, s.billing_llm_per_m))


def kie_fen_per_credit(settings: Settings | None = None) -> float:
    s = settings or get_settings()
    raw = getattr(s, "billing_kie_fen_per_credit", None)
    try:
        value = float(raw if raw is not None else DEFAULT_KIE_FEN_PER_CREDIT)
    except (TypeError, ValueError):
        value = DEFAULT_KIE_FEN_PER_CREDIT
    return max(0.01, value)


def kie_credits_to_cost_fen(
    credits: Any,
    settings: Settings | None = None,
) -> int | None:
    """Kie creditsConsumed → 上游成本（分）。"""
    try:
        amount = float(credits)
    except (TypeError, ValueError):
        return None
    if amount <= 0:
        return None
    return max(1, int(math.ceil(amount * kie_fen_per_credit(settings))))


def charge_fen_for_tokens(
    tokens: int,
    billing_key: str,
    *,
    settings: Settings | None = None,
) -> tuple[int, int]:
    """Return (cost_fen, charge_fen) with markup."""
    s = settings or get_settings()
    t = max(0, int(tokens))
    yuan_per_m = provider_yuan_per_m(billing_key, s)
    cost = math.ceil(t / 1_000_000 * yuan_per_m * 100) if t else 0
    charge = math.ceil(cost * float(s.billing_markup)) if cost else 0
    if t > 0 and charge < 1:
        charge = 1
        cost = max(cost, 1)
    return cost, charge


def parse_upstream_cost_fen(
    data: dict[str, Any] | None,
    settings: Settings | None = None,
) -> int | None:
    """从火山 usage / Kie credits / 响应块解析上游成本（分）；无则 None。"""
    if not data:
        return None
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else data
    if not isinstance(usage, dict):
        return None
    for key in ("cost_fen", "cost_cents"):
        if usage.get(key) is not None:
            try:
                return max(0, int(usage[key]))
            except (TypeError, ValueError):
                pass
    for key in ("cost", "total_cost", "amount", "cost_yuan", "total_cost_yuan"):
        if usage.get(key) is not None:
            try:
                return max(0, int(math.ceil(float(usage[key]) * 100)))
            except (TypeError, ValueError):
                pass
    # Kie：任务级 creditsConsumed（usage 内或顶层）
    credits = usage.get("creditsConsumed")
    if credits is None:
        credits = data.get("creditsConsumed")
    converted = kie_credits_to_cost_fen(credits, settings)
    if converted is not None:
        return converted
    return None


def charge_fen_for_usage(
    tokens: int,
    billing_key: str,
    *,
    raw_usage: dict[str, Any] | None = None,
    settings: Settings | None = None,
) -> tuple[int, int, bool]:
    """按上游实际成本或 token 用量计算 (cost_fen, charge_fen, used_upstream_cost)。

    有上游成本时：charge = ceil(cost × markup)（按比例加价）。
    """
    s = settings or get_settings()
    upstream_cost = parse_upstream_cost_fen(raw_usage, settings=s)
    if upstream_cost is not None and upstream_cost > 0:
        cost = upstream_cost
        charge = math.ceil(cost * float(s.billing_markup))
        if charge < 1:
            charge = 1
        return cost, charge, True
    cost, charge = charge_fen_for_tokens(tokens, billing_key, settings=s)
    return cost, charge, False


def parse_usage_dict(data: dict[str, Any] | None) -> dict[str, int]:
    if not data:
        return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else data
    if not isinstance(usage, dict):
        return {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    prompt = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    completion = int(
        usage.get("completion_tokens")
        or usage.get("output_tokens")
        or usage.get("generated_tokens")
        or 0
    )
    total = int(usage.get("total_tokens") or (prompt + completion) or 0)
    return {"prompt_tokens": prompt, "completion_tokens": completion, "total_tokens": total}


def billing_key_to_capability(billing_key: str) -> str:
    key = (billing_key or "").strip().lower()
    if key == "llm_chat":
        return "llm"
    if key == "seedream":
        return "image"
    if key.startswith("seedance"):
        return "video"
    if key == "tts":
        return "tts"
    return "other"


def billing_key_label(billing_key: str) -> str:
    cap = billing_key_to_capability(billing_key)
    labels = {"llm": "LLM 对话", "image": "图片生成", "video": "视频生成", "tts": "语音合成"}
    return labels.get(cap, billing_key or "其他")


def billing_model_rate_rows(settings: Settings | None = None) -> list[dict[str, Any]]:
    """管理端展示：各模型计费口径（Ark token 单价 / Kie credit）。"""
    from app.services.kie_catalog import IMAGE_MODELS, VIDEO_MODELS

    s = settings or get_settings()
    markup = float(s.billing_markup)
    fen_per = kie_fen_per_credit(s)
    rows: list[dict[str, Any]] = [
        {
            "id": "llm_chat",
            "label": "LLM 对话",
            "provider": "ark",
            "capability": "llm",
            "basis": "token",
            "rate_label": f"{s.billing_llm_per_m} 元/百万 tokens",
            "markup": markup,
        },
        {
            "id": "tts",
            "label": "TTS 语音",
            "provider": "ark",
            "capability": "tts",
            "basis": "token",
            "rate_label": f"{s.billing_tts_per_m} 元/百万 tokens",
            "markup": markup,
        },
    ]
    for m in (*IMAGE_MODELS, *VIDEO_MODELS):
        if m.provider == "kie":
            rows.append(
                {
                    "id": m.id,
                    "label": m.label,
                    "provider": "kie",
                    "capability": m.capability,
                    "basis": "credit",
                    "rate_label": f"{fen_per:g} 分/credit × markup",
                    "markup": markup,
                }
            )
        elif m.capability == "image":
            rows.append(
                {
                    "id": m.id,
                    "label": m.label,
                    "provider": "ark",
                    "capability": "image",
                    "basis": "token",
                    "rate_label": f"{s.billing_seedream_per_m} 元/百万 tokens（有上游费用则优先）",
                    "markup": markup,
                }
            )
        else:
            rows.append(
                {
                    "id": m.id,
                    "label": m.label,
                    "provider": "ark",
                    "capability": "video",
                    "basis": "token",
                    "rate_label": (
                        f"video0 {s.billing_seedance_video0} / "
                        f"video1 {s.billing_seedance_video1} 元/百万 tokens"
                    ),
                    "markup": markup,
                }
            )
    return rows


def sku_by_id(sku_id: str) -> dict[str, Any] | None:
    for item in SKUS:
        if item["id"] == sku_id:
            return item
    return None
