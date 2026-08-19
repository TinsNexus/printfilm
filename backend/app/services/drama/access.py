"""Drama access helpers."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import User
from app.models_drama import (
    DramaEpisode,
    DramaEpisodeFragment,
    DramaFragmentAssetRef,
    DramaProject,
)


async def get_owned_drama_project(
    db: AsyncSession,
    project_id: int,
    user: User,
    *,
    with_script: bool = False,
    with_assets: bool = False,
    with_episodes: bool = False,
) -> DramaProject:
    # Load project owned by current user with optional relations
    opts = []
    if with_script:
        opts.append(selectinload(DramaProject.script))
    if with_assets:
        opts.append(selectinload(DramaProject.assets))
    if with_episodes:
        opts.append(selectinload(DramaProject.episodes).selectinload(DramaEpisode.fragments))
    q = select(DramaProject).where(DramaProject.id == project_id, DramaProject.user_id == user.id)
    if opts:
        q = q.options(*opts)
    result = await db.execute(q)
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="漫剧项目不存在")
    return project


async def get_owned_episode(
    db: AsyncSession,
    episode_id: int,
    user: User,
    *,
    with_fragments: bool = True,
) -> DramaEpisode:
    # Load episode after verifying project ownership
    opts = []
    if with_fragments:
        opts.append(
            selectinload(DramaEpisode.fragments)
            .selectinload(DramaEpisodeFragment.asset_references)
            .selectinload(DramaFragmentAssetRef.asset)
        )
    q = (
        select(DramaEpisode)
        .join(DramaProject, DramaEpisode.project_id == DramaProject.id)
        .where(DramaEpisode.id == episode_id, DramaProject.user_id == user.id)
    )
    if opts:
        q = q.options(*opts)
    result = await db.execute(q)
    episode = result.scalar_one_or_none()
    if not episode:
        raise HTTPException(status_code=404, detail="分集不存在")
    return episode


async def load_episode_fragments(
    db: AsyncSession,
    episode_id: int,
) -> list[DramaEpisodeFragment]:
    """显式查询分集下全部分镜（含资产引用），避免 expire_on_commit=False 会话缓存旧集合。"""
    result = await db.execute(
        select(DramaEpisodeFragment)
        .where(DramaEpisodeFragment.episode_id == episode_id)
        .options(selectinload(DramaEpisodeFragment.asset_references))
        .order_by(DramaEpisodeFragment.sort_order.asc(), DramaEpisodeFragment.id.asc())
    )
    return list(result.scalars().all())


def match_fragments_for_generate(
    all_frags: list[DramaEpisodeFragment],
    fragment_ids: list[int] | None,
) -> list[DramaEpisodeFragment]:
    """按请求的分镜 id 筛选；未传 id 则生成全部。"""
    ordered = list(all_frags)
    if not fragment_ids:
        return ordered
    id_set = set(fragment_ids)
    return [f for f in ordered if f.id in id_set]


async def count_user_active_fragment_video_jobs(db: AsyncSession, user_id: int) -> int:
    """统计用户当前在途分镜视频数（queued/running/generating）。"""
    from app.services.drama.generation import fragment_generation_status

    result = await db.execute(
        select(DramaEpisodeFragment)
        .join(DramaEpisode, DramaEpisodeFragment.episode_id == DramaEpisode.id)
        .join(DramaProject, DramaEpisode.project_id == DramaProject.id)
        .where(DramaProject.user_id == user_id)
    )
    fragments = result.scalars().all()
    total = 0
    for fragment in fragments:
        status = str(fragment_generation_status(fragment).get("status") or "")
        if status in {"queued", "running", "generating"}:
            total += 1
    return total
