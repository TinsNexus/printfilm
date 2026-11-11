"""Usage and cost conversion module for 9Router.

Unlike TokenFree (which calculates via New API 500,000 quota = 1 USD),
9Router passes standard OpenAI usage tokens (prompt_tokens, completion_tokens).
This module calculates internal cost in fen (1 CNY = 100 fen).
"""

from __future__ import annotations

import math
from typing import Any

from app.config import Settings, get_settings


def tokens_to_cost_fen(
    prompt_tokens: int,
    completion_tokens: int,
    *,
    rate_prompt_per_m: float = 5.0,  # CNY per 1M tokens
    rate_completion_per_m: float = 15.0,  # CNY per 1M tokens
) -> int:
    """Calculate cost in fen from prompt and completion token counts."""
    p_cny = (max(0, prompt_tokens) / 1_000_000.0) * rate_prompt_per_m
    c_cny = (max(0, completion_tokens) / 1_000_000.0) * rate_completion_per_m
    total_cny = p_cny + c_cny
    return max(1, int(math.ceil(total_cny * 100.0))) if total_cny > 0 else 0


def extract_usage_from_response(resp: dict[str, Any]) -> dict[str, int]:
    """Extract standard OpenAI usage metadata."""
    usage = resp.get("usage") or {}
    return {
        "prompt_tokens": int(usage.get("prompt_tokens") or 0),
        "completion_tokens": int(usage.get("completion_tokens") or 0),
        "total_tokens": int(usage.get("total_tokens") or 0),
    }


def estimate_image_cost_fen(model: str, size: str = "1024x1024", settings: Settings | None = None) -> int:
    """Estimate image generation cost in fen for 9Router models."""
    s = settings or get_settings()
    fx = float(getattr(s, "billing_usd_cny", 7.0) or 7.0)
    # Default ~ $0.02 - $0.04 per image depending on model/resolution
    usd = 0.04 if "dall-e-3" in model.lower() or "hd" in size.lower() else 0.02
    return max(1, int(math.ceil(usd * fx * 100)))


def estimate_video_cost_fen(model: str, duration_sec: float = 5.0, settings: Settings | None = None) -> int:
    """Estimate video generation cost in fen."""
    s = settings or get_settings()
    fx = float(getattr(s, "billing_usd_cny", 7.0) or 7.0)
    # Approx $0.05 - $0.10 per second
    usd = 0.08 * duration_sec
    return max(1, int(math.ceil(usd * fx * 100)))
