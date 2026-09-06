# -*- coding: utf-8 -*-
"""按 TaskRun 估算预扣金额。"""
from __future__ import annotations

import math

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import Settings, get_settings
from app.models import Project
from app.models_tasks import TaskRun
from app.services.billing.pricing import charge_fen_for_tokens


def estimate_phase_fen(project: Project, phase: str, settings: Settings | None = None) -> int:
    """科普 pipeline 阶段估算：script | produce。"""
    s = settings or get_settings()
    buf = float(s.billing_estimate_buffer or 1.2)
    if phase == "script":
        _, charge = charge_fen_for_tokens(s.billing_est_llm_tokens, "llm_chat", settings=s)
        return max(1, math.ceil(charge * buf))

    shots = list(project.shots or [])
    n = max(len(shots), 1)
    total = 0
    for _ in range(n):
        _, c_img = charge_fen_for_tokens(s.billing_est_seedream_tokens, "seedream", settings=s)
        _, c_tts = charge_fen_for_tokens(s.billing_est_tts_tokens, "tts", settings=s)
        total += c_img + c_tts
    if (project.pipeline_mode or "full") != "image_text":
        secs = sum(max(float(sh.duration or 4), 2.0) for sh in shots) or (n * 5.0)
        tok = int(secs * s.billing_est_seedance_tokens_per_sec)
        _, c_vid = charge_fen_for_tokens(tok, "seedance2:video0", settings=s)
        total += c_vid
    return max(math.ceil(total * buf), 1)


async def estimate_task_fen(db: AsyncSession, task: TaskRun, settings: Settings | None = None) -> int:
    """按 domain + task_type 估算单任务预扣（分）。"""
    s = settings or get_settings()
    buf = float(s.billing_estimate_buffer or 1.2)
    domain = (task.domain or "").strip()
    task_type = (task.task_type or "").strip()
    payload = task.payload if isinstance(task.payload, dict) else {}

    if domain == "kepu" and task_type == "project_pipeline":
        project_id = task.project_id or payload.get("project_id")
        if not project_id:
            _, charge = charge_fen_for_tokens(s.billing_est_llm_tokens, "llm_chat", settings=s)
            return max(1, math.ceil(charge * buf))
        result = await db.execute(
            select(Project).where(Project.id == int(project_id)).options(selectinload(Project.shots))
        )
        project = result.scalar_one_or_none()
        if not project:
            _, charge = charge_fen_for_tokens(s.billing_est_llm_tokens, "llm_chat", settings=s)
            return max(1, math.ceil(charge * buf))
        phase = str(payload.get("phase") or "script")
        return estimate_phase_fen(project, phase, settings=s)

    if domain == "kepu":
        if task_type in {"shot_regen_image"}:
            _, c = charge_fen_for_tokens(s.billing_est_seedream_tokens, "seedream", settings=s)
            return max(1, math.ceil(c * buf))
        if task_type in {"shot_regen_video"}:
            dur = float(payload.get("duration") or 5)
            tok = int(max(dur, 2.0) * s.billing_est_seedance_tokens_per_sec)
            _, c = charge_fen_for_tokens(tok, "seedance2:video0", settings=s)
            return max(1, math.ceil(c * buf))
        if task_type in {"shot_regen_audio", "project_regen_audio"}:
            _, c = charge_fen_for_tokens(s.billing_est_tts_tokens * 3, "tts", settings=s)
            return max(1, math.ceil(c * buf))
        if task_type == "project_compose_only":
            return 1

    if domain == "drama":
        if task_type in {"script_summary", "fragment_plan", "agent_chat"}:
            _, c = charge_fen_for_tokens(s.billing_est_llm_tokens, "llm_chat", settings=s)
            return max(1, math.ceil(c * buf))
        if task_type == "episode_script":
            total_eps = int(payload.get("total") or payload.get("episode_count") or 1)
            _, c = charge_fen_for_tokens(s.billing_est_llm_tokens * max(total_eps, 1), "llm_chat", settings=s)
            return max(1, math.ceil(c * buf))
        if task_type in {"asset_image", "seed_assets"}:
            if task_type == "seed_assets":
                _, c = charge_fen_for_tokens(s.billing_est_llm_tokens * 3, "llm_chat", settings=s)
                return max(1, math.ceil(c * buf))
            _, c = charge_fen_for_tokens(s.billing_est_seedream_tokens, "seedream", settings=s)
            return max(1, math.ceil(c * buf))
        if task_type in {"asset_video", "fragment_video"}:
            dur = float(payload.get("duration_sec") or payload.get("duration") or 0)
            if dur <= 0 and isinstance(payload.get("prepared"), dict):
                dur = float(payload["prepared"].get("duration") or 0)
            if dur <= 0:
                frag_id = task.fragment_id or (
                    (payload.get("fragment_ids") or [None])[0]
                    if isinstance(payload.get("fragment_ids"), list)
                    else None
                )
                if frag_id:
                    from app.models_drama import DramaEpisodeFragment
                    from app.services.drama.fragment_content_duration import (
                        resolve_seedance_duration_from_content,
                    )

                    frag = await db.get(DramaEpisodeFragment, int(frag_id))
                    if frag is not None:
                        dur = float(
                            resolve_seedance_duration_from_content(
                                frag.content or "",
                                fallback=int(frag.duration_sec or 8),
                            )
                        )
            if dur <= 0:
                dur = 8.0
            tok = int(max(dur, 2.0) * s.billing_est_seedance_tokens_per_sec)
            _, c = charge_fen_for_tokens(tok, "seedance2:video0", settings=s)
            # fragment_video 准备阶段可能有 seedream/LLM，预留半张图额度压小额 overage
            if task_type == "fragment_video":
                _, c_img = charge_fen_for_tokens(s.billing_est_seedream_tokens, "seedream", settings=s)
                c += max(1, c_img // 2)
            return max(1, math.ceil(c * buf))
        if task_type == "voice_synthesis":
            _, c = charge_fen_for_tokens(s.billing_est_tts_tokens, "tts", settings=s)
            return max(1, math.ceil(c * buf))
        if task_type in {"skill_optimize", "voice_prompt"}:
            _, c = charge_fen_for_tokens(s.billing_est_llm_tokens, "llm_chat", settings=s)
            return max(1, math.ceil(c * buf))

    if domain == "kepu" and task_type == "content_expand":
        _, c = charge_fen_for_tokens(s.billing_est_llm_tokens, "llm_chat", settings=s)
        return max(1, math.ceil(c * buf))

    if domain in {"api", "studio"}:
        if task_type in {"v1_image", "tool_image"}:
            _, c = charge_fen_for_tokens(s.billing_est_seedream_tokens, "seedream", settings=s)
            return max(1, math.ceil(c * buf))
        if task_type in {"v1_video", "v1_seedance", "tool_video"}:
            dur = float(payload.get("duration") or 5)
            tok = int(max(dur, 2.0) * s.billing_est_seedance_tokens_per_sec)
            _, c = charge_fen_for_tokens(tok, "seedance2:video0", settings=s)
            return max(1, math.ceil(c * buf))

    _, c = charge_fen_for_tokens(s.billing_est_llm_tokens, "llm_chat", settings=s)
    return max(1, math.ceil(c * buf))
