"""TokenFree 公开 /api/pricing：推荐模型官方价与预估。"""

from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import Settings, get_settings
from app.services.tokenfree_gateway import TOKENFREE_CONSOLE_URL, tokenfree_site_origin
from app.services.tokenfree_usage import usd_cny_rate

logger = logging.getLogger(__name__)

# New API：model_ratio=1 → $2 / 百万 tokens
NEWAPI_USD_PER_1M_AT_RATIO_1 = 2.0
# 视频价目常见占位倍率，不能当秒价
PLACEHOLDER_MODEL_RATIO = 37.5
_CACHE_TTL_SEC = 3600.0
_FAIL_TTL_SEC = 60.0
TOKENFREE_PRICING_PATH = "/api/pricing"
# LLM 预估按输入/输出拆分
LLM_PROMPT_SHARE = 0.7
# 费率表视频展示用的对照时长
VIDEO_RATE_SAMPLE_SECONDS = 5.0

# 火山 480P 5 秒官价折秒价（TokenFree 视频表不可信时预估用）
VENDOR_VIDEO_YUAN_PER_SEC_480P = {
    "seedance-2-5": 3.36 / 5.0,
    "seedance-2-0": 2.31 / 5.0,
    "seedance-2-0-mini": 2.31 / 5.0,
}

# 产品里好用、目录有、方便去 TokenFree 核对的短名单
RECOMMENDED_MODELS: tuple[dict[str, Any], ...] = (
    {
        "id": "kimi-k2.6",
        "capability": "text",
        "label": "Kimi K2.6",
        "note": "默认剧本/分镜，中文长上下文",
        "recommended": True,
    },
    {
        "id": "deepseek-v3.2",
        "capability": "text",
        "label": "DeepSeek V3.2",
        "note": "便宜备选，扩写与闲聊",
        "recommended": False,
    },
    {
        "id": "qwen3.5-plus",
        "capability": "text",
        "label": "Qwen 3.5 Plus",
        "note": "便宜中文日常对话",
        "recommended": False,
    },
    {
        "id": "gpt-image-2-5",
        "capability": "image",
        "label": "GPT Image 2.5",
        "note": "TokenFree 实测可通；Seedream 会改走此模型",
        "recommended": True,
    },
    {
        "id": "seedream-5-0-pro",
        "capability": "image",
        "label": "Seedream 5.0 Pro",
        "note": "便宜，但 TokenFree /responses 可能不通",
        "recommended": False,
    },
    {
        "id": "nano-banana-2",
        "capability": "image",
        "label": "Nano Banana 2",
        "note": "极便宜闪图，草稿/批量",
        "recommended": False,
    },
    {
        "id": "seedance-2-5",
        "capability": "video",
        "label": "Seedance 2.5",
        "note": "默认成片，最长约 30 秒",
        "recommended": True,
    },
    {
        "id": "seedance-2-0-mini",
        "capability": "video",
        "label": "Seedance 2.0 Mini",
        "note": "更快更便宜的备选",
        "recommended": False,
    },
)

_cache: dict[str, "OfficialRate"] | None = None
_cache_at: float = 0.0
_cache_failed: bool = False


@dataclass(frozen=True)
class OfficialRate:
    """一条 TokenFree 官方价。"""

    model: str
    billing: str
    usd_per_call: float
    cny_per_call: float
    cny_in_per_1m: float
    cny_out_per_1m: float
    model_ratio: float
    placeholder: bool
    tags: str


def tokenfree_pricing_url() -> str:
    """公开价目接口，无需 Key。"""
    return f"{tokenfree_site_origin()}{TOKENFREE_PRICING_PATH}"


def cached_rates() -> dict[str, OfficialRate]:
    """内存缓存；未拉过返回空。"""
    return dict(_cache or {})


def set_cached_rates(rates: dict[str, OfficialRate] | None) -> None:
    """写入缓存；None 表示测试清空，空 dict 表示负缓存。"""
    global _cache, _cache_at, _cache_failed
    if rates is None:
        _cache = None
        _cache_at = 0.0
        _cache_failed = False
        return
    _cache = dict(rates)
    _cache_at = time.monotonic()
    _cache_failed = False


def _mark_fetch_failed() -> None:
    """拉取失败：保留旧表，刷新时间戳，避免预扣每次打外网。"""
    global _cache, _cache_at, _cache_failed
    if _cache is None:
        _cache = {}
    _cache_at = time.monotonic()
    _cache_failed = True


def parse_pricing_item(item: dict[str, Any], *, usd_cny: float) -> OfficialRate | None:
    """把 /api/pricing 一行折成人民币。"""
    name = str(item.get("model_name") or "").strip()
    if not name:
        return None
    try:
        qt = int(item.get("quota_type") or 0)
        mr = float(item.get("model_ratio") or 0)
        cr = float(item.get("completion_ratio") or 0)
        mp = float(item.get("model_price") or 0)
        rate = max(0.01, float(usd_cny))
    except (TypeError, ValueError):
        return None
    if qt == 1:
        return OfficialRate(
            model=name,
            billing="per_call",
            usd_per_call=mp,
            cny_per_call=round(mp * rate, 4),
            cny_in_per_1m=0.0,
            cny_out_per_1m=0.0,
            model_ratio=0.0,
            placeholder=False,
            tags=str(item.get("tags") or ""),
        )
    return OfficialRate(
        model=name,
        billing="token",
        usd_per_call=0.0,
        cny_per_call=0.0,
        cny_in_per_1m=round(mr * NEWAPI_USD_PER_1M_AT_RATIO_1 * rate, 4),
        cny_out_per_1m=round(mr * cr * NEWAPI_USD_PER_1M_AT_RATIO_1 * rate, 4),
        model_ratio=mr,
        placeholder=abs(mr - PLACEHOLDER_MODEL_RATIO) < 0.01,
        tags=str(item.get("tags") or ""),
    )


def parse_pricing_payload(payload: dict[str, Any], settings: Settings | None = None) -> dict[str, OfficialRate]:
    """解析 TokenFree 价目 JSON。"""
    items = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return {}
    rate = usd_cny_rate(settings)
    out: dict[str, OfficialRate] = {}
    for raw in items:
        if not isinstance(raw, dict):
            continue
        parsed = parse_pricing_item(raw, usd_cny=rate)
        if parsed:
            out[parsed.model] = parsed
    return out


def lookup_rate(model: str, rates: dict[str, OfficialRate] | None = None) -> OfficialRate | None:
    """按模型 id 精确或忽略大小写查找。"""
    mid = (model or "").strip()
    table = rates if rates is not None else cached_rates()
    if not mid or not table:
        return None
    hit = table.get(mid)
    if hit:
        return hit
    key = mid.lower()
    for name, row in table.items():
        if name.lower() == key:
            return row
    return None


def video_catalog_id(model: str) -> str:
    """计费预估用：已知别名映射，未知 Seedance 回退 2.5。"""
    mapped = canonicalize_channel_model_id(model)
    if _is_canonical_seedance(mapped):
        return mapped
    return "seedance-2-5"


def _is_canonical_seedance(model: str) -> bool:
    """是否为 TokenFree 目录里的三档 Seedance id。"""
    return model in {"seedance-2-5", "seedance-2-0", "seedance-2-0-mini"}


def canonicalize_channel_model_id(model: str) -> str:
    """已知 Seedance 别名收到 TokenFree 目录 id；对不上则原样返回。"""
    mid = (model or "").strip()
    if "seedance" not in mid.lower():
        return mid
    low = mid.lower()
    if "mini" in low:
        return "seedance-2-0-mini"
    if any(token in low for token in ("2-5", "2.5", "260628")):
        return "seedance-2-5"
    if any(token in low for token in ("2-0", "2.0", "260128")):
        return "seedance-2-0"
    compact = low.replace("_", "-")
    if compact in {"seedance-2", "seedance2"} or compact.endswith("seedance-2"):
        return "seedance-2-0"
    return mid


def canonicalize_channel_models(models: list[str] | None) -> list[str]:
    """合并 Seedance 2.0 三档别名，保持原顺序。"""
    out: list[str] = []
    seen: set[str] = set()
    for raw in models or []:
        mid = canonicalize_channel_model_id(raw)
        if not mid or mid in seen:
            continue
        seen.add(mid)
        out.append(mid)
    return out


def _markup_charge(cost_fen: int, settings: Settings) -> int:
    """用户预扣金额 = 官方成本，不再乘倍率。"""
    from app.services.billing.pricing import user_charge_fen

    return user_charge_fen(cost_fen, settings)


def charge_fen_official_image(settings: Settings, *, model: str = "") -> int:
    """生图预估：按 TokenFree 按张价；Seedream 按实际工作模型。"""
    from app.services.billing.pricing import charge_fen_for_tokens
    from app.services.tokenfree_image import tokenfree_working_image_model

    mid = tokenfree_working_image_model(model or "gpt-image-2-5")
    rate = lookup_rate(mid)
    if rate and rate.billing == "per_call" and rate.cny_per_call > 0:
        return _markup_charge(max(1, int(math.ceil(rate.cny_per_call * 100))), settings)
    _, charge = charge_fen_for_tokens(settings.billing_est_seedream_tokens, "seedream", settings=settings)
    return charge


def charge_fen_official_llm(tokens: int, settings: Settings, *, model: str = "") -> int:
    """LLM 预估：官方 in/out，按 70% 输入 / 30% 输出拆。"""
    from app.services.billing.pricing import charge_fen_for_tokens

    t = max(0, int(tokens))
    mid = (model or getattr(settings, "model_llm", "") or "kimi-k2.6").strip()
    rate = lookup_rate(mid)
    if t and rate and rate.billing == "token" and (rate.cny_in_per_1m or rate.cny_out_per_1m):
        prompt = int(t * LLM_PROMPT_SHARE)
        completion = t - prompt
        yuan = prompt / 1_000_000 * rate.cny_in_per_1m + completion / 1_000_000 * rate.cny_out_per_1m
        return _markup_charge(max(1, int(math.ceil(yuan * 100))), settings)
    _, charge = charge_fen_for_tokens(t, "llm_chat", settings=settings)
    return charge


def charge_fen_official_video(seconds: float, settings: Settings, *, model: str = "") -> int:
    """视频预估：用火山 480P 秒价，不用 TokenFree 占位 37.5。"""
    from app.services.billing.pricing import charge_fen_for_tokens

    secs = max(float(seconds or 0), 2.0)
    mid = video_catalog_id(model or getattr(settings, "model_video", "") or "seedance-2-5")
    vendor = VENDOR_VIDEO_YUAN_PER_SEC_480P.get(mid)
    if vendor:
        return _markup_charge(max(1, int(math.ceil(secs * vendor * 100))), settings)
    tok = int(secs * settings.billing_est_seedance_tokens_per_sec)
    _, charge = charge_fen_for_tokens(tok, "seedance2:video0", settings=settings)
    return charge


def build_official_rate_rows(
    rates: dict[str, OfficialRate],
    settings: Settings | None = None,
) -> list[dict[str, Any]]:
    """管理端推荐模型费率表（含用户价）。"""
    s = settings or get_settings()
    usd_cny = usd_cny_rate(s)
    items: list[dict[str, Any]] = []
    for spec in RECOMMENDED_MODELS:
        rate = lookup_rate(str(spec["id"]), rates)
        official_yuan = 0.0
        basis = "missing"
        rate_label = "TokenFree 价目未收录，请到控制台核对"
        if spec["capability"] == "video":
            vendor = VENDOR_VIDEO_YUAN_PER_SEC_480P.get(str(spec["id"]))
            if vendor:
                official_yuan = round(vendor * VIDEO_RATE_SAMPLE_SECONDS, 4)
                basis = "vendor_sec"
                listed = ""
                if rate and rate.placeholder:
                    listed = f"；TokenFree 表 model_ratio={rate.model_ratio} 疑似占位"
                rate_label = (
                    f"预估按火山 480P 约 {vendor:.3f} 元/秒"
                    f"（{VIDEO_RATE_SAMPLE_SECONDS:g}秒 ¥{official_yuan:.2f}）{listed}"
                )
        elif rate and rate.billing == "per_call":
            official_yuan = rate.cny_per_call
            basis = "per_call"
            rate_label = f"TokenFree ${rate.usd_per_call:.4f}/次 ≈ ¥{official_yuan:.4f}"
        elif rate and rate.billing == "token":
            official_yuan = rate.cny_out_per_1m
            basis = "token"
            rate_label = f"TokenFree 输入 ¥{rate.cny_in_per_1m:.4f} / 输出 ¥{rate.cny_out_per_1m:.4f} 每百万"
        items.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "provider": "tokenfree",
                "capability": spec["capability"],
                "recommended": bool(spec["recommended"]),
                "note": spec["note"],
                "basis": basis,
                "rate_label": rate_label,
                "official_cost_yuan": official_yuan,
                "user_charge_yuan": official_yuan,
                "placeholder": bool(rate.placeholder) if rate else False,
                "markup": 1.0,
                "usd_cny": usd_cny,
                "verify_url": TOKENFREE_CONSOLE_URL,
            }
        )
    return items


async def fetch_tokenfree_pricing() -> dict[str, Any]:
    """GET TokenFree 公开价目，无需 API Key。"""
    url = tokenfree_pricing_url()
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
    except httpx.HTTPError as exc:
        raise RuntimeError(f"TokenFree pricing 网络失败: {exc}") from exc
    if resp.status_code >= 400:
        raise RuntimeError(f"TokenFree pricing HTTP {resp.status_code}: {resp.text[:300]}")
    try:
        payload = resp.json()
    except ValueError as exc:
        raise RuntimeError("TokenFree 价目返回非 JSON") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("TokenFree 价目格式异常")
    return payload


async def ensure_official_rates(settings: Settings | None = None) -> dict[str, OfficialRate]:
    """有缓存且未过期则复用；失败写短 TTL，预扣不因外网挂掉。"""
    ttl = _FAIL_TTL_SEC if _cache_failed else _CACHE_TTL_SEC
    if _cache is not None and _cache_at and (time.monotonic() - _cache_at) < ttl:
        return _cache
    try:
        payload = await fetch_tokenfree_pricing()
        parsed = parse_pricing_payload(payload, settings)
        if parsed:
            set_cached_rates(parsed)
            return parsed
        _mark_fetch_failed()
    except (RuntimeError, ValueError, TypeError) as exc:
        logger.info("tokenfree pricing skipped: %s", exc)
        _mark_fetch_failed()
    return cached_rates()


async def billing_official_rate_rows(settings: Settings | None = None) -> list[dict[str, Any]]:
    """拉取（或复用）官方价后生成推荐模型费率表。"""
    s = settings or get_settings()
    rates = await ensure_official_rates(s)
    return build_official_rate_rows(rates, s)
