"""漫剧计费辅助：统一 Seedance 等 token 估算。"""

from __future__ import annotations

from app.config import get_settings


# 按分镜时长估算 Seedance 视频 token（与科普 pipeline 一致）
def seedance_video_billing_tokens(duration_sec: int | float | None) -> int:
    settings = get_settings()
    dur = max(float(duration_sec or 8), 2.0)
    return int(dur * settings.billing_est_seedance_tokens_per_sec)
