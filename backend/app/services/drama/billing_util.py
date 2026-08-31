"""漫剧计费辅助：Seedance token 估算、Seed LLM 用量聚合。"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import User
from app.services.billing import record_line
from app.services.drama.seed import SeedAssetsResult


# 按分镜时长估算 Seedance 视频 token（与科普 pipeline 一致）
def seedance_video_billing_tokens(duration_sec: int | float | None) -> int:
    settings = get_settings()
    dur = max(float(duration_sec or 8), 2.0)
    return int(dur * settings.billing_est_seedance_tokens_per_sec)


async def record_seed_assets_llm_usage(
    db: AsyncSession,
    user: User,
    drama_project_id: int,
    result: SeedAssetsResult,
) -> None:
    """按 seed 结果聚合 LLM 调用次数写入 usage_events（需在 billing_scope 内）。"""
    settings = get_settings()
    llm_calls = int(result.llm_calls_props or 0) + int(result.prompts_refreshed or 0)
    if llm_calls <= 0:
        return
    if llm_calls == 1:
        await record_line(
            db,
            user_id=user.id,
            project_id=None,
            drama_project_id=drama_project_id,
            billing_key="llm_chat",
            model=settings.model_llm,
            estimated=True,
            domain="drama",
        )
        return
    await record_line(
        db,
        user_id=user.id,
        project_id=None,
        drama_project_id=drama_project_id,
        billing_key="llm_chat",
        model=settings.model_llm,
        tokens=settings.billing_est_llm_tokens * llm_calls,
        estimated=True,
        domain="drama",
    )
