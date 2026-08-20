"""Seed drama assets / episodes from script."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from dataclasses import dataclass, field
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
    CAST_LINE_RE,
    build_fragments_from_episode_body,
    extract_introduced_names_from_content,
    is_raw_screenplay_fragment,
    parse_cast_names,
    split_episode_content_into_scenes,
)
from app.services.drama.access import detach_task_fragment_refs
from app.services.drama.extract_props_materials import extract_props_materials
from app.services.drama.seed_asset_params import (
    build_character_params,
    build_named_image_params,
    build_scene_params,
)

logger = logging.getLogger(__name__)

# PROMPT_REFRESH_CONCURRENCY 并发生图提示词 LLM 数
PROMPT_REFRESH_CONCURRENCY = 3

# 资产库类型（不含 voice 等）
LIBRARY_ASSET_TYPES = frozenset({"character", "scene", "prop", "material", "none"})


def _normalize_asset_name(name: str) -> str:
    """统一资产名空白，避免「张三」与「张三 」重复入库。"""
    return re.sub(r"\s+", " ", (name or "").strip())


def _asset_dedupe_key(asset_type: str, name: str) -> tuple[str, str]:
    """(类型, 规范化名称) 作为去重键；none 与 material 视为同类。"""
    kind = (asset_type or "").lower()
    if kind == "none":
        kind = "material"
    return (kind, _normalize_asset_name(name))


@dataclass
class SeedAssetsResult:
    assets: list[DramaAsset]
    created_count: int = 0
    prompts_refreshed: int = 0
    props_updated: int = 0
    llm_errors: list[str] = field(default_factory=list)


# 刷新 params 时保留生成状态与音色绑定
def _merge_preserved_asset_params(old: dict[str, Any], fresh: dict[str, Any]) -> dict[str, Any]:
    merged = dict(fresh)
    for key in ("generation", "voiceAudio"):
        if key in old:
            merged[key] = old[key]
    old_canvas = old.get("canvas") if isinstance(old.get("canvas"), dict) else {}
    new_canvas = merged.get("canvas") if isinstance(merged.get("canvas"), dict) else {}
    canvas = dict(new_canvas)
    if isinstance(old_canvas, dict) and old_canvas.get("voiceAudio"):
        canvas["voiceAudio"] = old_canvas["voiceAudio"]
    merged["canvas"] = canvas
    return merged


# 将 LLM/规则生成的提示词写回资产 params
def _write_visual_prompt_to_asset(asset: DramaAsset, prompt: str) -> None:
    params = dict(asset.params or {})
    params["visualPrompt"] = prompt
    params["visualImage"] = prompt
    canvas = params.get("canvas")
    if isinstance(canvas, dict):
        canvas = dict(canvas)
        gen = canvas.get("generation")
        if isinstance(gen, dict):
            canvas["generation"] = {**dict(gen), "prompt": prompt}
        else:
            canvas["generation"] = {"prompt": prompt}
        params["canvas"] = canvas
    asset.params = params


async def refresh_asset_prompts_from_script(
    db: AsyncSession,
    project: DramaProject,
    assets: list[DramaAsset],
) -> tuple[int, list[str]]:
    """按最新剧本为已有资产生成完整生图提示词（不删封面/视频）。"""
    from app.services.drama.visual_prompt import resolve_visual_prompt_for_asset

    targets = [
        a
        for a in assets
        if (a.type or "").lower() not in {"voice", "video", "audio", "text"}
    ]
    if not targets:
        return 0, []

    sem = asyncio.Semaphore(PROMPT_REFRESH_CONCURRENCY)
    updated = 0
    errors: list[str] = []

    async def _refresh_one(asset: DramaAsset) -> None:
        nonlocal updated
        async with sem:
            kind = (asset.type or "").lower()
            name = asset.name or "未命名"
            try:
                prompt = await resolve_visual_prompt_for_asset(
                    asset,
                    project,
                    None,
                    force_refresh=True,
                    strict_llm=True,
                )
            except Exception as exc:  # noqa: BLE001
                cause = exc.__cause__ or exc.__context__
                detail = f"{exc}" + (f" ← {cause}" if cause else "")
                errors.append(f"{kind}/{name}: {detail}")
                logger.warning("资产提示词 AI 刷新失败 asset_id=%s err=%s", asset.id, detail)
                return
            _write_visual_prompt_to_asset(asset, prompt)
            updated += 1

    await asyncio.gather(*[_refresh_one(a) for a in targets])
    if updated:
        await db.flush()
    return updated, errors


async def seed_assets_from_script(
    db: AsyncSession,
    project: DramaProject,
    *,
    refresh_prompts: bool = False,
    reextract_props: bool = False,
) -> SeedAssetsResult:
    # Create character/scene/prop/material assets from script if missing
    script = project.script
    if not script or not script.summary:
        raise ValueError("请先生成剧本摘要")

    summary = script.summary if isinstance(script.summary, dict) else {}
    story_type = str(summary.get("storyType") or "").strip()
    existing = list(
        (await db.execute(select(DramaAsset).where(DramaAsset.project_id == project.id)))
        .scalars()
        .all()
    )
    existing_by_key: dict[tuple[str, str], DramaAsset] = {}
    for asset in existing:
        name = _normalize_asset_name(asset.name or "")
        if not name:
            continue
        key = _asset_dedupe_key(asset.type or "", name)
        existing_by_key.setdefault(key, asset)

    project_params = dict(project.params or {}) if isinstance(project.params, dict) else {}
    has_prop = any((a.type or "") == "prop" for a in existing)
    has_material = any((a.type or "") in {"material", "none"} for a in existing)
    props_seeded = bool(project_params.get("props_materials_seeded"))
    if reextract_props:
        props_seeded = False
        project_params["props_materials_seeded"] = False
        project.params = project_params

    created: list[DramaAsset] = []
    props_updated = 0
    llm_errors: list[str] = []
    logger.info(
        "seed_assets project_id=%s refresh_prompts=%s reextract_props=%s existing=%s",
        project.id,
        refresh_prompts,
        reextract_props,
        len(existing),
    )

    # refresh：先把摘要人物/场景字段同步到已有资产
    if refresh_prompts:
        for ch in summary.get("characters") or []:
            if not isinstance(ch, dict):
                continue
            name = str(ch.get("name") or "").strip()
            asset = existing_by_key.get(_asset_dedupe_key("character", name))
            if asset:
                asset.params = _merge_preserved_asset_params(
                    dict(asset.params or {}),
                    build_character_params(ch),
                )

    # Extract scene names from episode bodies
    bodies = _episode_bodies(script.episode_content)
    # summary_by_name 摘要人物小传，优先用于建角色
    summary_by_name: dict[str, dict[str, Any]] = {}
    for ch in summary.get("characters") or []:
        if not isinstance(ch, dict):
            continue
        name = str(ch.get("name") or "").strip()
        if name:
            summary_by_name[name] = ch
    # cast_names 分集「出场人物」全量名单（补摘要遗漏）
    cast_names = _extract_cast_names_from_bodies(bodies)
    # character_names 摘要 + 出场人物合并保序
    character_names: list[str] = []
    for name in list(summary_by_name.keys()) + cast_names:
        if name not in character_names:
            character_names.append(name)

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

    if refresh_prompts:
        for scene in scene_names:
            asset = existing_by_key.get(_asset_dedupe_key("scene", scene))
            if asset:
                asset.params = _merge_preserved_asset_params(
                    dict(asset.params or {}),
                    build_scene_params(scene, story_type),
                )

    for name in character_names:
        norm = _normalize_asset_name(name)
        if not norm:
            continue
        char_key = _asset_dedupe_key("character", norm)
        if char_key in existing_by_key:
            continue
        ch = summary_by_name.get(name) or summary_by_name.get(norm) or _character_stub_from_cast(
            norm, story_type, summary=summary, bodies=bodies,
        )
        asset = DramaAsset(
            project_id=project.id,
            type="character",
            asset_type="image",
            name=norm,
            params=build_character_params(ch),
        )
        db.add(asset)
        created.append(asset)
        existing_by_key[char_key] = asset

    for scene in scene_names[:40]:
        norm = _normalize_asset_name(scene)
        if not norm:
            continue
        scene_key = _asset_dedupe_key("scene", norm)
        if scene_key in existing_by_key:
            continue
        asset = DramaAsset(
            project_id=project.id,
            type="scene",
            asset_type="image",
            name=norm,
            params=build_scene_params(norm, story_type),
        )
        db.add(asset)
        created.append(asset)
        existing_by_key[scene_key] = asset

    # 道具 / 素材：尚无该类资产、或强制重抽时调用 LLM
    need_props = not has_prop
    need_materials = not has_material
    should_extract_props = not props_seeded and (
        need_props or need_materials or reextract_props
    )
    if should_extract_props:
        try:
            extracted = await extract_props_materials(summary=summary, episode_bodies=bodies)
        except Exception:
            if reextract_props:
                raise
            logger.exception("道具/素材 LLM 抽取失败 project_id=%s", project.id)
            extracted = {"props": [], "materials": []}
        if need_props or reextract_props:
            for item in extracted.get("props") or []:
                name = _normalize_asset_name(str(item.get("name") or ""))
                visual = str(item.get("visualPrompt") or "").strip()
                if not name:
                    continue
                prop_key = _asset_dedupe_key("prop", name)
                existing_asset = existing_by_key.get(prop_key)
                if existing_asset and reextract_props and visual:
                    existing_asset.params = _merge_preserved_asset_params(
                        dict(existing_asset.params or {}),
                        build_named_image_params(visual, "1:1", kind="prop"),
                    )
                    props_updated += 1
                    continue
                if prop_key in existing_by_key:
                    continue
                asset = DramaAsset(
                    project_id=project.id,
                    type="prop",
                    asset_type="image",
                    name=name,
                    params=build_named_image_params(visual, "1:1", kind="prop"),
                )
                db.add(asset)
                created.append(asset)
                existing_by_key[prop_key] = asset
        if need_materials or reextract_props:
            for item in extracted.get("materials") or []:
                name = _normalize_asset_name(str(item.get("name") or ""))
                visual = str(item.get("visualPrompt") or "").strip()
                if not name:
                    continue
                mat_key = _asset_dedupe_key("material", name)
                existing_asset = existing_by_key.get(mat_key)
                if existing_asset and reextract_props and visual:
                    existing_asset.params = _merge_preserved_asset_params(
                        dict(existing_asset.params or {}),
                        build_named_image_params(visual, "16:9", kind="material"),
                    )
                    props_updated += 1
                    continue
                if mat_key in existing_by_key:
                    continue
                asset = DramaAsset(
                    project_id=project.id,
                    type="material",
                    asset_type="image",
                    name=name,
                    params=build_named_image_params(visual, "16:9", kind="material"),
                )
                db.add(asset)
                created.append(asset)
                existing_by_key[mat_key] = asset
        project_params["props_materials_seeded"] = True
        project.params = project_params

    if refresh_prompts or created or reextract_props:
        await db.flush()

    prompts_refreshed = 0
    if refresh_prompts:
        all_assets = list(
            (
                await db.execute(
                    select(DramaAsset)
                    .where(DramaAsset.project_id == project.id)
                    .order_by(DramaAsset.id.asc())
                )
            ).scalars().all()
        )
        prompts_refreshed, refresh_errors = await refresh_asset_prompts_from_script(
            db, project, all_assets
        )
        llm_errors.extend(refresh_errors)

    await db.commit()
    result = await db.execute(
        select(DramaAsset).where(DramaAsset.project_id == project.id).order_by(DramaAsset.id.asc())
    )
    return SeedAssetsResult(
        assets=list(result.scalars().all()),
        created_count=len(created),
        prompts_refreshed=prompts_refreshed,
        props_updated=props_updated,
        llm_errors=llm_errors,
    )


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
    summary = script.summary if isinstance(script.summary, dict) else None

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
        # series_introduced 本剧已介绍角色（按集号累计）
        series_introduced: set[str] = set()
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
            planned = await _replace_episode_fragments(
                db,
                episode,
                body,
                assets,
                already_introduced=series_introduced,
                summary=summary,
            )
            for frag in planned:
                series_introduced.update(
                    extract_introduced_names_from_content(str(frag.get("content") or ""))
                )
            created.append(episode)
        await db.commit()
        return await _reload_episodes(db, project.id)

    # 已有分集：按集号同步名称与分镜（已生成视频 / 用户编辑过的分镜默认保留，除非 force）
    # series_introduced 按集号累计本剧已介绍角色
    series_introduced: set[str] = set()
    ordered_existing = sorted(
        existing,
        key=lambda ep: (
            int((ep.params or {}).get("episodeNumber") or 0) if isinstance(ep.params, dict) else 0,
            int(ep.id or 0),
        ),
    )
    for episode in ordered_existing:
        params = episode.params if isinstance(episode.params, dict) else {}
        ep_no = int(params.get("episodeNumber") or 0)
        item = body_by_number.get(ep_no)
        if item is None:
            for frag in episode.fragments or []:
                series_introduced.update(extract_introduced_names_from_content(frag.content or ""))
            continue
        title = str(item.get("title") or episode.name)
        body = str(item.get("body") or item.get("content") or "")
        episode.name = title
        if force or _episode_should_replace_fragments(episode, body):
            planned = await _replace_episode_fragments(
                db,
                episode,
                body,
                assets,
                already_introduced=series_introduced,
                summary=summary,
            )
            for frag in planned:
                series_introduced.update(
                    extract_introduced_names_from_content(str(frag.get("content") or ""))
                )
        else:
            for frag in episode.fragments or []:
                series_introduced.update(extract_introduced_names_from_content(frag.content or ""))

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
        planned = await _replace_episode_fragments(
            db,
            episode,
            body,
            assets,
            already_introduced=series_introduced,
            summary=summary,
        )
        for frag in planned:
            series_introduced.update(
                extract_introduced_names_from_content(str(frag.get("content") or ""))
            )
    await db.commit()
    return await _reload_episodes(db, project.id)


async def _list_episode_fragments(
    db: AsyncSession,
    episode_id: int,
) -> list[DramaEpisodeFragment]:
    # 显式查询分镜，避免 async 会话下 lazy load episode.fragments 触发 MissingGreenlet
    result = await db.execute(
        select(DramaEpisodeFragment)
        .where(DramaEpisodeFragment.episode_id == episode_id)
        .order_by(DramaEpisodeFragment.sort_order.asc())
    )
    return list(result.scalars().all())


async def _replace_episode_fragments(
    db: AsyncSession,
    episode: DramaEpisode,
    body: str,
    assets: list[DramaAsset],
    drafts: list[dict[str, Any]] | None = None,
    already_introduced: set[str] | None = None,
    summary: dict[str, Any] | None = None,
    *,
    preserve_protected: bool = False,
    continuation: bool = False,
) -> list[dict[str, Any]]:
    # 删除旧分镜并重建；preserve_protected 时保留已有视频/手改分镜
    existing = await _list_episode_fragments(db, episode.id)
    protected = (
        sorted(
            [f for f in existing if _fragment_is_protected(f)],
            key=lambda f: int(f.sort_order or 0),
        )
        if preserve_protected
        else []
    )
    protected_ids = {int(f.id) for f in protected}
    stale_ids = [int(f.id) for f in existing if int(f.id) not in protected_ids]
    await detach_task_fragment_refs(db, stale_ids)
    for old in existing:
        if int(old.id) not in protected_ids:
            await db.delete(old)
    await db.flush()

    planned = (
        drafts
        if drafts is not None
        else build_fragments_from_episode_body(
            body,
            assets,
            already_introduced=already_introduced,
            summary=summary,
        )
    )
    # 全量重拆时跳过与已拍前缀等量的草稿；续拆（continuation）则草稿全是后续镜
    if protected and not continuation:
        skip = min(len(protected), len(planned))
        planned = planned[skip:]
    if protected:
        for i, frag in enumerate(protected):
            frag.sort_order = i

    base = len(protected)
    for i, frag in enumerate(planned):
        row = DramaEpisodeFragment(
            episode_id=episode.id,
            sort_order=base + i,
            content=str(frag.get("content") or ""),
            duration_sec=int(frag.get("duration_sec") or 8),
            params={
                "sceneName": frag.get("scene_name"),
                "characterNames": frag.get("character_names") or [],
                "user_edited": False,
            },
        )
        db.add(row)
        await db.flush()
        for asset_id in frag.get("asset_ids") or []:
            db.add(DramaFragmentAssetRef(fragment_id=row.id, asset_id=int(asset_id)))

    # 记录切分所用剧本身份，供后续判断是否需要自动重切
    ep_params = dict(episode.params) if isinstance(episode.params, dict) else {}
    ep_params["fragment_source_fp"] = _script_body_fingerprint(body)
    episode.params = ep_params
    return planned


def resolve_episode_script_body(episode_content: Any, episode: DramaEpisode) -> str:
    # 按 episodeNumber 从剧本 episode_content 取本集场记正文
    ep_no = 0
    if isinstance(episode.params, dict):
        ep_no = int(episode.params.get("episodeNumber") or 0)
    for item in _normalize_episode_list(episode_content):
        if int(item.get("episodeNumber") or 0) == ep_no:
            return str(item.get("body") or item.get("content") or "")
    return ""


async def replace_episode_fragments_with_drafts(
    db: AsyncSession,
    episode: DramaEpisode,
    body: str,
    assets: list[DramaAsset],
    drafts: list[dict[str, Any]],
    *,
    preserve_protected: bool = True,
    continuation: bool = False,
) -> None:
    # 用外部草稿（LLM）覆盖本集分镜；默认保留已生成视频/手改
    await _replace_episode_fragments(
        db,
        episode,
        body,
        assets,
        drafts=drafts,
        preserve_protected=preserve_protected,
        continuation=continuation,
    )


def _script_body_fingerprint(body: str) -> str:
    # 分集正文指纹（用于判断剧本是否变更）
    normalized = (body or "").replace("\r\n", "\n").strip()
    return hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:16]


def _fragment_is_protected(frag: DramaEpisodeFragment) -> bool:
    # 已有视频或用户手改过的分镜，非 force 时不覆盖
    if (frag.video or "").strip():
        return True
    params = frag.params if isinstance(frag.params, dict) else {}
    return bool(params.get("user_edited"))


def _episode_has_protected_fragments(episode: DramaEpisode) -> bool:
    return any(_fragment_is_protected(f) for f in (episode.fragments or []))


def _should_auto_replan(existing: list[DramaEpisode], bodies: list[dict[str, Any]]) -> bool:
    # 无分集、分镜为空、仍是场记原文、剧本变更且无保护分镜、或剧本集数更多时自动重切
    if not existing:
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
        body = str((item or {}).get("body") or (item or {}).get("content") or "") if item else ""
        if _episode_should_replace_fragments(episode, body):
            return True
    if len(bodies) > len(existing):
        return True
    return False


def _episode_should_replace_fragments(episode: DramaEpisode, script_body: str) -> bool:
    # 是否应用规则重切本集分镜（保护视频/手改）
    frags = list(episode.fragments or [])
    if not frags:
        return True
    if any(is_raw_screenplay_fragment(f.content or "") for f in frags):
        # 场记原文必须重切；若已有保护项仍重切（自动修复旧数据）
        return True
    if _episode_has_protected_fragments(episode):
        return False
    params = episode.params if isinstance(episode.params, dict) else {}
    stored_fp = str(params.get("fragment_source_fp") or "")
    current_fp = _script_body_fingerprint(script_body) if script_body else ""
    if stored_fp and current_fp and stored_fp != current_fp:
        return True
    if not stored_fp and script_body:
        # 旧数据无指纹：场次数明显大于 1 且仅 1 条分镜时重切
        scene_count = len(split_episode_content_into_scenes(script_body))
        if scene_count > 1 and len(frags) == 1:
            return True
    return False


def _episode_needs_replan(episode: DramaEpisode) -> bool:
    # 兼容旧调用名
    return _episode_should_replace_fragments(episode, "")


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


def _extract_cast_names_from_bodies(bodies: list[str]) -> list[str]:
    """从分集正文「出场人物：」行收集全部角色名（去重保序）。"""
    # seen 已收录名
    seen: set[str] = set()
    # names 保序结果
    names: list[str] = []
    for body in bodies:
        for line in (body or "").replace("\r\n", "\n").split("\n"):
            match = CAST_LINE_RE.match(line.strip())
            if not match:
                continue
            for name in parse_cast_names(match.group(1)):
                if name not in seen:
                    seen.add(name)
                    names.append(name)
    return names


def _character_stub_from_cast(
    name: str,
    story_type: str = "",
    summary: dict[str, Any] | None = None,
    bodies: list[str] | None = None,
) -> dict[str, Any]:
    """分集出场但摘要未写小传时的角色 stub（供建资产 + 后续 AI 补提示词）。"""
    from app.services.drama.build_fragments import infer_character_intro_text

    genre = (story_type or "").strip() or "短剧"
    stub_params = {
        "name": name,
        "title": "出场人物",
        "roleType": "配角",
        "visualImage": (
            f"{name}，{genre}人物定妆，可辨识面容与服饰，体态与气质贴合身份，"
            "影视级写实，白底全身可拍摄"
        ),
        "coreTags": "出场人物",
        "personality": "",
        "identityBackground": f"剧本分集出场人物「{name}」",
        "growthExperience": "",
        "relationships": "",
        "growthArc": "出场 -> 卷入冲突 -> 结局余韵",
    }
    intro = infer_character_intro_text(name, stub_params, summary, bodies)
    if intro:
        stub_params["title"] = intro
        stub_params["identityBackground"] = intro
    return stub_params


def _normalize_episode_list(episode_content: Any) -> list[dict[str, Any]]:
    if isinstance(episode_content, dict) and isinstance(episode_content.get("episodes"), list):
        return [x for x in episode_content["episodes"] if isinstance(x, dict)]
    if isinstance(episode_content, list):
        return [x for x in episode_content if isinstance(x, dict)]
    return []
