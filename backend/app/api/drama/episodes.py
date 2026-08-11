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
    DramaSaveFragmentsRequest,
)
from app.services.drama.access import get_owned_drama_project, get_owned_episode
from app.services.drama.generation import fragment_generation_status
from app.services.drama.jobs import dispatch_episode_generate_job
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
    for old in list(ep.fragments or []):
        await db.delete(old)
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
        db.add(frag)
        await db.flush()
        for aid in item.asset_ids:
            db.add(DramaFragmentAssetRef(fragment_id=frag.id, asset_id=aid))
    await db.commit()
    ep = await get_owned_episode(db, episode_id, user)
    logger.info(
        "已保存分镜 episode_id=%s count=%s",
        episode_id,
        len(body.fragments),
    )
    return _episode_out(ep)


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
    frags = sorted(ep.fragments or [], key=lambda f: f.sort_order)
    if body.fragment_ids:
        id_set = set(body.fragment_ids)
        frags = [f for f in frags if f.id in id_set]
    if not frags:
        raise HTTPException(status_code=400, detail="没有可生成的分镜")

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
