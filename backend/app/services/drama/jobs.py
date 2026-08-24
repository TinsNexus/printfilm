"""Drama long-running jobs executed in-process by the task platform."""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import User
from app.models_tasks import TaskRun
from app.models_drama import (
    DramaAsset,
    DramaEpisode,
    DramaEpisodeFragment,
    DramaFragmentAssetRef,
    DramaProject,
)
from app.services.billing import record_usage
from app.services.drama.agents import (
    count_completed_episodes,
    ensure_episode_outline,
    format_summary_text,
    merge_episode_bodies,
    resolve_episode_target,
    run_episode_script_batch,
    run_script_summary,
)
from app.services.drama.asset_video import generate_asset_video
from app.services.drama.generation import (
    apply_fragment_video_assets,
    build_failed_generation_params,
    deserialize_fragment_video_prepared,
    fragment_generation_status,
    generate_asset_image,
    generate_fragment_video,
    prepare_fragment_video_for_submit,
    project_link_last_frame_enabled,
    serialize_fragment_video_prepared,
    submit_prepared_fragment_video,
)
from app.services.drama.visual_prompt import resolve_visual_prompt_for_asset

logger = logging.getLogger(__name__)

# in-process fallback handles
_running: dict[str, asyncio.Task] = {}
# 分集视频取消标记（episode_id）
_video_cancelled_episodes: set[int] = set()
ACTIVE_VIDEO_GEN_STATUSES = frozenset({"queued", "running", "generating"})


def _is_episode_video_cancelled(episode_id: int) -> bool:
    return int(episode_id) in _video_cancelled_episodes


def _mark_episode_video_cancelled(episode_id: int) -> None:
    _video_cancelled_episodes.add(int(episode_id))


def _clear_episode_video_cancelled(episode_id: int) -> None:
    _video_cancelled_episodes.discard(int(episode_id))


def _cancel_inprocess_episode_video(episode_id: int) -> bool:
    # 同时取消旧版整集任务与按分镜拆开的进程内任务
    cancelled = False
    prefix = f"frag:{int(episode_id)}:"
    epgen_key = f"epgen:{int(episode_id)}"
    for key, task in list(_running.items()):
        if key != epgen_key and not str(key).startswith(prefix):
            continue
        if task is None or task.done():
            continue
        task.cancel()
        cancelled = True
    return cancelled


async def _reset_fragment_video_generation(
    db,
    *,
    episode_id: int | None = None,
) -> int:
    q = select(DramaEpisodeFragment)
    if episode_id is not None:
        q = q.where(DramaEpisodeFragment.episode_id == int(episode_id))
    frags = (await db.execute(q)).scalars().all()
    changed = 0
    for frag in frags:
        params = dict(frag.params or {})
        gen = params.get("generation") if isinstance(params, dict) else None
        status = str(gen.get("status") or "") if isinstance(gen, dict) else ""
        if status not in ACTIVE_VIDEO_GEN_STATUSES:
            continue
        params["generation"] = {"status": "cancelled"}
        frag.params = params
        changed += 1
    if changed:
        await db.commit()
    return changed


async def cancel_episode_video_jobs(episode_id: int) -> dict[str, Any]:
    """取消单集视频任务：终止进程内任务并重置分镜状态。"""
    _mark_episode_video_cancelled(episode_id)
    cancelled_inprocess = _cancel_inprocess_episode_video(episode_id)
    async with AsyncSessionLocal() as db:
        fragments = await _reset_fragment_video_generation(db, episode_id=episode_id)
    logger.info(
        "取消分集视频 episode_id=%s inprocess=%s fragments=%s",
        episode_id,
        cancelled_inprocess,
        fragments,
    )
    return {
        "ok": True,
        "episode_id": episode_id,
        "inprocess": cancelled_inprocess,
        "purged": 0,
        "revoked": 0,
        "fragments": fragments,
    }


async def cancel_all_episode_video_jobs() -> dict[str, Any]:
    """取消全部漫剧分镜视频任务。"""
    episode_ids = set(_video_cancelled_episodes)
    async with AsyncSessionLocal() as db:
        frags = (await db.execute(select(DramaEpisodeFragment))).scalars().all()
        for frag in frags:
            params = frag.params or {}
            gen = params.get("generation") if isinstance(params, dict) else None
            status = str(gen.get("status") or "") if isinstance(gen, dict) else ""
            if status in ACTIVE_VIDEO_GEN_STATUSES:
                episode_ids.add(int(frag.episode_id))
    for ep_id in list(episode_ids):
        _mark_episode_video_cancelled(ep_id)
        _cancel_inprocess_episode_video(ep_id)

    async with AsyncSessionLocal() as db:
        fragments = await _reset_fragment_video_generation(db)
    logger.info(
        "取消全部视频任务 fragments=%s episodes=%s",
        fragments,
        len(episode_ids),
    )
    return {
        "ok": True,
        "purged": 0,
        "revoked": 0,
        "fragments": fragments,
        "episodes": len(episode_ids),
    }


def _job_key(kind: str, entity_id: int) -> str:
    return f"{kind}:{entity_id}"


# ---------- script summary ----------


def dispatch_script_summary_job(project_id: int) -> str:
    """Start one in-process script-summary task.

    Caller should mark summary_status=generating before calling.
    """
    key = _job_key("summary", project_id)
    if key in _running and not _running[key].done():
        logger.info("dispatch 剧本摘要 → 进程内已在跑 project_id=%s", project_id)
        return "in-process"
    _running[key] = asyncio.create_task(run_script_summary_job(project_id))
    logger.info("dispatch 剧本摘要 → 进程内新建 project_id=%s", project_id)
    return "in-process"


async def run_script_summary_job(project_id: int) -> dict[str, Any]:
    # Worker：生成剧本摘要并写库
    logger.info("开始生成剧本摘要 project_id=%s", project_id)
    async with AsyncSessionLocal() as db:
        project = await db.get(
            DramaProject,
            project_id,
            options=[selectinload(DramaProject.script)],
        )
        if not project or not project.script:
            logger.warning("剧本摘要失败：缺少剧本 project_id=%s", project_id)
            return {"ok": False, "error": "missing_script"}
        script = project.script
        creative = (script.source or "").strip()
        episode_count = (project.params or {}).get("episode_count")
        image_style_id = (project.params or {}).get("image_style_id")
        try:
            summary = await run_script_summary(
                creative,
                episode_count=int(episode_count) if episode_count else None,
                image_style_id=str(image_style_id) if image_style_id else None,
            )
        except Exception as exc:  # noqa: BLE001
            params = dict(script.params or {})
            params["summary_status"] = "failed"
            params["summary_error"] = str(exc)[:500]
            params.pop("summary_generating_at", None)
            script.params = params
            await db.commit()
            logger.exception("剧本摘要失败 project_id=%s err=%s", project_id, exc)
            return {"ok": False, "error": str(exc)[:500]}

        script.summary = summary
        params = dict(script.params or {})
        params["summary_text"] = format_summary_text(summary)
        params["summary_status"] = "completed"
        params["summary_error"] = None
        params.pop("summary_generating_at", None)
        params["episode_content_status"] = params.get("episode_content_status") or "pending"
        script.params = params
        one_line = str(summary.get("oneLineStory") or "").strip()
        if one_line:
            project.description = one_line[:500]
            if len(project.title) > 36 or project.title.startswith(creative[:20]):
                project.title = one_line[:40] + ("…" if len(one_line) > 40 else "")
                script.name = project.title
        user = await db.get(User, project.user_id)
        if user:
            await record_usage(
                db,
                user_id=user.id,
                project_id=None,
                drama_project_id=project.id,
                billing_key="llm_chat",
                model=get_settings().model_llm,
                estimated=True,
            )
        await db.commit()
        logger.info(
            "剧本摘要完成 project_id=%s episode_count=%s one_line=%s",
            project_id,
            summary.get("episodeCount"),
            (one_line[:40] + "…") if len(one_line) > 40 else one_line,
        )
        return {"ok": True, "project_id": project_id}


# ---------- episode scripts ----------


def dispatch_episode_scripts_job(project_id: int, force: bool = False) -> str:
    """Start one in-process episode-script task.

    Caller should mark episode_content_status=generating before calling.
    """
    key = _job_key("episodes", project_id)
    if key in _running and not _running[key].done():
        logger.info("dispatch 分集剧本 → 进程内已在跑 project_id=%s", project_id)
        return "in-process"
    _running[key] = asyncio.create_task(run_episode_scripts_job(project_id, force=force))
    logger.info("dispatch 分集剧本 → 进程内新建 project_id=%s force=%s", project_id, force)
    return "in-process"


async def run_episode_scripts_job(project_id: int, force: bool = False) -> dict[str, Any]:
    # Worker：大纲 + 循环逐集直到完成
    logger.info("开始生成分集剧本 project_id=%s force=%s", project_id, force)
    async with AsyncSessionLocal() as db:
        project = await db.get(
            DramaProject,
            project_id,
            options=[selectinload(DramaProject.script)],
        )
        if not project or not project.script or not project.script.summary:
            logger.warning("分集剧本失败：缺少摘要 project_id=%s", project_id)
            return {"ok": False, "error": "missing_summary"}

        script = project.script
        summary = script.summary if isinstance(script.summary, dict) else {}
        existing: list = []
        content = script.episode_content
        if isinstance(content, dict) and isinstance(content.get("episodes"), list):
            existing = list(content["episodes"])
        elif isinstance(content, list):
            existing = list(content)

        total = resolve_episode_target(summary, project.params, script.params)
        if summary.get("episodeCount") != total:
            summary = {**summary, "episodeCount": total}
            script.summary = summary

        creative = (script.source or "").strip()
        try:
            if force and existing:
                existing = [
                    {
                        "episodeNumber": int(item.get("episodeNumber") or 0),
                        "title": str(item.get("title") or f"第 {item.get('episodeNumber')} 集"),
                        "body": "",
                    }
                    for item in existing
                    if isinstance(item, dict) and int(item.get("episodeNumber") or 0) >= 1
                ]
                script.episode_content = {"episodes": existing}
                await db.flush()
                logger.info("已清空分集正文准备重写 project_id=%s total=%s", project_id, total)

            existing = await ensure_episode_outline(creative, summary, existing, total)
            script.episode_content = {"episodes": existing}
            await db.flush()
            logger.info("分集大纲就绪 project_id=%s titles=%s", project_id, len(existing))

            guard = 0
            while True:
                generated = count_completed_episodes(existing, total)
                if generated >= total:
                    break
                logger.info(
                    "生成下一集 project_id=%s progress=%s/%s",
                    project_id,
                    generated,
                    total,
                )
                batch = await run_episode_script_batch(
                    summary,
                    existing,
                    batch_size=1,
                    total=total,
                    creative=creative,
                )
                existing = merge_episode_bodies(existing, batch)
                script.episode_content = {"episodes": existing}
                params = dict(script.params or {})
                params["episode_content_status"] = "generating"
                params["episode_count"] = total
                params["episode_content_progress"] = {
                    "done": count_completed_episodes(existing, total),
                    "total": total,
                }
                script.params = params
                await db.commit()
                user = await db.get(User, project.user_id)
                if user:
                    await record_usage(
                        db,
                        user_id=user.id,
                        project_id=None,
                        drama_project_id=project.id,
                        billing_key="llm_chat",
                        model=get_settings().model_llm,
                        estimated=True,
                    )
                    await db.commit()
                await db.refresh(script)
                content = script.episode_content
                if isinstance(content, dict) and isinstance(content.get("episodes"), list):
                    existing = list(content["episodes"])
                done_now = count_completed_episodes(existing, total)
                logger.info(
                    "分集进度更新 project_id=%s progress=%s/%s",
                    project_id,
                    done_now,
                    total,
                )
                guard += 1
                if guard > max(total * 2, 24):
                    raise RuntimeError(
                        f"分集生成未完成（{count_completed_episodes(existing, total)}/{total}）"
                    )
                if not batch:
                    raise RuntimeError("分集生成无进度")

            params = dict(script.params or {})
            params["episode_content_status"] = "completed"
            params["episode_content_error"] = None
            params["episode_count"] = total
            params["episode_content_progress"] = {"done": total, "total": total}
            script.params = params
            await db.commit()
            logger.info("分集剧本全部完成 project_id=%s total=%s", project_id, total)
            return {"ok": True, "project_id": project_id, "total": total}
        except Exception as exc:  # noqa: BLE001
            params = dict(script.params or {})
            params["episode_content_status"] = "failed"
            params["episode_content_error"] = str(exc)[:500]
            script.params = params
            await db.commit()
            logger.exception("分集剧本失败 project_id=%s err=%s", project_id, exc)
            return {"ok": False, "error": str(exc)[:500]}


# ---------- episode fragment plan (LLM) ----------


def dispatch_episode_fragment_plan_job(episode_id: int, *, fallback_rules: bool = True) -> str:
    # 启动单集 LLM 分镜任务。
    key = _job_key("fragplan", episode_id)
    if key in _running and not _running[key].done():
        logger.info("dispatch 单集分镜 → 进程内已在跑 episode_id=%s", episode_id)
        return "in-process"
    _running[key] = asyncio.create_task(
        run_episode_fragment_plan_job(episode_id, fallback_rules=fallback_rules)
    )
    logger.info("dispatch 单集分镜 → 进程内新建 episode_id=%s", episode_id)
    return "in-process"


async def run_episode_fragment_plan_job(
    episode_id: int,
    *,
    fallback_rules: bool = True,
    subtitle_enabled: bool | None = None,
) -> dict[str, Any]:
    # Worker：LLM 规划本集分镜并落库；失败可选回退规则切分
    from app.services.drama.build_fragments import build_fragments_from_episode_body
    from app.services.drama.fragment_plan import plan_fragments_with_llm
    from app.services.drama.llm import DramaLlmUnavailableError
    from app.services.drama.seed import (
        _episode_bodies,
        _fragment_is_protected,
        replace_episode_fragments_with_drafts,
        resolve_episode_script_body,
    )

    logger.info("开始单集 LLM 分镜 episode_id=%s", episode_id)
    async with AsyncSessionLocal() as db:
        episode = await db.get(
            DramaEpisode,
            episode_id,
            options=[
                selectinload(DramaEpisode.fragments).selectinload(
                    DramaEpisodeFragment.asset_references
                ),
                selectinload(DramaEpisode.project).selectinload(DramaProject.script),
            ],
        )
        if not episode or not episode.project:
            logger.warning("单集分镜失败：缺少分集 episode_id=%s", episode_id)
            return {"ok": False, "error": "missing_episode"}

        project = episode.project
        script = project.script
        body = resolve_episode_script_body(script.episode_content if script else None, episode)
        if not (body or "").strip():
            params = dict(episode.params or {})
            params["fragment_plan_status"] = "failed"
            params["fragment_plan_error"] = "本集剧本正文为空，无法分镜"
            episode.params = params
            await db.commit()
            return {"ok": False, "error": "empty_body"}

        assets_result = await db.execute(
            select(DramaAsset).where(DramaAsset.project_id == project.id)
        )
        assets = list(assets_result.scalars().all())

        # 本剧更早分集已介绍角色（跨集去重）
        from app.services.drama.build_fragments import collect_series_introduced_names

        siblings_result = await db.execute(
            select(DramaEpisode)
            .where(DramaEpisode.project_id == project.id)
            .options(selectinload(DramaEpisode.fragments))
        )
        siblings = list(siblings_result.scalars().all())
        ep_params = episode.params if isinstance(episode.params, dict) else {}
        raw_subtitles = (
            subtitle_enabled
            if subtitle_enabled is not None
            else (
                False
                if ep_params.get("subtitleMode") == "post"
                else True if ep_params.get("subtitleMode") == "model" else ep_params.get("subtitleEnabled", True)
            )
        )
        if isinstance(raw_subtitles, str):
            normalized = raw_subtitles.strip().lower()
            include_subtitles = normalized not in {"0", "false", "no", "off", ""}
        elif isinstance(raw_subtitles, (int, float)):
            include_subtitles = raw_subtitles != 0
        else:
            include_subtitles = raw_subtitles is not False
        ep_no = int(ep_params.get("episodeNumber") or 0) or None
        from app.services.agent.compose import parse_skill_ids

        skill_ids = (
            parse_skill_ids(ep_params.get("fragment_plan_skill_ids"))
            if "fragment_plan_skill_ids" in ep_params
            else None
        )
        already_introduced = collect_series_introduced_names(
            siblings,
            before_episode_number=ep_no,
            exclude_episode_id=episode.id,
        )

        # 本集已有视频/手改分镜：续拆时锁定，并把已介绍角色并入去重集
        from app.services.drama.build_fragments import extract_introduced_names_from_content

        protected_frags = sorted(
            [f for f in (episode.fragments or []) if _fragment_is_protected(f)],
            key=lambda f: int(f.sort_order or 0),
        )
        locked_summaries: list[str] = []
        for frag in protected_frags:
            for name in extract_introduced_names_from_content(frag.content or ""):
                already_introduced.add(name)
            # 摘要：去掉 cue 行后取前几行画面/对白
            narr: list[str] = []
            for raw in (frag.content or "").replace("\r\n", "\n").split("\n"):
                line = raw.strip()
                if not line or line.startswith("@") or line.startswith("【"):
                    continue
                narr.append(line)
                if len(narr) >= 3:
                    break
            locked_summaries.append("；".join(narr) if narr else f"分镜#{frag.sort_order}")

        mode_used = "llm"
        summary = script.summary if script and isinstance(script.summary, dict) else {}
        from app.services.drama.character_intro_llm import prepare_character_intro_overrides

        all_bodies = _episode_bodies(script.episode_content if script else None)
        if body and body not in all_bodies:
            all_bodies.append(body)
        character_assets = [a for a in assets if getattr(a, "type", "") == "character"]
        intro_overrides = await prepare_character_intro_overrides(
            character_assets,
            summary=summary,
            episode_bodies=all_bodies,
            story_type=str(summary.get("storyType") or "") or None,
        )
        continuation = bool(locked_summaries)
        try:
            drafts = await plan_fragments_with_llm(
                episode_name=episode.name or "",
                episode_body=body,
                assets=assets,
                episode_number=ep_no,
                project_title=project.title or "",
                story_type=str(summary.get("storyType") or "") or None,
                one_line_story=str(summary.get("oneLineStory") or "") or None,
                synopsis=str(summary.get("synopsis") or "") or None,
                core_hook=str(summary.get("coreHook") or "") or None,
                already_introduced=already_introduced,
                summary=summary,
                episode_bodies=all_bodies,
                intro_overrides=intro_overrides,
                locked_summaries=locked_summaries or None,
                db=db,
                user_id=project.user_id,
                skill_ids=skill_ids,
                include_subtitles=include_subtitles,
            )
        except (DramaLlmUnavailableError, RuntimeError, Exception) as exc:  # noqa: BLE001
            logger.exception("LLM 分镜失败 episode_id=%s err=%s", episode_id, exc)
            if not fallback_rules:
                params = dict(episode.params or {})
                params["fragment_plan_status"] = "failed"
                params["fragment_plan_error"] = str(exc)[:500]
                episode.params = params
                await db.commit()
                return {"ok": False, "error": str(exc)[:500]}
            drafts = build_fragments_from_episode_body(
                body,
                assets,
                already_introduced=already_introduced,
                summary=summary,
                episode_bodies=all_bodies,
                intro_overrides=intro_overrides,
                include_subtitles=include_subtitles,
            )
            mode_used = "rules_fallback"
            continuation = False

        await replace_episode_fragments_with_drafts(
            db,
            episode,
            body,
            assets,
            drafts,
            preserve_protected=True,
            continuation=continuation,
        )
        # 重新加载 params（replace 会写 fingerprint）
        params = dict(episode.params or {})
        params["fragment_plan_status"] = "completed"
        params["fragment_plan_mode"] = mode_used
        params.pop("fragment_plan_error", None)
        params["fragment_plan_count"] = len(protected_frags) + len(drafts)
        params["fragment_plan_preserved"] = len(protected_frags)
        episode.params = params
        user = await db.get(User, project.user_id)
        if user:
            await record_usage(
                db,
                user_id=user.id,
                project_id=None,
                drama_project_id=project.id,
                billing_key="llm_chat",
                model=get_settings().model_llm,
                estimated=True,
            )
        await db.commit()
        logger.info(
            "单集分镜完成 episode_id=%s mode=%s new=%s preserved=%s continuation=%s",
            episode_id,
            mode_used,
            len(drafts),
            len(protected_frags),
            continuation,
        )
        return {
            "ok": True,
            "mode": mode_used,
            "count": len(protected_frags) + len(drafts),
            "preserved": len(protected_frags),
        }


# ---------- episode video ----------


async def _queued_remaining_fragment_ids(fragment_ids: list[int]) -> list[int]:
    # 取消后库里已不是 queued，不再派发下一镜
    still: list[int] = []
    async with AsyncSessionLocal() as db:
        for fid in fragment_ids:
            frag = await db.get(DramaEpisodeFragment, int(fid))
            if not frag:
                continue
            status = str(fragment_generation_status(frag).get("status") or "")
            if status == "queued":
                still.append(int(fid))
    return still


async def _fail_remaining_fragment_videos(fragment_ids: list[int], error: str) -> None:
    # 上一镜失败/取消后，后续镜无法取尾帧，标记失败避免一直「排队中」
    if not fragment_ids:
        return
    async with AsyncSessionLocal() as db:
        changed = 0
        for fid in fragment_ids:
            frag = await db.get(DramaEpisodeFragment, int(fid))
            if not frag:
                continue
            params = dict(frag.params or {})
            gen = params.get("generation") if isinstance(params.get("generation"), dict) else {}
            status = str(gen.get("status") or "")
            if status not in ACTIVE_VIDEO_GEN_STATUSES:
                continue
            params["generation"] = build_failed_generation_params(
                gen if isinstance(gen, dict) else None,
                error,
            )
            frag.params = params
            changed += 1
        if changed:
            await db.commit()
        logger.info("后续分镜已标记失败 count=%s error=%s", changed, error[:80])


async def _run_fragment_chain_inprocess(
    episode_id: int,
    user_id: int,
    fragment_ids: list[int],
) -> None:
    # 进程内按镜序生成，后一镜等上一镜写出尾帧
    remaining = [int(x) for x in fragment_ids]
    while remaining:
        if _is_episode_video_cancelled(episode_id):
            return
        fid = remaining.pop(0)
        ok = await _generate_one_fragment_video(
            episode_id=episode_id,
            user_id=user_id,
            fragment_id=fid,
            sem=asyncio.Semaphore(1),
        )
        if ok:
            continue
        if remaining and not _is_episode_video_cancelled(episode_id):
            await _fail_remaining_fragment_videos(remaining, "上一镜失败，无法衔接尾帧")
        return


def dispatch_episode_generate_job(
    episode_id: int,
    user_id: int,
    fragment_ids: list[int],
    *,
    sequential: bool = True,
) -> str:
    # API 立即返回。开启镜间衔接时按 sort_order 串行，否则可并行入队
    ids = [int(x) for x in fragment_ids]
    _clear_episode_video_cancelled(episode_id)
    if not ids:
        return "queued"

    if sequential:
        key = f"epgen:{int(episode_id)}"
        existing = _running.get(key)
        if existing and not existing.done():
            logger.info("dispatch 分镜视频链 → 进程内已在跑 episode_id=%s", episode_id)
            return "in-process"
        _running[key] = asyncio.create_task(
            _run_fragment_chain_inprocess(episode_id, user_id, ids)
        )
        logger.info(
            "dispatch 分镜视频链 → 进程内异步 episode_id=%s fragments=%s",
            episode_id,
            len(ids),
        )
        return "in-process"

    for fid in ids:
        key = f"frag:{int(episode_id)}:{int(fid)}"
        existing = _running.get(key)
        if existing and not existing.done():
            continue
        _running[key] = asyncio.create_task(
            _generate_one_fragment_video(
                episode_id=episode_id,
                user_id=user_id,
                fragment_id=int(fid),
                sem=asyncio.Semaphore(1),
            )
        )
    logger.info(
        "dispatch 分镜视频并行 → 进程内异步 episode_id=%s fragments=%s",
        episode_id,
        len(ids),
    )
    return "in-process"


# 单个分镜视频（独立 DB session，供并发池调用）
async def _generate_one_fragment_video(
    *,
    episode_id: int,
    user_id: int,
    fragment_id: int,
    sem: asyncio.Semaphore,
) -> bool:
    async with sem:
        async with AsyncSessionLocal() as db:
            ep = await db.get(
                DramaEpisode,
                episode_id,
                options=[
                    selectinload(DramaEpisode.project).selectinload(DramaProject.script),
                ],
            )
            if not ep or not ep.project:
                logger.warning(
                    "分镜视频跳过：分集/项目不存在 episode_id=%s fragment_id=%s",
                    episode_id,
                    fragment_id,
                )
                return False
            project = ep.project
            user = await db.get(User, user_id)
            if not user:
                return False
            frag = await db.get(
                DramaEpisodeFragment,
                fragment_id,
                options=[
                    selectinload(DramaEpisodeFragment.asset_references).selectinload(
                        DramaFragmentAssetRef.asset
                    )
                ],
            )
            if not frag or frag.episode_id != episode_id:
                return False

            gen = frag.params.get("generation") if isinstance(frag.params, dict) else None
            gen_status = str(gen.get("status") or "") if isinstance(gen, dict) else ""
            if _is_episode_video_cancelled(episode_id) or gen_status == "cancelled":
                params = dict(frag.params or {})
                params.pop("generation_attempts", None)
                params["generation"] = {"status": "cancelled"}
                frag.params = params
                await db.commit()
                logger.info(
                    "分镜视频已取消 fragment_id=%s episode_id=%s",
                    fragment_id,
                    episode_id,
                )
                return False

            params = dict(frag.params or {})
            persisted_attempts = int(params.get("generation_attempts") or 0)
            prev_attempts = persisted_attempts
            if isinstance(gen, dict):
                prev_attempts = max(prev_attempts, int(gen.get("attempts") or 0))
            max_attempts = max(1, int(get_settings().drama_fragment_max_attempts or 3))
            attempts = prev_attempts + 1
            if attempts > max_attempts:
                params["generation_attempts"] = prev_attempts
                params["generation"] = build_failed_generation_params(
                    gen if isinstance(gen, dict) else None,
                    f"分镜重试超过上限（{max_attempts} 次）",
                    attempts=prev_attempts,
                    attempt_limit=max_attempts,
                )
                frag.params = params
                await db.commit()
                logger.warning(
                    "分镜视频跳过：超过重试上限 fragment_id=%s attempts=%s limit=%s",
                    fragment_id,
                    prev_attempts,
                    max_attempts,
                )
                return False
            params["generation_attempts"] = attempts
            params["generation"] = {
                "status": "running",
                "attempts": attempts,
                "attempt_limit": max_attempts,
            }
            frag.params = params
            await db.commit()
            try:
                logger.info(
                    "生成分镜视频 fragment_id=%s episode_id=%s attempt=%s/%s",
                    fragment_id,
                    episode_id,
                    attempts,
                    max_attempts,
                )
                await generate_fragment_video(db, user, project, frag)
                await db.refresh(frag)
                params = dict(frag.params or {})
                last_frame = ""
                if isinstance(frag.params, dict):
                    raw = frag.params.get("lastFrameUrl") or frag.params.get("last_frame_url")
                    if isinstance(raw, str):
                        last_frame = raw
                params.pop("generation_attempts", None)
                params["generation"] = {
                    "status": "done",
                    "video": frag.video,
                    "cover": frag.cover,
                    "lastFrameUrl": last_frame or None,
                    "attempts": attempts,
                    "attempt_limit": max_attempts,
                }
                if last_frame:
                    params["lastFrameUrl"] = last_frame
                frag.params = params
                await db.commit()
                return True
            except Exception as exc:  # noqa: BLE001
                params = dict(frag.params or {})
                prev_gen = params.get("generation") if isinstance(params.get("generation"), dict) else None
                params["generation_attempts"] = attempts
                params["generation"] = build_failed_generation_params(
                    prev_gen if isinstance(prev_gen, dict) else None,
                    str(exc),
                    attempts=attempts,
                    attempt_limit=max_attempts,
                )
                frag.params = params
                await db.commit()
                logger.exception(
                    "分镜视频失败 fragment_id=%s attempt=%s/%s",
                    fragment_id,
                    attempts,
                    max_attempts,
                )
                return False


async def run_fragment_generate_job(
    episode_id: int,
    user_id: int,
    fragment_id: int,
    remaining_ids: list[int] | None = None,
) -> dict[str, Any]:
    # 单条分镜；成功后再入队下一镜，保证能读到上一镜尾帧
    remaining = [int(x) for x in (remaining_ids or [])]
    logger.info(
        "开始生成分镜视频 episode_id=%s fragment_id=%s rest=%s",
        episode_id,
        fragment_id,
        len(remaining),
    )
    ok = await _generate_one_fragment_video(
        episode_id=episode_id,
        user_id=user_id,
        fragment_id=int(fragment_id),
        sem=asyncio.Semaphore(1),
    )
    logger.info(
        "分镜视频结束 episode_id=%s fragment_id=%s ok=%s rest=%s",
        episode_id,
        fragment_id,
        ok,
        len(remaining),
    )
    if remaining and not _is_episode_video_cancelled(episode_id):
        if ok:
            still_queued: list[int] = []
            async with AsyncSessionLocal() as db:
                for fid in remaining:
                    frag = await db.get(DramaEpisodeFragment, int(fid))
                    if not frag:
                        continue
                    gen = frag.params.get("generation") if isinstance(frag.params, dict) else None
                    status = str(gen.get("status") or "") if isinstance(gen, dict) else ""
                    if status in {"queued", "running"}:
                        still_queued.append(int(fid))
            if still_queued:
                next_id = still_queued[0]
                rest = still_queued[1:]
                asyncio.create_task(_run_fragment_chain_inprocess(episode_id, user_id, still_queued))
                logger.info(
                    "已衔接下一镜 episode_id=%s next=%s rest=%s",
                    episode_id,
                    next_id,
                    len(rest),
                )
        else:
            await _fail_remaining_fragment_videos(remaining, "上一镜失败，无法衔接尾帧")
    return {
        "ok": ok,
        "episode_id": episode_id,
        "fragment_id": fragment_id,
        "remaining": len(remaining),
    }


# 任务平台（NIO）：Worker 短生命周期 — prepare → submit → 注册 awaiting_poll，由 Selector 轮询。
async def submit_fragment_video_task(task: TaskRun) -> dict[str, Any]:
    from app.services.tasks.service import append_task_event, get_task_for_runtime, set_task_step_state

    payload = task.payload if isinstance(task.payload, dict) else {}
    nio_phase = str(payload.get("nio_phase") or "prepare")
    fragment_ids = payload.get("fragment_ids") or []
    fragment_id = int(task.fragment_id or (fragment_ids[0] if fragment_ids else 0))
    episode_id = int(task.episode_id or payload.get("episode_id") or 0)
    user_id = int(task.requested_by)
    if fragment_id <= 0 or episode_id <= 0:
        raise ValueError("任务缺少 episode_id / fragment_id")

    async with AsyncSessionLocal() as db:
        task_row = await get_task_for_runtime(db, task.id)
        if not task_row:
            return {"ok": False, "error": "missing_task"}
        ep = await db.get(
            DramaEpisode,
            episode_id,
            options=[selectinload(DramaEpisode.project).selectinload(DramaProject.script)],
        )
        if not ep or not ep.project:
            raise ValueError("分集或项目不存在")
        project = ep.project
        user = await db.get(User, user_id)
        if not user:
            raise ValueError("用户不存在")
        frag = await db.get(
            DramaEpisodeFragment,
            fragment_id,
            options=[
                selectinload(DramaEpisodeFragment.asset_references).selectinload(
                    DramaFragmentAssetRef.asset
                )
            ],
        )
        if not frag or frag.episode_id != episode_id:
            raise ValueError("分镜不存在")

        if _is_episode_video_cancelled(episode_id):
            params = dict(frag.params or {})
            params.pop("generation_attempts", None)
            params["generation"] = {"status": "cancelled"}
            frag.params = params
            await db.commit()
            return {"ok": False, "cancelled": True}

        gen = frag.params.get("generation") if isinstance(frag.params, dict) else None
        persisted_attempts = int((frag.params or {}).get("generation_attempts") or 0)
        prev_attempts = persisted_attempts
        if isinstance(gen, dict):
            prev_attempts = max(prev_attempts, int(gen.get("attempts") or 0))
        max_attempts = max(1, int(get_settings().drama_fragment_max_attempts or 3))
        attempts = prev_attempts + 1 if nio_phase == "prepare" else int(payload.get("generation_attempts") or prev_attempts + 1)
        if nio_phase == "prepare" and attempts > max_attempts:
            params = dict(frag.params or {})
            params["generation"] = build_failed_generation_params(
                gen if isinstance(gen, dict) else None,
                f"分镜重试超过上限（{max_attempts} 次）",
                attempts=prev_attempts,
                attempt_limit=max_attempts,
            )
            frag.params = params
            await db.commit()
            raise RuntimeError(params["generation"]["error"])

        if nio_phase == "prepare":
            params = dict(frag.params or {})
            params["generation_attempts"] = attempts
            params["generation"] = {
                "status": "running",
                "phase": "assets",
                "attempts": attempts,
                "attempt_limit": max_attempts,
            }
            frag.params = params
            task_row.progress_percent = max(int(task_row.progress_percent or 0), 10)
            task_row.current_step_status = "preparing"
            await db.commit()

            prepared = await prepare_fragment_video_for_submit(db, user, project, frag)
            now = datetime.now(UTC)
            next_payload = dict(payload)
            next_payload["nio_phase"] = "submit"
            next_payload["generation_attempts"] = attempts
            next_payload["attempt_limit"] = max_attempts
            next_payload["prepared"] = serialize_fragment_video_prepared(prepared)
            task_row.status = "pending"
            task_row.progress_percent = 25
            task_row.current_step_status = "prepared"
            task_row.payload = next_payload
            task_row.next_action_at = now
            task_row.lease_token = None
            task_row.lease_until = None
            step = task_row.steps[0] if task_row.steps else None
            set_task_step_state(task_row, step, status="prepared", now=now)
            await append_task_event(
                db,
                task_row.id,
                event_type="task.prepared",
                status=task_row.status,
                phase=task_row.current_step_key,
                message="参考资源就绪，重新入队提交",
            )
            await db.commit()
            return {"deferred": True, "nio_phase": "submit"}

        # nio_phase == submit：仅 HTTP 注册上游，立即释放 Worker
        prepared_raw = payload.get("prepared")
        if not isinstance(prepared_raw, dict):
            prepared = await prepare_fragment_video_for_submit(db, user, project, frag)
        else:
            prepared = deserialize_fragment_video_prepared(prepared_raw)

        params = dict(frag.params or {})
        params["generation"] = {
            "status": "running",
            "phase": "submit",
            "attempts": attempts,
            "attempt_limit": max_attempts,
        }
        frag.params = params
        task_row.progress_percent = max(int(task_row.progress_percent or 0), 30)
        task_row.current_step_status = "submitting"
        await db.commit()

        provider_task_id = await submit_prepared_fragment_video(prepared, project_id=project.id)
        poll_interval = max(1.0, float(get_settings().ark_video_poll_interval or 8.0))
        now = datetime.now(UTC)
        task_row.status = "awaiting_poll"
        task_row.provider_task_id = provider_task_id
        task_row.progress_percent = 40
        task_row.current_step_status = "polling"
        task_row.next_action_at = now + timedelta(seconds=poll_interval)
        task_row.lease_token = None
        task_row.lease_until = None
        next_payload = dict(payload)
        next_payload.pop("prepared", None)
        next_payload["nio_phase"] = "poll"
        next_payload["generation_attempts"] = attempts
        next_payload["attempt_limit"] = max_attempts
        task_row.payload = next_payload
        step = task_row.steps[0] if task_row.steps else None
        set_task_step_state(task_row, step, status="polling", now=now)
        await append_task_event(
            db,
            task_row.id,
            event_type="task.registered",
            status=task_row.status,
            phase=task_row.current_step_key,
            message="已注册上游，Selector 非阻塞轮询",
            payload={"provider_task_id": provider_task_id},
        )
        await db.commit()
        return {"awaiting_poll": True, "provider_task_id": provider_task_id}


# 任务平台：轮询 awaiting_poll 的分镜视频任务。
async def poll_fragment_video_task(task_id: int) -> None:
    from app.services.ark import get_ark
    from app.services.tasks.executor import _complete_task, _fail_task
    from app.services.tasks.service import activate_next_sequential_task, get_task_for_runtime

    async with AsyncSessionLocal() as db:
        task = await get_task_for_runtime(db, task_id)
        if not task or task.status != "awaiting_poll" or not task.provider_task_id:
            return
        payload = task.payload if isinstance(task.payload, dict) else {}
        fragment_ids = payload.get("fragment_ids") or []
        fragment_id = int(task.fragment_id or (fragment_ids[0] if fragment_ids else 0))
        episode_id = int(task.episode_id or payload.get("episode_id") or 0)
        user_id = int(task.requested_by)
        attempts = int(payload.get("generation_attempts") or 1)
        attempt_limit = int(payload.get("attempt_limit") or get_settings().drama_fragment_max_attempts or 3)
        poll_interval = max(1.0, float(get_settings().ark_video_poll_interval or 8.0))
        now = datetime.now(UTC)

        if task.cancel_requested or _is_episode_video_cancelled(episode_id):
            await _fail_task(db, task, RuntimeError("任务已取消"))
            return

        # 分镜已删/重建：直接作废，勿继续轮询或写回（用户应按当前分镜重新生成）
        frag_probe = await db.get(DramaEpisodeFragment, fragment_id) if fragment_id > 0 else None
        if fragment_id <= 0 or frag_probe is None:
            await _fail_task(db, task, RuntimeError("分镜已变更，请重新生成"))
            return

        result = await get_ark().fetch_task_once(task.provider_task_id)
        if result.status == "running":
            task.next_action_at = now + timedelta(seconds=poll_interval)
            task.progress_percent = min(95, int(task.progress_percent or 40) + 3)
            task.current_step_status = "polling"
            await db.commit()
            return
        if result.status != "succeeded":
            frag = await db.get(DramaEpisodeFragment, fragment_id)
            if frag:
                params = dict(frag.params or {})
                prev_gen = params.get("generation") if isinstance(params.get("generation"), dict) else None
                params["generation"] = build_failed_generation_params(
                    prev_gen if isinstance(prev_gen, dict) else None,
                    str(result.error or "上游生成失败"),
                    attempts=attempts,
                    attempt_limit=attempt_limit,
                )
                frag.params = params
            await _fail_task(db, task, RuntimeError(result.error or "上游生成失败"))
            return

        ep = await db.get(DramaEpisode, episode_id, options=[selectinload(DramaEpisode.project)])
        user = await db.get(User, user_id)
        frag = await db.get(DramaEpisodeFragment, fragment_id)
        if not ep or not ep.project or not user or not frag:
            await _fail_task(db, task, RuntimeError("分镜已变更，请重新生成"))
            return

        task.current_step_status = "finalizing"
        task.progress_percent = max(int(task.progress_percent or 0), 90)
        await db.commit()

        local_video, local_last_frame = await get_ark().save_video_assets_from_result(
            result,
            project_id=ep.project.id,
            shot_no=fragment_id,
        )
        await apply_fragment_video_assets(
            db,
            user,
            ep.project,
            frag,
            local_video=local_video,
            local_last_frame=local_last_frame,
            attempts=attempts,
            attempt_limit=attempt_limit,
        )
        batch_index = int(payload.get("batch_index", 0))
        await activate_next_sequential_task(db, task.batch_key, batch_index)
        task.progress_percent = 100
        await _complete_task(db, task, {"ok": True, "fragment_id": fragment_id})


async def run_episode_generate_job(
    episode_id: int,
    user_id: int,
    fragment_ids: list[int],
) -> dict[str, Any]:
    # 校验分集后，按 Seedance 并发上限并行生成各分镜
    _clear_episode_video_cancelled(episode_id)
    logger.info(
        "开始生成分集视频 episode_id=%s fragments=%s",
        episode_id,
        len(fragment_ids),
    )
    async with AsyncSessionLocal() as db:
        ep = await db.get(
            DramaEpisode,
            episode_id,
            options=[
                selectinload(DramaEpisode.project).selectinload(DramaProject.script),
            ],
        )
        if not ep:
            logger.warning("分集视频失败：分集不存在 episode_id=%s", episode_id)
            return {"ok": False, "error": "missing_episode"}
        project = ep.project
        user = await db.get(User, user_id)
        if not project or not user:
            return {"ok": False, "error": "missing_project_or_user"}

        # valid_ids 属于本集且存在的分镜（保持入队顺序）
        valid_ids: list[int] = []
        for fid in fragment_ids:
            frag = await db.get(DramaEpisodeFragment, fid)
            if frag and frag.episode_id == episode_id:
                valid_ids.append(fid)
        link = project_link_last_frame_enabled(project)

    if link:
        # 旧版整集任务也按镜序，避免并行丢掉尾帧
        logger.info(
            "分集视频串行衔接 episode_id=%s fragments=%s",
            episode_id,
            len(valid_ids),
        )
        await _run_fragment_chain_inprocess(episode_id, user_id, valid_ids)
        _clear_episode_video_cancelled(episode_id)
        return {"ok": True, "episode_id": episode_id}

    # 未开启衔接时按 Seedance 并发上限并行
    limit = max(1, int(get_settings().pipeline_video_concurrency or 10))
    sem = asyncio.Semaphore(limit)
    logger.info(
        "分集视频并发 episode_id=%s concurrency=%s fragments=%s",
        episode_id,
        limit,
        len(valid_ids),
    )
    results = await asyncio.gather(
        *[
            _generate_one_fragment_video(
                episode_id=episode_id,
                user_id=user_id,
                fragment_id=fid,
                sem=sem,
            )
            for fid in valid_ids
        ]
    )
    ok_count = sum(1 for ok in results if ok)
    fail_count = len(results) - ok_count
    _clear_episode_video_cancelled(episode_id)
    logger.info(
        "分集视频结束 episode_id=%s ok=%s fail=%s",
        episode_id,
        ok_count,
        fail_count,
    )
    return {"ok": True, "episode_id": episode_id}


# ---------- asset image ----------


def dispatch_asset_image_job(
    project_id: int,
    user_id: int,
    prompt: str,
    asset_id: int | None = None,
    name: str | None = None,
    kind: str = "character",
    *,
    image_style_id: str | None = None,
    model_id: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
) -> str:
    """Enqueue asset image generation. Caller marks asset generating when possible."""
    key = _job_key("img", asset_id or project_id)
    if key in _running and not _running[key].done():
        logger.info("dispatch 资产生图 → 进程内已在跑 asset_id=%s", asset_id)
        return "in-process"
    _running[key] = asyncio.create_task(
        run_asset_image_job(
            project_id,
            user_id,
            prompt,
            asset_id,
            name,
            kind,
            image_style_id=image_style_id,
            model_id=model_id,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
        )
    )
    logger.info(
        "dispatch 资产生图 → 进程内新建 project_id=%s asset_id=%s kind=%s",
        project_id,
        asset_id,
        kind,
    )
    return "in-process"


async def run_asset_image_job(
    project_id: int,
    user_id: int,
    prompt: str,
    asset_id: int | None = None,
    name: str | None = None,
    kind: str = "character",
    *,
    image_style_id: str | None = None,
    model_id: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
) -> dict[str, Any]:
    logger.info(
        "开始资产生图 project_id=%s asset_id=%s kind=%s name=%s style=%s model=%s",
        project_id,
        asset_id,
        kind,
        name,
        image_style_id,
        model_id,
    )
    async with AsyncSessionLocal() as db:
        project = (
            await db.execute(
                select(DramaProject)
                .where(DramaProject.id == project_id)
                .options(selectinload(DramaProject.script))
            )
        ).scalar_one_or_none()
        user = await db.get(User, user_id)
        if not project or not user:
            return {"ok": False, "error": "missing"}
        asset = None
        if asset_id:
            asset = await db.get(DramaAsset, asset_id)
            if not asset or asset.project_id != project_id:
                return {"ok": False, "error": "asset_not_found"}
        try:
            resolved_prompt = prompt
            if asset:
                resolved_prompt = await resolve_visual_prompt_for_asset(asset, project, prompt)
                params = dict(asset.params or {})
                params["visualPrompt"] = resolved_prompt
                if not str(params.get("visualImage") or "").strip():
                    params["visualImage"] = resolved_prompt
                asset.params = params
                await db.commit()
                await db.refresh(asset)
                logger.info(
                    "资产生图提示词已解析 project_id=%s asset_id=%s len=%s",
                    project_id,
                    asset_id,
                    len(resolved_prompt),
                )
            asset = await generate_asset_image(
                db,
                user,
                project,
                resolved_prompt,
                asset=asset,
                name=name,
                kind=kind,
                image_style_id=image_style_id,
                model_id=model_id,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
            )
            params = dict(asset.params or {})
            gen = dict(params.get("generation") or {})
            gen["status"] = "done"
            params["generation"] = gen
            asset.params = params
            await db.commit()
            logger.info(
                "资产生图完成 project_id=%s asset_id=%s url=%s",
                project_id,
                asset.id,
                (asset.url or asset.cover or "")[:80],
            )
            return {"ok": True, "asset_id": asset.id}
        except Exception as exc:  # noqa: BLE001
            if asset_id:
                asset = await db.get(DramaAsset, asset_id)
                if asset:
                    params = dict(asset.params or {})
                    params["generation"] = {"status": "failed", "error": str(exc)[:400]}
                    asset.params = params
                    await db.commit()
            logger.exception(
                "资产生图失败 project_id=%s asset_id=%s err=%s",
                project_id,
                asset_id,
                exc,
            )
            return {"ok": False, "error": str(exc)[:500]}


# ---------- asset video ----------


def dispatch_asset_video_job(
    project_id: int,
    user_id: int,
    prompt: str,
    asset_id: int,
    *,
    model_id: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
    duration_sec: int | None = None,
    image_style_id: str | None = None,
    reference_asset_ids: list[int] | None = None,
) -> str:
    """Start one in-process asset-video generation task."""
    key = _job_key("vid", asset_id)
    if key in _running and not _running[key].done():
        logger.info("dispatch 资产生视频 → 进程内已在跑 asset_id=%s", asset_id)
        return "in-process"
    _running[key] = asyncio.create_task(
        run_asset_video_job(
            project_id,
            user_id,
            prompt,
            asset_id,
            model_id=model_id,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_sec=duration_sec,
            image_style_id=image_style_id,
            reference_asset_ids=reference_asset_ids or [],
        )
    )
    logger.info(
        "dispatch 资产生视频 → 进程内新建 project_id=%s asset_id=%s",
        project_id,
        asset_id,
    )
    return "in-process"


async def run_asset_video_job(
    project_id: int,
    user_id: int,
    prompt: str,
    asset_id: int,
    *,
    model_id: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
    duration_sec: int | None = None,
    image_style_id: str | None = None,
    reference_asset_ids: list[int] | None = None,
) -> dict[str, Any]:
    logger.info(
        "开始资产生视频 project_id=%s asset_id=%s model=%s duration=%s",
        project_id,
        asset_id,
        model_id,
        duration_sec,
    )
    async with AsyncSessionLocal() as db:
        project = (
            await db.execute(
                select(DramaProject)
                .where(DramaProject.id == project_id)
                .options(selectinload(DramaProject.script))
            )
        ).scalar_one_or_none()
        user = await db.get(User, user_id)
        asset = await db.get(DramaAsset, asset_id)
        if not project or not user:
            return {"ok": False, "error": "missing"}
        if not asset or asset.project_id != project_id:
            return {"ok": False, "error": "asset_not_found"}
        try:
            params = dict(asset.params or {})
            params["visualPrompt"] = (prompt or "").strip()
            asset.params = params
            await db.commit()
            await db.refresh(asset)
            asset = await generate_asset_video(
                db,
                user,
                project,
                asset,
                prompt,
                model_id=model_id,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                duration_sec=duration_sec,
                image_style_id=image_style_id,
                reference_asset_ids=reference_asset_ids,
            )
            logger.info(
                "资产生视频完成 project_id=%s asset_id=%s url=%s",
                project_id,
                asset.id,
                (asset.url or "")[:80],
            )
            return {"ok": True, "asset_id": asset.id}
        except Exception as exc:  # noqa: BLE001
            asset = await db.get(DramaAsset, asset_id)
            if asset:
                params = dict(asset.params or {})
                params["generation"] = {"status": "failed", "error": str(exc)[:400]}
                if (prompt or "").strip():
                    params["visualPrompt"] = prompt.strip()
                asset.params = params
                await db.commit()
            logger.exception(
                "资产生视频失败 project_id=%s asset_id=%s err=%s",
                project_id,
                asset_id,
                exc,
            )
            return {"ok": False, "error": str(exc)[:500]}


# ---------- seed assets from script ----------


async def run_seed_assets_job(
    project_id: int,
    *,
    refresh_prompts: bool = False,
    reextract_props: bool = False,
) -> dict[str, Any]:
    """从剧本抽取/刷新资产（含 LLM 提示词刷新）。"""
    from app.services.drama.seed import seed_assets_from_script

    logger.info(
        "开始抽取漫剧资产 project_id=%s refresh=%s reextract=%s",
        project_id,
        refresh_prompts,
        reextract_props,
    )
    async with AsyncSessionLocal() as db:
        project = await db.get(
            DramaProject,
            project_id,
            options=[selectinload(DramaProject.script)],
        )
        if not project:
            return {"ok": False, "error": "project_not_found"}
        params = dict(project.params or {}) if isinstance(project.params, dict) else {}
        try:
            result = await seed_assets_from_script(
                db,
                project,
                refresh_prompts=refresh_prompts,
                reextract_props=reextract_props,
            )
            params["assets_seed_status"] = "done"
            params.pop("assets_seed_error", None)
            params.pop("assets_seed_generating_at", None)
            params["assets_seed_created"] = result.created_count
            params["assets_seed_refreshed"] = result.prompts_refreshed
            params["assets_seed_props_updated"] = result.props_updated
            if result.llm_errors:
                params["assets_seed_llm_errors"] = result.llm_errors[:20]
            else:
                params.pop("assets_seed_llm_errors", None)
            project.params = params
            await db.commit()
            return {
                "ok": True,
                "created_count": result.created_count,
                "prompts_refreshed": result.prompts_refreshed,
                "props_updated": result.props_updated,
                "llm_errors": result.llm_errors,
            }
        except Exception as exc:  # noqa: BLE001
            params["assets_seed_status"] = "failed"
            params["assets_seed_error"] = str(exc)[:500]
            params.pop("assets_seed_generating_at", None)
            project.params = params
            await db.commit()
            logger.exception("抽取漫剧资产失败 project_id=%s", project_id)
            return {"ok": False, "error": str(exc)[:500]}


def dispatch_seed_assets_job(
    project_id: int,
    *,
    refresh_prompts: bool = False,
    reextract_props: bool = False,
) -> str:
    """Start one in-process seed-assets task."""
    key = _job_key("seed_assets", project_id)
    if key in _running and not _running[key].done():
        logger.info("dispatch 抽取资产 → 进程内已在跑 project_id=%s", project_id)
        return "in-process"
    _running[key] = asyncio.create_task(
        run_seed_assets_job(
            project_id,
            refresh_prompts=refresh_prompts,
            reextract_props=reextract_props,
        )
    )
    logger.info("dispatch 抽取资产 → 进程内新建 project_id=%s", project_id)
    return "in-process"
