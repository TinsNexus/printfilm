"""Seed drama assets / episodes from script."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models_drama import (
    DramaAsset,
    DramaEpisode,
    DramaEpisodeFragment,
    DramaFragmentAssetRef,
    DramaProject,
)
from app.services.drama.build_fragments import (
    build_fragments_from_episode_body,
    is_raw_screenplay_fragment,
    split_episode_content_into_scenes,
)


async def seed_assets_from_script(db: AsyncSession, project: DramaProject) -> list[DramaAsset]:
    # Create character/scene assets from script summary if missing
    script = project.script
    if not script or not script.summary:
        raise ValueError("请先生成剧本摘要")

    summary = script.summary if isinstance(script.summary, dict) else {}
    existing = (
        await db.execute(select(DramaAsset).where(DramaAsset.project_id == project.id))
    ).scalars().all()
    existing_names = {(a.name or "").strip() for a in existing if a.type in {"character", "scene"}}

    created: list[DramaAsset] = []
    for ch in summary.get("characters") or []:
        if not isinstance(ch, dict):
            continue
        name = str(ch.get("name") or "").strip()
        if not name or name in existing_names:
            continue
        asset = DramaAsset(
            project_id=project.id,
            type="character",
            asset_type="image",
            name=name,
            params={
                "visualImage": ch.get("visualImage"),
                "roleType": ch.get("roleType"),
                "title": ch.get("title"),
                "coreTags": ch.get("coreTags"),
            },
        )
        db.add(asset)
        created.append(asset)
        existing_names.add(name)

    # Extract scene names from episode bodies
    bodies = _episode_bodies(script.episode_content)
    scene_names: list[str] = []
    for body in bodies:
        for m in re.finditer(
            r"^(?:日|夜|晨|黄昏|傍晚|凌晨|清晨|午|晚)?[ \t]*(?:内|外|内外)[ \t]+(.+)$",
            body,
            re.M,
        ):
            scene = m.group(1).strip().split("／")[0].split("/")[0].strip()
            if scene and scene not in scene_names:
                scene_names.append(scene)

    for scene in scene_names[:40]:
        if scene in existing_names:
            continue
        asset = DramaAsset(
            project_id=project.id,
            type="scene",
            asset_type="image",
            name=scene,
            params={"kind": "scene"},
        )
        db.add(asset)
        created.append(asset)
        existing_names.add(scene)

    await db.commit()
    for a in created:
        await db.refresh(a)
    return created


async def seed_episodes_from_script(
    db: AsyncSession,
    project: DramaProject,
    *,
    force: bool = False,
) -> list[DramaEpisode]:
    # Create / 重切分镜：按 ### 场次拆分并生成视频向分镜文案
    script = project.script
    if not script:
        raise ValueError("缺少剧本")
    bodies = _normalize_episode_list(script.episode_content)
    if not bodies:
        raise ValueError("请先生成分集剧本")

    assets = list(
        (
            await db.execute(select(DramaAsset).where(DramaAsset.project_id == project.id))
        ).scalars().all()
    )

    existing = list(
        (
            await db.execute(
                select(DramaEpisode)
                .where(DramaEpisode.project_id == project.id)
                .options(
                    selectinload(DramaEpisode.fragments).selectinload(
                        DramaEpisodeFragment.asset_references
                    )
                )
                .order_by(DramaEpisode.id.asc())
            )
        ).scalars().all()
    )

    should_rebuild = force or _should_auto_replan(existing, bodies)
    if existing and not should_rebuild:
        return existing

    body_by_number = {
        int(item.get("episodeNumber") or 0): item
        for item in bodies
        if isinstance(item, dict) and int(item.get("episodeNumber") or 0) >= 1
    }

    if not existing:
        created: list[DramaEpisode] = []
        for item in bodies:
            ep_no = int(item.get("episodeNumber") or len(created) + 1)
            title = str(item.get("title") or f"第{ep_no}集")
            body = str(item.get("body") or item.get("content") or "")
            episode = DramaEpisode(
                project_id=project.id,
                name=title,
                params={"episodeNumber": ep_no},
            )
            db.add(episode)
            await db.flush()
            await _replace_episode_fragments(db, episode, body, assets)
            created.append(episode)
        await db.commit()
        return await _reload_episodes(db, project.id)

    # 已有分集：按集号同步名称与分镜（已生成视频的分镜默认保留，除非 force）
    for episode in existing:
        params = episode.params if isinstance(episode.params, dict) else {}
        ep_no = int(params.get("episodeNumber") or 0)
        item = body_by_number.get(ep_no)
        if item is None:
            continue
        title = str(item.get("title") or episode.name)
        body = str(item.get("body") or item.get("content") or "")
        episode.name = title
        has_video = any((f.video or "").strip() for f in (episode.fragments or []))
        if force or not has_video or _episode_needs_replan(episode):
            await _replace_episode_fragments(db, episode, body, assets)

    # 补建剧本里有、库中没有的集
    existing_numbers = {
        int((ep.params or {}).get("episodeNumber") or 0)
        for ep in existing
        if isinstance(ep.params, dict)
    }
    for ep_no, item in sorted(body_by_number.items()):
        if ep_no in existing_numbers:
            continue
        title = str(item.get("title") or f"第{ep_no}集")
        body = str(item.get("body") or item.get("content") or "")
        episode = DramaEpisode(
            project_id=project.id,
            name=title,
            params={"episodeNumber": ep_no},
        )
        db.add(episode)
        await db.flush()
        await _replace_episode_fragments(db, episode, body, assets)

    await db.commit()
    return await _reload_episodes(db, project.id)


async def _replace_episode_fragments(
    db: AsyncSession,
    episode: DramaEpisode,
    body: str,
    assets: list[DramaAsset],
) -> None:
    # 删除旧分镜并按场次重建
    for old in list(episode.fragments or []):
        await db.delete(old)
    await db.flush()

    drafts = build_fragments_from_episode_body(body, assets)
    for i, frag in enumerate(drafts):
        row = DramaEpisodeFragment(
            episode_id=episode.id,
            sort_order=i,
            content=str(frag.get("content") or ""),
            duration_sec=int(frag.get("duration_sec") or 8),
            params={
                "sceneName": frag.get("scene_name"),
                "characterNames": frag.get("character_names") or [],
            },
        )
        db.add(row)
        await db.flush()
        for asset_id in frag.get("asset_ids") or []:
            db.add(DramaFragmentAssetRef(fragment_id=row.id, asset_id=int(asset_id)))


def _should_auto_replan(existing: list[DramaEpisode], bodies: list[dict[str, Any]]) -> bool:
    # 无分集、分镜为空、仍是场记原文、场次数与正文不符、或剧本集数更多时自动重切
    if not existing:
        return True
    if any(_episode_needs_replan(ep) for ep in existing):
        return True
    body_by_number = {
        int(item.get("episodeNumber") or 0): item
        for item in bodies
        if isinstance(item, dict) and int(item.get("episodeNumber") or 0) >= 1
    }
    for episode in existing:
        params = episode.params if isinstance(episode.params, dict) else {}
        ep_no = int(params.get("episodeNumber") or 0)
        item = body_by_number.get(ep_no)
        if not item:
            continue
        script_body = str(item.get("body") or item.get("content") or "")
        scene_count = len(split_episode_content_into_scenes(script_body))
        frag_count = len(episode.fragments or [])
        if scene_count > 0 and frag_count != scene_count:
            return True
    if len(bodies) > len(existing):
        return True
    return False


def _episode_needs_replan(episode: DramaEpisode) -> bool:
    frags = list(episode.fragments or [])
    if not frags:
        return True
    if any(is_raw_screenplay_fragment(f.content or "") for f in frags):
        return True
    return False


async def _reload_episodes(db: AsyncSession, project_id: int) -> list[DramaEpisode]:
    result = await db.execute(
        select(DramaEpisode)
        .where(DramaEpisode.project_id == project_id)
        .options(
            selectinload(DramaEpisode.fragments).selectinload(
                DramaEpisodeFragment.asset_references
            )
        )
        .order_by(DramaEpisode.id.asc())
    )
    return list(result.scalars().all())


def _episode_bodies(episode_content: Any) -> list[str]:
    items = _normalize_episode_list(episode_content)
    return [str(x.get("body") or x.get("content") or "") for x in items]


def _normalize_episode_list(episode_content: Any) -> list[dict[str, Any]]:
    if isinstance(episode_content, dict) and isinstance(episode_content.get("episodes"), list):
        return [x for x in episode_content["episodes"] if isinstance(x, dict)]
    if isinstance(episode_content, list):
        return [x for x in episode_content if isinstance(x, dict)]
    return []
