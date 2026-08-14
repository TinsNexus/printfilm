"""Drama long-running jobs: Celery dispatch + in-process fallback."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import User
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
from app.services.drama.generation import generate_asset_image, generate_fragment_video
from app.services.drama.visual_prompt import resolve_visual_prompt_for_asset

logger = logging.getLogger(__name__)

# in-process fallback handles
_running: dict[str, asyncio.Task] = {}
# 分集视频取消标记（episode_id）
_video_cancelled_episodes: set[int] = set()
_episode_video_celery_ids: dict[int, str] = {}

VIDEO_CELERY_TASKS = frozenset(
    {
        "drama.episode_generate",
        "app.workers.tasks.regen_video_task",
    }
)
VIDEO_QUEUES = ("video", "pipeline")
ACTIVE_VIDEO_GEN_STATUSES = frozenset({"queued", "running", "generating"})


def _is_episode_video_cancelled(episode_id: int) -> bool:
    return int(episode_id) in _video_cancelled_episodes


def _mark_episode_video_cancelled(episode_id: int) -> None:
    _video_cancelled_episodes.add(int(episode_id))


def _clear_episode_video_cancelled(episode_id: int) -> None:
    _video_cancelled_episodes.discard(int(episode_id))


def _cancel_inprocess_episode_video(episode_id: int) -> bool:
    key = _job_key("epgen", episode_id)
    task = _running.get(key)
    if task is None or task.done():
        return False
    task.cancel()
    return True


def _revoke_celery_task_ids(task_ids: list[str]) -> int:
    if not task_ids:
        return 0
    try:
        from app.workers.celery_app import celery_app

        for tid in task_ids:
            celery_app.control.revoke(tid, terminate=True, signal="SIGTERM")
        return len(task_ids)
    except Exception:  # noqa: BLE001
        logger.exception("revoke celery video tasks failed")
        return 0


def _episode_id_from_video_celery_message(msg: dict[str, Any]) -> int | None:
    headers = msg.get("headers") or {}
    task = str(headers.get("task") or "")
    if task != "drama.episode_generate":
        return None
    body = msg.get("body")
    if not body:
        return None
    try:
        import base64
        import json

        if isinstance(body, bytes):
            body = body.decode("utf-8", errors="replace")
        raw = base64.b64decode(body)
        payload = json.loads(raw.decode("utf-8"))
        args = payload[0] if isinstance(payload, (list, tuple)) and payload else None
        if isinstance(args, (list, tuple)) and args:
            return int(args[0])
    except Exception:  # noqa: BLE001
        return None
    return None


def _purge_video_queue_messages(*, episode_id: int | None = None) -> tuple[int, list[str]]:
    """从 video/pipeline 队列移除视频任务；返回 (removed, revoked_ids)。"""
    try:
        import json

        import redis

        r = redis.Redis.from_url(get_settings().redis_url, decode_responses=True)
        total_removed = 0
        revoked_ids: list[str] = []
        for queue in VIDEO_QUEUES:
            items = r.lrange(queue, 0, -1) or []
            if not items:
                continue
            kept: list[str] = []
            queue_removed = 0
            for raw in items:
                try:
                    msg = json.loads(raw)
                except Exception:  # noqa: BLE001
                    kept.append(raw)
                    continue
                headers = msg.get("headers") or {}
                task = str(headers.get("task") or "")
                if task not in VIDEO_CELERY_TASKS:
                    kept.append(raw)
                    continue
                ep_id = _episode_id_from_video_celery_message(msg)
                if episode_id is not None and ep_id != int(episode_id):
                    kept.append(raw)
                    continue
                tid = str(headers.get("id") or "")
                if tid:
                    revoked_ids.append(tid)
                queue_removed += 1
            if queue_removed <= 0:
                continue
            pipe = r.pipeline()
            pipe.delete(queue)
            if kept:
                pipe.rpush(queue, *kept)
            pipe.execute()
            total_removed += queue_removed
        return total_removed, revoked_ids
    except Exception:  # noqa: BLE001
        logger.exception("purge video queue failed episode_id=%s", episode_id)
        return 0, []


def _collect_active_video_celery_ids(*, episode_id: int | None = None) -> list[str]:
    ids: list[str] = []
    try:
        from app.workers.celery_app import celery_app

        inspect = celery_app.control.inspect(timeout=2.0)
        for fetch in (inspect.active, inspect.reserved, inspect.scheduled):
            data = fetch() or {}
            for _worker, tasks in data.items():
                for task in tasks or []:
                    name = str(task.get("name") or task.get("request", {}).get("name") or "")
                    if name not in VIDEO_CELERY_TASKS:
                        continue
                    args = task.get("args") or task.get("request", {}).get("args") or []
                    if name == "drama.episode_generate" and episode_id is not None:
                        if not args or int(args[0]) != int(episode_id):
                            continue
                    tid = str(task.get("id") or task.get("request", {}).get("id") or "")
                    if tid:
                        ids.append(tid)
    except Exception:  # noqa: BLE001
        logger.exception("inspect active video tasks failed")
    return ids


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
    """取消单集视频任务：revoke Celery、终止进程内任务、重置分镜状态。"""
    _mark_episode_video_cancelled(episode_id)
    cancelled_inprocess = _cancel_inprocess_episode_video(episode_id)
    revoked_ids: list[str] = []
    stored = _episode_video_celery_ids.pop(int(episode_id), None)
    if stored:
        revoked_ids.append(stored)
    revoked_ids.extend(_collect_active_video_celery_ids(episode_id=episode_id))
    purged, purged_ids = _purge_video_queue_messages(episode_id=episode_id)
    revoked_ids.extend(purged_ids)
    revoked = _revoke_celery_task_ids(list(dict.fromkeys(revoked_ids)))
    async with AsyncSessionLocal() as db:
        fragments = await _reset_fragment_video_generation(db, episode_id=episode_id)
    logger.info(
        "取消分集视频 episode_id=%s inprocess=%s purged=%s revoked=%s fragments=%s",
        episode_id,
        cancelled_inprocess,
        purged,
        revoked,
        fragments,
    )
    return {
        "ok": True,
        "episode_id": episode_id,
        "inprocess": cancelled_inprocess,
        "purged": purged,
        "revoked": revoked,
        "fragments": fragments,
    }


async def cancel_all_episode_video_jobs() -> dict[str, Any]:
    """取消全部漫剧分镜视频任务。"""
    episode_ids = set(_episode_video_celery_ids.keys()) | set(_video_cancelled_episodes)
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

    revoked_ids = _collect_active_video_celery_ids()
    revoked_ids.extend(_episode_video_celery_ids.values())
    purged, purged_ids = _purge_video_queue_messages()
    revoked_ids.extend(purged_ids)
    revoked = _revoke_celery_task_ids(list(dict.fromkeys(revoked_ids)))
    _episode_video_celery_ids.clear()

    async with AsyncSessionLocal() as db:
        fragments = await _reset_fragment_video_generation(db)
    logger.info(
        "取消全部视频任务 purged=%s revoked=%s fragments=%s episodes=%s",
        purged,
        revoked,
        fragments,
        len(episode_ids),
    )
    return {
        "ok": True,
        "purged": purged,
        "revoked": revoked,
        "fragments": fragments,
        "episodes": len(episode_ids),
    }


def _redis_ok() -> bool:
    try:
        import redis

        r = redis.Redis.from_url(get_settings().redis_url, socket_connect_timeout=0.4)
        r.ping()
        return True
    except Exception:  # noqa: BLE001
        return False


def _use_celery() -> bool:
    return bool(get_settings().use_celery) and _redis_ok()


def _job_key(kind: str, entity_id: int) -> str:
    return f"{kind}:{entity_id}"


# ---------- script summary ----------


def dispatch_script_summary_job(project_id: int) -> str:
    """Enqueue script summary; returns celery / in-process id.

    Caller should mark summary_status=generating before calling.
    """
    if _use_celery():
        from app.workers.drama_tasks import drama_script_summary_task

        result = drama_script_summary_task.apply_async(args=[project_id], queue="pipeline")
        logger.info("dispatch 剧本摘要 → Celery project_id=%s task_id=%s", project_id, result.id)
        return str(result.id)

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
            script.params = params
            await db.commit()
            logger.exception("剧本摘要失败 project_id=%s err=%s", project_id, exc)
            return {"ok": False, "error": str(exc)[:500]}

        script.summary = summary
        params = dict(script.params or {})
        params["summary_text"] = format_summary_text(summary)
        params["summary_status"] = "completed"
        params["summary_error"] = None
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
    """Enqueue full episode-script generation for a project.

    Caller should mark episode_content_status=generating before calling.
    """
    if _use_celery():
        from app.workers.drama_tasks import drama_episode_scripts_task

        result = drama_episode_scripts_task.apply_async(
            args=[project_id, force],
            queue="pipeline",
        )
        logger.info(
            "dispatch 分集剧本 → Celery project_id=%s force=%s task_id=%s",
            project_id,
            force,
            result.id,
        )
        return str(result.id)

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
    # 入队单集 LLM 分镜；Celery 不可用时进程内跑
    if _use_celery():
        from app.workers.drama_tasks import drama_episode_fragment_plan_task

        result = drama_episode_fragment_plan_task.apply_async(
            args=[episode_id, fallback_rules],
            queue="pipeline",
        )
        logger.info(
            "dispatch 单集分镜 → Celery episode_id=%s task_id=%s",
            episode_id,
            result.id,
        )
        return str(result.id)

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
        ep_no = int(ep_params.get("episodeNumber") or 0) or None
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


def dispatch_episode_generate_job(
    episode_id: int,
    user_id: int,
    fragment_ids: list[int],
) -> str:
    _clear_episode_video_cancelled(episode_id)
    if _use_celery():
        from app.workers.drama_tasks import drama_episode_generate_task

        result = drama_episode_generate_task.apply_async(
            args=[episode_id, user_id, fragment_ids],
            queue="video",
        )
        _episode_video_celery_ids[int(episode_id)] = str(result.id)
        logger.info(
            "dispatch 分集视频 → Celery episode_id=%s fragments=%s task_id=%s",
            episode_id,
            len(fragment_ids),
            result.id,
        )
        return str(result.id)

    key = _job_key("epgen", episode_id)
    if key in _running and not _running[key].done():
        logger.info("dispatch 分集视频 → 进程内已在跑 episode_id=%s", episode_id)
        return "in-process"
    _running[key] = asyncio.create_task(
        run_episode_generate_job(episode_id, user_id, fragment_ids)
    )
    logger.info(
        "dispatch 分集视频 → 进程内新建 episode_id=%s fragments=%s",
        episode_id,
        len(fragment_ids),
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

            if _is_episode_video_cancelled(episode_id):
                params = dict(frag.params or {})
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
            params["generation"] = {"status": "running"}
            frag.params = params
            await db.commit()
            try:
                logger.info(
                    "生成分镜视频 fragment_id=%s episode_id=%s",
                    fragment_id,
                    episode_id,
                )
                await generate_fragment_video(db, user, project, frag)
                await db.refresh(frag)
                params = dict(frag.params or {})
                last_frame = ""
                if isinstance(frag.params, dict):
                    raw = frag.params.get("lastFrameUrl") or frag.params.get("last_frame_url")
                    if isinstance(raw, str):
                        last_frame = raw
                params["generation"] = {
                    "status": "done",
                    "video": frag.video,
                    "cover": frag.cover,
                    "lastFrameUrl": last_frame or None,
                }
                if last_frame:
                    params["lastFrameUrl"] = last_frame
                frag.params = params
                await db.commit()
                return True
            except Exception as exc:  # noqa: BLE001
                params = dict(frag.params or {})
                params["generation"] = {"status": "failed", "error": str(exc)[:500]}
                frag.params = params
                await db.commit()
                logger.exception("分镜视频失败 fragment_id=%s", fragment_id)
                return False


async def run_episode_generate_job(
    episode_id: int,
    user_id: int,
    fragment_ids: list[int],
) -> dict[str, Any]:
    # 校验分集后，按 Seedance 并发上限并行生成各分镜
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

        # valid_ids 属于本集且存在的分镜
        valid_ids: list[int] = []
        for fid in fragment_ids:
            frag = await db.get(DramaEpisodeFragment, fid)
            if frag and frag.episode_id == episode_id:
                valid_ids.append(fid)

    # limit 对齐 Seedance 官方并发（默认 10）
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
    _episode_video_celery_ids.pop(int(episode_id), None)
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
    if _use_celery():
        from app.workers.drama_tasks import drama_asset_image_task

        result = drama_asset_image_task.apply_async(
            kwargs={
                "project_id": project_id,
                "user_id": user_id,
                "prompt": prompt,
                "asset_id": asset_id,
                "name": name,
                "kind": kind,
                "image_style_id": image_style_id,
                "model_id": model_id,
                "aspect_ratio": aspect_ratio,
                "resolution": resolution,
            },
            queue="pipeline",
        )
        logger.info(
            "dispatch 资产生图 → Celery project_id=%s asset_id=%s kind=%s task_id=%s",
            project_id,
            asset_id,
            kind,
            result.id,
        )
        return str(result.id)

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
    """Enqueue canvas asset video generation. Caller marks asset generating."""
    if _use_celery():
        from app.workers.drama_tasks import drama_asset_video_task

        result = drama_asset_video_task.apply_async(
            kwargs={
                "project_id": project_id,
                "user_id": user_id,
                "prompt": prompt,
                "asset_id": asset_id,
                "model_id": model_id,
                "aspect_ratio": aspect_ratio,
                "resolution": resolution,
                "duration_sec": duration_sec,
                "image_style_id": image_style_id,
                "reference_asset_ids": reference_asset_ids or [],
            },
            queue="video",
        )
        logger.info(
            "dispatch 资产生视频 → Celery project_id=%s asset_id=%s task_id=%s",
            project_id,
            asset_id,
            result.id,
        )
        return str(result.id)

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
