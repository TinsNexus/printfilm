# -*- coding: utf-8 -*-
"""Token-based billing: estimate, freeze, record usage, settle."""
from __future__ import annotations

import json
import logging
import math
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.models import Project, UsageEvent, User, WalletLedger

logger = logging.getLogger(__name__)

SKUS: list[dict[str, Any]] = [
    {"id": "topup_10", "name": "体验充值", "amount_fen": 10000, "credit_fen": 10000},
    {"id": "topup_49", "name": "基础充值", "amount_fen": 49000, "credit_fen": 49000},
    {"id": "topup_99", "name": "进阶充值", "amount_fen": 99000, "credit_fen": 104000, "recommended": True},
    {"id": "topup_199", "name": "专业充值", "amount_fen": 199000, "credit_fen": 220000},
]


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


def billing_active(user: User | None = None, settings: Settings | None = None) -> bool:
    s = settings or get_settings()
    if not s.billing_enabled:
        return False
    if user is not None and getattr(user, "billing_unlimited", False):
        return False
    return True


def estimate_phase_fen(project: Project, phase: str, settings: Settings | None = None) -> int:
    """phase: script | produce"""
    s = settings or get_settings()
    buf = float(s.billing_estimate_buffer or 1.2)
    if phase == "script":
        cost, charge = charge_fen_for_tokens(s.billing_est_llm_tokens, "llm_chat", settings=s)
        return max(1, math.ceil(charge * buf))

    shots = list(project.shots or [])
    n = max(len(shots), 1)
    total = 0
    # images + tts
    for _ in range(n):
        _, c_img = charge_fen_for_tokens(s.billing_est_seedream_tokens, "seedream", settings=s)
        _, c_tts = charge_fen_for_tokens(s.billing_est_tts_tokens, "tts", settings=s)
        total += c_img + c_tts
    if (project.pipeline_mode or "full") != "image_text":
        secs = sum(max(float(sh.duration or 4), 2.0) for sh in shots) or (n * 5.0)
        tok = int(secs * s.billing_est_seedance_tokens_per_sec)
        _, c_vid = charge_fen_for_tokens(tok, "seedance2:video0", settings=s)
        total += c_vid
    # compose negligible — 1 fen min bump
    total = max(total, 1)
    return math.ceil(total * buf)


async def _ledger(
    db: AsyncSession,
    user: User,
    delta_fen: int,
    kind: str,
    *,
    ref_type: str = "",
    ref_id: str = "",
    note: str = "",
) -> None:
    user.balance_fen = int(user.balance_fen or 0) + int(delta_fen)
    db.add(
        WalletLedger(
            user_id=user.id,
            delta_fen=int(delta_fen),
            balance_after=int(user.balance_fen),
            kind=kind,
            ref_type=ref_type,
            ref_id=ref_id,
            note=note[:255],
        )
    )


async def freeze_for_project(
    db: AsyncSession,
    user: User,
    project: Project,
    phase: str,
) -> int:
    """Freeze estimate; raise ValueError if insufficient."""
    if not billing_active(user):
        return 0
    need = estimate_phase_fen(project, phase)
    available = int(user.balance_fen or 0)
    if available < need:
        raise ValueError(f"余额不足：需要 ¥{need/100:.2f}，当前 ¥{available/100:.2f}，请先充值")
    user.balance_fen = available - need
    user.frozen_fen = int(user.frozen_fen or 0) + need
    db.add(
        WalletLedger(
            user_id=user.id,
            delta_fen=-need,
            balance_after=int(user.balance_fen),
            kind="freeze",
            ref_type="project",
            ref_id=str(project.id),
            note=f"freeze:{phase}",
        )
    )
    await db.flush()
    return need


async def record_usage(
    db: AsyncSession,
    *,
    user_id: int,
    project_id: int | None,
    billing_key: str,
    model: str = "",
    tokens: int = 0,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    estimated: bool = False,
    raw: dict | None = None,
    shot_id: int | None = None,
    provider: str = "ark",
    drama_project_id: int | None = None,
) -> UsageEvent:
    s = get_settings()
    total = int(tokens) or (int(prompt_tokens) + int(completion_tokens))
    if total <= 0:
        # fallbacks by key
        if billing_key == "llm_chat":
            total = s.billing_est_llm_tokens
            estimated = True
        elif billing_key == "seedream":
            total = s.billing_est_seedream_tokens
            estimated = True
        elif billing_key == "tts":
            total = s.billing_est_tts_tokens
            estimated = True
        elif billing_key.startswith("seedance"):
            total = s.billing_est_seedance_tokens_per_sec * 5
            estimated = True
    cost, charge = charge_fen_for_tokens(total, billing_key, settings=s)
    ev = UsageEvent(
        user_id=user_id,
        project_id=project_id,
        drama_project_id=drama_project_id,
        shot_id=shot_id,
        provider=provider,
        billing_key=billing_key,
        model=model or "",
        prompt_tokens=int(prompt_tokens),
        completion_tokens=int(completion_tokens),
        total_tokens=total,
        cost_fen=cost,
        charge_fen=charge,
        estimated=estimated,
        settled=False,
        raw_usage_json=json.dumps(raw, ensure_ascii=False)[:4000] if raw else None,
    )
    db.add(ev)
    await db.flush()
    return ev


async def settle_project(db: AsyncSession, project_id: int) -> dict[str, int]:
    """Apply unsettled usage: consume freeze first, refund unused freeze."""
    project = await db.get(Project, project_id)
    if not project:
        return {"charged": 0, "refunded": 0}
    user = await db.get(User, project.user_id)
    result = await db.execute(
        select(UsageEvent).where(
            UsageEvent.project_id == project_id,
            UsageEvent.settled.is_(False),
        )
    )
    events = list(result.scalars().all())
    charged = sum(int(e.charge_fen or 0) for e in events)
    for e in events:
        e.settled = True

    if not user or not billing_active(user):
        await db.flush()
        return {"charged": 0, "refunded": 0}

    frozen_before = int(user.frozen_fen or 0)
    from_freeze = min(frozen_before, charged)
    extra = charged - from_freeze
    refund = max(0, frozen_before - charged)
    user.frozen_fen = 0

    if extra > 0:
        logger.warning(
            "settle overage user=%s project=%s extra_fen=%s balance=%s",
            user.id,
            project_id,
            extra,
            user.balance_fen,
        )
        await _ledger(
            db,
            user,
            -extra,
            "settle",
            ref_type="project",
            ref_id=str(project_id),
            note="settle_overage",
        )
    if refund > 0:
        await _ledger(
            db,
            user,
            refund,
            "unfreeze",
            ref_type="project",
            ref_id=str(project_id),
            note="refund_unused_freeze",
        )

    db.add(
        WalletLedger(
            user_id=user.id,
            delta_fen=0,
            balance_after=int(user.balance_fen or 0),
            kind="settle",
            ref_type="project",
            ref_id=str(project_id),
            note=f"charged={charged} freeze={from_freeze} refund={refund}",
        )
    )
    await db.flush()
    return {"charged": charged, "refunded": refund}


async def credit_topup(
    db: AsyncSession,
    user: User,
    credit_fen: int,
    *,
    ref_type: str,
    ref_id: str,
    note: str = "",
) -> None:
    await _ledger(db, user, int(credit_fen), "topup", ref_type=ref_type, ref_id=ref_id, note=note)
    await db.flush()


def sku_by_id(sku_id: str) -> dict[str, Any] | None:
    for s in SKUS:
        if s["id"] == sku_id:
            return s
    return None


# 待支付订单有效期（秒），与前端扫码倒计时一致
ORDER_EXPIRE_SECONDS = 300


async def close_expired_pending_orders(
    db: AsyncSession,
    *,
    user_id: int | None = None,
    out_trade_no: str | None = None,
) -> int:
    """将超时未支付的 pending 订单自动标为 closed，返回关闭条数。"""
    from datetime import datetime, timedelta, timezone

    from app.models import Order

    now = datetime.now(timezone.utc)
    stmt = select(Order).where(Order.status == "pending")
    if user_id is not None:
        stmt = stmt.where(Order.user_id == user_id)
    if out_trade_no is not None:
        stmt = stmt.where(Order.out_trade_no == out_trade_no)
    rows = (await db.execute(stmt)).scalars().all()
    closed = 0
    for order in rows:
        created = order.created_at
        if created is None:
            continue
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age = (now - created).total_seconds()
        if age < ORDER_EXPIRE_SECONDS:
            continue
        order.status = "closed"
        closed += 1
    if closed:
        await db.commit()
    return closed


async def settle_usage_charge(
    db: AsyncSession,
    user: User,
    charge_fen: int,
    *,
    ref_type: str = "api",
    ref_id: str = "",
) -> None:
    """API 等即时扣费：余额不足时抛 ValueError。"""
    if not billing_active(user):
        return
    need = max(0, int(charge_fen))
    if need <= 0:
        return
    available = int(user.balance_fen or 0)
    if available < need:
        raise ValueError(f"余额不足：需要 ¥{need / 100:.2f}，当前 ¥{available / 100:.2f}，请先充值")
    await _ledger(
        db,
        user,
        -need,
        "settle",
        ref_type=ref_type,
        ref_id=ref_id,
        note="api_usage",
    )
    await db.flush()


def billing_key_label(billing_key: str) -> str:
    """把 billing_key 转成用户可读的能力名称。"""
    key = (billing_key or "").strip().lower()
    if key == "llm_chat":
        return "LLM 对话"
    if key == "seedream":
        return "图片生成"
    if key.startswith("seedance"):
        return "视频生成"
    if key == "tts":
        return "语音合成"
    return billing_key or "其他"
