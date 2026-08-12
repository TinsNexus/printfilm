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
from app.services.drama.generation import generate_asset_image, generate_fragment_video
from app.services.drama.visual_prompt import resolve_visual_prompt_for_asset

logger = logging.getLogger(__name__)

# in-process fallback handles
_running: dict[str, asyncio.Task] = {}


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


# ---------- episode video ----------


def dispatch_episode_generate_job(
    episode_id: int,
    user_id: int,
    fragment_ids: list[int],
) -> str:
    if _use_celery():
        from app.workers.drama_tasks import drama_episode_generate_task

        result = drama_episode_generate_task.apply_async(
            args=[episode_id, user_id, fragment_ids],
            queue="pipeline",
        )
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


async def run_episode_generate_job(
    episode_id: int,
    user_id: int,
    fragment_ids: list[int],
) -> dict[str, Any]:
    logger.info(
        "开始生成分集视频 episode_id=%s fragments=%s",
        episode_id,
        len(fragment_ids),
    )
    async with AsyncSessionLocal() as db:
        ep = await db.get(
            DramaEpisode,
            episode_id,
            options=[selectinload(DramaEpisode.project)],
        )
        if not ep:
            logger.warning("分集视频失败：分集不存在 episode_id=%s", episode_id)
            return {"ok": False, "error": "missing_episode"}
        project = ep.project
        user = await db.get(User, user_id)
        if not project or not user:
            return {"ok": False, "error": "missing_project_or_user"}

        ok_count = 0
        fail_count = 0
        for fid in fragment_ids:
            frag = await db.get(
                DramaEpisodeFragment,
                fid,
                options=[
                    selectinload(DramaEpisodeFragment.asset_references).selectinload(
                        DramaFragmentAssetRef.asset
                    )
                ],
            )
            if not frag or frag.episode_id != episode_id:
                continue
            params = dict(frag.params or {})
            params["generation"] = {"status": "running"}
            frag.params = params
            await db.commit()
            try:
                logger.info("生成分镜视频 fragment_id=%s episode_id=%s", fid, episode_id)
                await generate_fragment_video(db, user, project, frag)
                await db.refresh(frag)
                params = dict(frag.params or {})
                params["generation"] = {
                    "status": "done",
                    "video": frag.video,
                    "cover": frag.cover,
                }
                frag.params = params
                await db.commit()
                ok_count += 1
            except Exception as exc:  # noqa: BLE001
                fail_count += 1
                params = dict(frag.params or {})
                params["generation"] = {"status": "failed", "error": str(exc)[:500]}
                frag.params = params
                await db.commit()
                logger.exception("分镜视频失败 fragment_id=%s", fid)
                continue
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
