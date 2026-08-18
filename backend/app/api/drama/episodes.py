"""Drama episode / fragment endpoints."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.models_drama import DramaEpisode, DramaEpisodeFragment, DramaFragmentAssetRef
from app.schemas_drama import (
    DramaEpisodeOut,
    DramaFragmentOut,
    DramaGenerateRequest,
    DramaPlanFragmentsRequest,
    DramaSaveFragmentsRequest,
)
from app.services.agent.compose import parse_skill_ids
from app.services.drama.access import (
    get_owned_drama_project,
    get_owned_episode,
    load_episode_fragments,
    match_fragments_for_generate,
)
from app.services.drama.generation import fragment_generation_status
from app.services.drama.jobs import (
    cancel_all_episode_video_jobs,
    cancel_episode_video_jobs,
    dispatch_episode_fragment_plan_job,
    dispatch_episode_generate_job,
)
from app.services.drama.seed import seed_episodes_from_script

router = APIRouter()
logger = logging.getLogger("app.drama.episodes")


def _fragment_out(frag: DramaEpisodeFragment) -> DramaFragmentOut:
    asset_ids = [r.asset_id for r in (frag.asset_references or [])]
    return DramaFragmentOut(
        id=frag.id,
        episode_id=frag.episode_id,
        sort_order=frag.sort_order,
        content=frag.content,
        cover=frag.cover or "",
        video=frag.video or "",
        duration_sec=frag.duration_sec,
        params=frag.params,
        asset_ids=asset_ids,
    )


def _episode_out(ep: DramaEpisode) -> DramaEpisodeOut:
    frags = sorted(ep.fragments or [], key=lambda f: f.sort_order)
    return DramaEpisodeOut(
        id=ep.id,
        name=ep.name,
        params=ep.params,
        project_id=ep.project_id,
        fragments=[_fragment_out(f) for f in frags],
    )


@router.get("/episodes", response_model=list[DramaEpisodeOut])
async def list_episodes(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DramaEpisodeOut]:
    await get_owned_drama_project(db, project_id, user)
    result = await db.execute(
        select(DramaEpisode)
        .where(DramaEpisode.project_id == project_id)
        .options(
            selectinload(DramaEpisode.fragments).selectinload(DramaEpisodeFragment.asset_references)
        )
        .order_by(DramaEpisode.id.asc())
    )
    return [_episode_out(ep) for ep in result.scalars().all()]


@router.get("/episodes/{episode_id}", response_model=DramaEpisodeOut)
async def get_episode(
    episode_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DramaEpisodeOut:
    ep = await get_owned_episode(db, episode_id, user)
    return _episode_out(ep)


@router.post("/episodes/{episode_id}/plan_fragments", response_model=DramaEpisodeOut)
async def plan_episode_fragments(
    episode_id: int,
    body: DramaPlanFragmentsRequest | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DramaEpisodeOut:
    # 入队单集 LLM 分镜；前端轮询 episode.params.fragment_plan_status
    req = body or DramaPlanFragmentsRequest()
    ep = await get_owned_episode(db, episode_id, user)
    await get_owned_drama_project(db, ep.project_id, user)

    params = dict(ep.params or {})
    existing = str(params.get("fragment_plan_status") or "")
    # force 时允许重入队（避免 Celery 丢任务后卡在 generating）
    if existing == "generating" and not req.force:
        logger.info("单集分镜已在进行中 episode_id=%s", episode_id)
        return _episode_out(ep)
    if existing == "generating" and req.force:
        logger.warning("单集分镜强制重入队 episode_id=%s prev_status=generating", episode_id)

    if not req.force:
        # 非 force：有保护分镜则拒绝
        protected = any(
            (f.video or "").strip()
            or (isinstance(f.params, dict) and f.params.get("user_edited"))
            for f in (ep.fragments or [])
        )
        if protected:
            raise HTTPException(
                status_code=409,
                detail="本集含已生成视频或手改分镜，请确认后强制重新分镜",
            )

    params["fragment_plan_status"] = "generating"
    params.pop("fragment_plan_error", None)
    params["fragment_plan_mode"] = "llm"
    if req.skill_ids is None:
        params.pop("fragment_plan_skill_ids", None)
    else:
        params["fragment_plan_skill_ids"] = parse_skill_ids(req.skill_ids) or []
    ep.params = params
    await db.commit()
    await db.refresh(ep)

    task_id = dispatch_episode_fragment_plan_job(
        episode_id,
        fallback_rules=bool(req.fallback_rules),
    )
    logger.info(
        "已入队单集 LLM 分镜 episode_id=%s force=%s task_id=%s",
        episode_id,
        req.force,
        task_id,
    )
    # 再取一次带 fragments 的 episode
    ep = await get_owned_episode(db, episode_id, user)
    return _episode_out(ep)


@router.post("/episodes/seed_from_script", response_model=list[DramaEpisodeOut])
async def seed_episodes(
    project_id: int,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DramaEpisodeOut]:
    project = await get_owned_drama_project(db, project_id, user, with_script=True)
    logger.info(
        "按剧本切分镜 project_id=%s force=%s user_id=%s",
        project_id,
        force,
        user.id,
    )
    try:
        await seed_episodes_from_script(db, project, force=force)
    except ValueError as exc:
        logger.warning("切分镜失败 project_id=%s err=%s", project_id, exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    result = await db.execute(
        select(DramaEpisode)
        .where(DramaEpisode.project_id == project_id)
        .options(
            selectinload(DramaEpisode.fragments).selectinload(DramaEpisodeFragment.asset_references)
        )
        .order_by(DramaEpisode.id.asc())
    )
    episodes = result.scalars().all()
    frag_total = sum(len(ep.fragments or []) for ep in episodes)
    logger.info(
        "切分镜完成 project_id=%s episodes=%s fragments=%s",
        project_id,
        len(episodes),
        frag_total,
    )
    return [_episode_out(ep) for ep in episodes]


@router.post("/episodes/{episode_id}/fragments", response_model=DramaEpisodeOut)
async def save_fragments(
    episode_id: int,
    body: DramaSaveFragmentsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DramaEpisodeOut:
    ep = await get_owned_episode(db, episode_id, user)
    # 用 relationship 清空，保证会话内集合与库一致（delete 旧行但不从 ep.fragments 移除会导致返回旧 id）
    ep.fragments.clear()
    await db.flush()
    for item in body.fragments:
        frag = DramaEpisodeFragment(
            episode_id=ep.id,
            sort_order=item.sort_order,
            content=item.content or "",
            cover=item.cover or "",
            video=item.video or "",
            duration_sec=item.duration_sec,
            params=item.params,
        )
        ep.fragments.append(frag)
        await db.flush()
        for aid in item.asset_ids or []:
            db.add(DramaFragmentAssetRef(fragment_id=frag.id, asset_id=aid))
    await db.commit()
    # expire_on_commit=False：必须重查，不能用会话里可能过期的 ep.fragments
    frags = await load_episode_fragments(db, episode_id)
    logger.info(
        "已保存分镜 episode_id=%s count=%s ids=%s",
        episode_id,
        len(frags),
        [f.id for f in frags],
    )
    return DramaEpisodeOut(
        id=ep.id,
        name=ep.name,
        params=ep.params,
        project_id=ep.project_id,
        fragments=[_fragment_out(f) for f in frags],
    )


@router.post("/episodes/{episode_id}/generate")
async def generate_episode(
    episode_id: int,
    body: DramaGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    # 入队 Celery / 进程内任务，前端用 generate_status 轮询
    ep = await get_owned_episode(db, episode_id, user)
    await get_owned_drama_project(db, ep.project_id, user)
    all_frags = await load_episode_fragments(db, episode_id)
    frags = match_fragments_for_generate(all_frags, body.fragment_ids)
    if not frags:
        logger.warning(
            "没有可生成的分镜 episode_id=%s requested=%s available=%s",
            episode_id,
            body.fragment_ids,
            [f.id for f in all_frags],
        )
        raise HTTPException(
            status_code=400,
            detail="没有可生成的分镜（保存后分镜已更新，请再点一次生成）",
        )

    # 已有分镜在排队/生成时，仅禁止重复提交同一分镜
    busy_same = [
        f.id
        for f in frags
        if fragment_generation_status(f).get("status") in {"queued", "running"}
    ]
    if busy_same:
        raise HTTPException(
            status_code=409,
            detail="所选分镜正在生成，请等待完成后再试",
        )

    frag_ids = [f.id for f in frags]
    for f in frags:
        params = dict(f.params or {})
        params["generation"] = {"status": "queued"}
        f.params = params
    await db.commit()

    task_id = dispatch_episode_generate_job(episode_id, user.id, frag_ids)
    logger.info(
        "已入队分集视频 episode_id=%s project_id=%s fragments=%s task_id=%s",
        episode_id,
        ep.project_id,
        len(frag_ids),
        task_id,
    )
    return {
        "ok": True,
        "fragment_ids": frag_ids,
        "status": "queued",
        "task_id": task_id,
    }


@router.get("/episodes/{episode_id}/generate_status")
async def generate_status(
    episode_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    ep = await get_owned_episode(db, episode_id, user)
    items = []
    done = 0
    failed = 0
    running = 0
    for f in sorted(ep.fragments or [], key=lambda x: x.sort_order):
        st = fragment_generation_status(f)
        items.append({"fragment_id": f.id, **st})
        s = st.get("status")
        if s == "done":
            done += 1
        elif s == "failed":
            failed += 1
        elif s in {"running", "queued"}:
            running += 1
    return {
        "episode_id": episode_id,
        "done": done,
        "failed": failed,
        "running": running,
        "total": len(items),
        "fragments": items,
    }


@router.post("/episodes/{episode_id}/cancel_generate")
async def cancel_generate_episode(
    episode_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """取消本集全部分镜视频生成（排队/进行中）。"""
    ep = await get_owned_episode(db, episode_id, user)
    await get_owned_drama_project(db, ep.project_id, user)
    result = await cancel_episode_video_jobs(episode_id)
    logger.info(
        "已取消分集视频 episode_id=%s project_id=%s result=%s",
        episode_id,
        ep.project_id,
        result,
    )
    return result


@router.post("/cancel_video_jobs")
async def cancel_all_video_jobs(
    user: User = Depends(get_current_user),
) -> dict:
    """取消当前用户触发的全部漫剧分镜视频任务。"""
    result = await cancel_all_episode_video_jobs()
    logger.info("已取消全部视频任务 user_id=%s result=%s", user.id, result)
    return result
