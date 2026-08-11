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
