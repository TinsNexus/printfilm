import asyncio
import io
import json
import re
import zipfile
from datetime import datetime

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

from app.database import get_db
from app.deps import get_current_user
from app.models import Project, ProjectStatus, Shot, User, Work
from app.schemas import (
    ContentExpandOut,
    ContentExpandRequest,
    PageMeta,
    ProjectCreate,
    ProjectDownloadRequest,
    ProjectListItem,
    ProjectListOut,
    ProjectListStats,
    ProjectOut,
    ProjectUpdate,
    ShotOut,
    ShotUpdate,
    VoicePreviewOut,
    VoicePreviewRequest,
    WorkOut,
)
from app.services import pipeline, storage
from app.services.ark import get_ark
from app.services.progress import redis_bridge, subscribe, unsubscribe
from app.services.voices import ensure_voice_preview, list_voices

router = APIRouter(tags=["projects"])


@router.get("/voices")
async def get_voices() -> list[dict]:
    return list_voices()


@router.post("/voices/preview", response_model=VoicePreviewOut)
async def preview_voice(
    body: VoicePreviewRequest,
    user: User = Depends(get_current_user),
) -> VoicePreviewOut:
    """Generate a short cached TTS sample for audition."""
    _ = user
    try:
        url = await ensure_voice_preview(body.voice_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"试听生成失败：{exc}") from exc
    return VoicePreviewOut(url=url, voice_id=body.voice_id)


@router.post("/content/expand", response_model=ContentExpandOut)
async def expand_content(
    body: ContentExpandRequest,
    user: User = Depends(get_current_user),
) -> ContentExpandOut:
    """AI-expand a short topic into a project title + theme brief or full script."""
    _ = user
    try:
        result = await get_ark().expand_content(body.topic, body.mode)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"AI 生成失败：{exc}") from exc
    return ContentExpandOut(title=result["title"], content=result["content"])


async def _get_owned_project(db: AsyncSession, project_id: int, user: User) -> Project:
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.user_id == user.id)
        .options(selectinload(Project.shots))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


def _ensure_side_task_allowed(project: Project) -> None:
    """重绘/重生/合成侧任务：流水线进行中时拒绝，避免与 Celery pipeline 冲突。"""
    running = {
        ProjectStatus.SCRIPTING,
        ProjectStatus.IMAGING,
        ProjectStatus.VIDEOING,
        ProjectStatus.AUDIOING,
        ProjectStatus.COMPOSING,
        ProjectStatus.AUDITING,
    }
    if project.status in running:
        raise HTTPException(status_code=409, detail="生成进行中，请稍后")


@router.post("/projects", response_model=ProjectOut)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    from app.models import Template

    from app.services.style_lock import template_prompt_defaults

    tpl = await db.get(Template, body.template_id)
    if not tpl or not tpl.is_active:
        raise HTTPException(status_code=400, detail="无效模板")
    defaults = template_prompt_defaults(tpl)
    project = Project(
        user_id=user.id,
        template_id=body.template_id,
        title=body.title,
        source_type=body.source_type,
        source_text=body.source_text,
        resolution_mode=body.resolution_mode,
        pipeline_mode=body.pipeline_mode,
        output_ratio=(body.output_ratio or "").strip(),
        voice_id=(body.voice_id or "").strip(),
        # API 可省略；省略时从模板灌入，避免侧栏「内置提示词」全空
        style_prompt=(body.style_prompt or "").strip() or defaults["style_prompt"],
        character_prompt=(body.character_prompt or "").strip() or defaults["character_prompt"],
        extra_prompt=(body.extra_prompt or "").strip() or defaults["extra_prompt"],
        ref_image_url=body.ref_image_url,
        status=ProjectStatus.DRAFT,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    result = await db.execute(
        select(Project).where(Project.id == project.id).options(selectinload(Project.shots))
    )
    return result.scalar_one()


_RUNNING_STATUSES = {
    ProjectStatus.SCRIPTING,
    ProjectStatus.IMAGING,
    ProjectStatus.VIDEOING,
    ProjectStatus.AUDIOING,
    ProjectStatus.COMPOSING,
    ProjectStatus.AUDITING,
}


@router.get("/projects", response_model=ProjectListOut)
async def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(8, ge=1, le=50),
    status: str | None = Query(
        None,
        description="all|draft|running|done|published",
    ),
    q: str | None = Query(None, description="title search"),
    pipeline_mode: str | None = Query(
        None,
        description="full|image_text；空=全部类型",
    ),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectListOut:
    """Paginated project list with status / published / type filters."""
    published_exists = (
        select(Work.id)
        .where(Work.project_id == Project.id, Work.user_id == user.id)
        .correlate(Project)
        .exists()
    )

    base = select(Project).where(Project.user_id == user.id)
    count_base = select(func.count()).select_from(Project).where(Project.user_id == user.id)

    mode = (pipeline_mode or "").strip().lower()
    if mode in {"full", "image_text"}:
        base = base.where(Project.pipeline_mode == mode)
        count_base = count_base.where(Project.pipeline_mode == mode)

    keyword = (q or "").strip()
    if keyword:
        like = f"%{keyword}%"
        filt = or_(Project.title.ilike(like), Project.error_msg.ilike(like))
        base = base.where(filt)
        count_base = count_base.where(filt)

    tab = (status or "all").strip().lower()
    if tab == "draft":
        base = base.where(Project.status == ProjectStatus.DRAFT)
        count_base = count_base.where(Project.status == ProjectStatus.DRAFT)
    elif tab == "running":
        base = base.where(Project.status.in_(_RUNNING_STATUSES))
        count_base = count_base.where(Project.status.in_(_RUNNING_STATUSES))
    elif tab == "done":
        base = base.where(Project.status == ProjectStatus.DONE)
        count_base = count_base.where(Project.status == ProjectStatus.DONE)
    elif tab == "published":
        base = base.where(published_exists)
        count_base = count_base.where(published_exists)

    total = int((await db.execute(count_base)).scalar_one() or 0)
    rows = list(
        (
            await db.execute(
                base.order_by(Project.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )

    published_ids: set[int] = set()
    if rows:
        pub_result = await db.execute(
            select(Work.project_id).where(
                Work.user_id == user.id,
                Work.project_id.in_([p.id for p in rows]),
            )
        )
        published_ids = {int(x) for x in pub_result.scalars().all()}

    items = [
        ProjectListItem(
            id=p.id,
            title=p.title,
            template_id=p.template_id,
            status=p.status,
            progress=int(p.progress or 0),
            cover_url=p.cover_url,
            final_video_url=p.final_video_url,
            error_msg=p.error_msg,
            pipeline_mode=p.pipeline_mode or "full",
            output_ratio=p.output_ratio or "",
            published=p.id in published_ids,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in rows
    ]

    # Stats ignore status tab but keep type + search scope
    stats_filter = [Project.user_id == user.id]
    if mode in {"full", "image_text"}:
        stats_filter.append(Project.pipeline_mode == mode)
    if keyword:
        like = f"%{keyword}%"
        stats_filter.append(or_(Project.title.ilike(like), Project.error_msg.ilike(like)))

    async def _count(*extra):
        stmt = select(func.count()).select_from(Project).where(*stats_filter, *extra)
        return int((await db.execute(stmt)).scalar_one() or 0)

    stats_total = await _count()
    stats_generating = await _count(Project.status.in_(_RUNNING_STATUSES))
    stats_done = await _count(Project.status == ProjectStatus.DONE)
    pub_stmt = (
        select(func.count())
        .select_from(Work)
        .join(Project, Project.id == Work.project_id)
        .where(Work.user_id == user.id, *stats_filter)
    )
    stats_published = int((await db.execute(pub_stmt)).scalar_one() or 0)
    stats = ProjectListStats(
        total=stats_total,
        generating=stats_generating,
        done=stats_done,
        published=stats_published,
    )

    return ProjectListOut(
        items=items,
        meta=PageMeta(page=page, page_size=page_size, total=total),
        stats=stats,
    )


def _safe_zip_name(title: str, project_id: int) -> str:
    raw = (title or "未命名作品").strip() or "未命名作品"
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "_", raw)
    cleaned = cleaned.strip(" .")[:60] or "未命名作品"
    return f"p{project_id}_{cleaned}.mp4"


@router.post("/projects/download-zip")
async def download_projects_zip(
    body: ProjectDownloadRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Zip final videos for selected owned projects (DONE with final_video_url)."""
    ids = list(dict.fromkeys(int(i) for i in body.ids if int(i) > 0))
    if not ids:
        raise HTTPException(status_code=400, detail="请选择要下载的作品")
    if len(ids) > 50:
        raise HTTPException(status_code=400, detail="一次最多打包 50 个")

    result = await db.execute(
        select(Project).where(Project.user_id == user.id, Project.id.in_(ids))
    )
    projects = list(result.scalars().all())
    by_id = {p.id: p for p in projects}
    missing = [i for i in ids if i not in by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"项目不存在: {missing[:5]}")

    entries: list[tuple[str, bytes]] = []
    skipped: list[str] = []
    for pid in ids:
        p = by_id[pid]
        if p.status != ProjectStatus.DONE or not p.final_video_url:
            skipped.append(f"#{pid}")
            continue
        path = storage.local_path_from_url(p.final_video_url)
        try:
            if (not path or not path.exists()) and str(p.final_video_url).startswith("http"):
                dest = storage.project_dir(p.id) / "final.mp4"
                path = await storage.ensure_local_media(p.final_video_url, dest)
        except Exception:  # noqa: BLE001
            path = None
        if not path or not path.exists():
            skipped.append(f"#{pid}")
            continue
        entries.append((_safe_zip_name(p.title, p.id), path.read_bytes()))

    if not entries:
        raise HTTPException(
            status_code=400,
            detail="所选作品暂无成片可下载（需状态为已完成）",
        )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        used: set[str] = set()
        for name, data in entries:
            final_name = name
            n = 1
            while final_name in used:
                stem = name.rsplit(".", 1)[0]
                final_name = f"{stem}_{n}.mp4"
                n += 1
            used.add(final_name)
            zf.writestr(final_name, data)
        if skipped:
            zf.writestr(
                "skipped.txt",
                "以下项目未打包（未完成或缺少成片文件）：\n" + "\n".join(skipped),
            )
    buf.seek(0)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"framecut_videos_{stamp}.zip"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


@router.get("/projects/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    return await _get_owned_project(db, project_id, user)


@router.patch("/projects/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: int,
    body: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    project = await _get_owned_project(db, project_id, user)
    if project.status in {
        ProjectStatus.SCRIPTING,
        ProjectStatus.IMAGING,
        ProjectStatus.VIDEOING,
        ProjectStatus.AUDIOING,
        ProjectStatus.COMPOSING,
        ProjectStatus.AUDITING,
    }:
        raise HTTPException(status_code=409, detail="生成进行中，无法修改")

    data = body.model_dump(exclude_unset=True)
    if "template_id" in data:
        from app.models import Template

        from app.services.style_lock import template_prompt_defaults

        tpl = await db.get(Template, data["template_id"])
        if not tpl or not tpl.is_active:
            raise HTTPException(status_code=400, detail="无效模板")
        # 仅改模板时同步内置提示词；若请求已显式带 style/character/extra 则尊重客户端
        defaults = template_prompt_defaults(tpl)
        if "style_prompt" not in data:
            data["style_prompt"] = defaults["style_prompt"]
        if "character_prompt" not in data:
            data["character_prompt"] = defaults["character_prompt"]
        if "extra_prompt" not in data:
            data["extra_prompt"] = defaults["extra_prompt"]
    if "cover_url" in data and data["cover_url"]:
        url = str(data["cover_url"]).strip()
        if not (url.startswith("/static/") or url.startswith("http://") or url.startswith("https://")):
            raise HTTPException(status_code=400, detail="无效封面地址")
    for k, v in data.items():
        setattr(project, k, v)
    await db.commit()
    return await _get_owned_project(db, project_id, user)


@router.post("/projects/{project_id}/cover", response_model=ProjectOut)
async def upload_project_cover(
    project_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    """Upload a custom cover image for the project."""
    project = await _get_owned_project(db, project_id, user)
    if project.status in {
        ProjectStatus.SCRIPTING,
        ProjectStatus.IMAGING,
        ProjectStatus.VIDEOING,
        ProjectStatus.AUDIOING,
        ProjectStatus.COMPOSING,
        ProjectStatus.AUDITING,
    }:
        raise HTTPException(status_code=409, detail="生成进行中，无法更换封面")

    content_type = (file.content_type or "").lower()
    allowed = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    ext = allowed.get(content_type)
    if not ext:
        # Fallback from filename
        suffix = Path(file.filename or "").suffix.lower()
        if suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
            ext = ".jpg" if suffix == ".jpeg" else suffix
        else:
            raise HTTPException(status_code=400, detail="仅支持 JPG / PNG / WebP / GIF")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="空文件")
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="封面不能超过 8MB")

    dest = storage.project_dir(project_id) / f"cover{ext}"
    dest.write_bytes(raw)
    project.cover_url = storage.publish_local(dest)
    await db.commit()
    return await _get_owned_project(db, project_id, user)


@router.post("/projects/{project_id}/generate", response_model=ProjectOut)
async def generate_project(
    project_id: int,
    restart: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    """Start or resume the pipeline.

    - First run / restart: script stage only, then pauses at SCRIPT_READY for review.
    - Continue from SCRIPT_READY+: skip script, run assets → videos → compose.
    - restart=true: wipe shots/media and regenerate storyboard from scratch.
    """
    project = await _get_owned_project(db, project_id, user)
    if project.status in {
        ProjectStatus.SCRIPTING,
        ProjectStatus.IMAGING,
        ProjectStatus.VIDEOING,
        ProjectStatus.AUDIOING,
        ProjectStatus.COMPOSING,
        ProjectStatus.AUDITING,
    }:
        raise HTTPException(status_code=409, detail="生成进行中，请稍后")

    if restart:
        for shot in list(project.shots):
            await db.delete(shot)
        await db.flush()
        await pipeline.delete_project_assets(project_id)
        project.cover_url = None

    # Resume: clear error, keep existing shots/media (pipeline skips finished stages)
    project.error_msg = None
    project.final_video_url = None
    shots = list(project.shots or [])
    phase = "script" if (restart or not shots) else "produce"
    try:
        from app.services import billing as billing_svc

        await billing_svc.freeze_for_project(db, user, project, phase)
    except ValueError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc

    if restart or not shots:
        # First run / restart — actually splitting storyboard
        project.status = ProjectStatus.SCRIPTING
        project.progress = 1
    else:
        # Continue: label the real next stage so UI never shows「拆分镜中」
        image_text = (project.pipeline_mode or "full") == "image_text"
        has_images = all(bool(s.image_url or s.image_ark_url) for s in shots)
        has_audio = all(bool(s.audio_url) for s in shots)
        has_videos = all(bool(s.video_url) for s in shots)
        if not has_images or not has_audio:
            project.status = ProjectStatus.IMAGING
            project.progress = max(project.progress or 0, 18)
        elif not image_text and not has_videos:
            project.status = ProjectStatus.VIDEOING
            project.progress = max(project.progress or 0, 55)
        else:
            project.status = ProjectStatus.COMPOSING
            project.progress = max(project.progress or 0, 88)
    await db.commit()
    task_id = pipeline.start_pipeline(project_id)
    # Persist celery id on a job row when available
    if task_id and task_id != "in-process":
        from app.models import PipelineJob

        db.add(PipelineJob(project_id=project_id, stage="DISPATCH", progress=1, celery_task_id=task_id))
        await db.commit()
    return await _get_owned_project(db, project_id, user)


@router.post("/projects/{project_id}/cancel", response_model=ProjectOut)
async def cancel_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    project = await _get_owned_project(db, project_id, user)
    running = {
        ProjectStatus.SCRIPTING,
        ProjectStatus.IMAGING,
        ProjectStatus.VIDEOING,
        ProjectStatus.AUDIOING,
        ProjectStatus.COMPOSING,
        ProjectStatus.AUDITING,
    }
    if project.status not in running:
        raise HTTPException(status_code=400, detail="当前状态不可取消")

    pipeline.cancel_pipeline(project_id)
    project.status = ProjectStatus.CANCELLED
    project.error_msg = "用户取消"
    await db.commit()
    return await _get_owned_project(db, project_id, user)


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    project = await _get_owned_project(db, project_id, user)
    running = {
        ProjectStatus.SCRIPTING,
        ProjectStatus.IMAGING,
        ProjectStatus.VIDEOING,
        ProjectStatus.AUDIOING,
        ProjectStatus.COMPOSING,
        ProjectStatus.AUDITING,
    }
    if project.status in running:
        pipeline.cancel_pipeline(project_id)

    # Remove published work if any
    work_result = await db.execute(select(Work).where(Work.project_id == project.id))
    work = work_result.scalar_one_or_none()
    if work:
        await db.delete(work)

    await pipeline.delete_project_assets(project_id)
    await db.delete(project)
    await db.commit()
    return {"ok": True, "id": project_id}


@router.get("/projects/{project_id}/events")
async def project_events(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_owned_project(db, project_id, user)
    queue = subscribe(project_id)
    bridge = asyncio.create_task(redis_bridge(project_id, queue))

    async def event_generator():
        try:
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield {"event": "message", "data": json.dumps(payload, ensure_ascii=False)}
                    if payload.get("event") in {"done", "failed"}:
                        break
                except TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            bridge.cancel()
            unsubscribe(project_id, queue)

    return EventSourceResponse(event_generator())


@router.patch("/projects/{project_id}/shots/{shot_id}", response_model=ShotOut)
async def update_shot(
    project_id: int,
    shot_id: int,
    body: ShotUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Shot:
    from app.models import Template
    from app.services.pipeline import clamp_shot_duration

    project = await _get_owned_project(db, project_id, user)
    shot = next((s for s in project.shots if s.id == shot_id), None)
    if not shot:
        raise HTTPException(status_code=404, detail="分镜不存在")
    data = body.model_dump(exclude_unset=True)
    if "segment_script" in data and data["segment_script"] is not None:
        from app.services.seedance_segments import (
            apply_segment_script_edit,
            replace_first_visual_in_script,
            replace_narration_in_script,
        )

        bgm = (getattr(project, "bgm_lock", None) or shot.bgm_mood or "").strip()
        script = str(data["segment_script"])
        # 弹窗旁白/首帧优先写回脚本，避免保存时被旧脚本盖掉
        if "narration" in data and data["narration"] is not None:
            script = replace_narration_in_script(script, str(data["narration"]))
        if "img_prompt" in data and data["img_prompt"] is not None:
            script = replace_first_visual_in_script(script, str(data["img_prompt"]))
        normalized = apply_segment_script_edit(script, bgm_mood=bgm)
        data["segment_script"] = normalized["segment_script"]
        data["duration"] = normalized["duration"]
        data["video_prompt"] = normalized["video_prompt"]
        if normalized.get("narration"):
            data["narration"] = normalized["narration"]
        if normalized.get("img_prompt"):
            data["img_prompt"] = normalized["img_prompt"]
    if "duration" in data and data["duration"] is not None:
        tpl = await db.get(Template, project.template_id)
        data["duration"] = clamp_shot_duration(
            float(data["duration"]),
            pipeline_mode=project.pipeline_mode or "full",
            tpl_min=tpl.shot_duration_min if tpl else 2,
            tpl_max=tpl.shot_duration_max if tpl else 8,
        )
    for k, v in data.items():
        setattr(shot, k, v)
    # Invalidate downstream if visual prompts changed
    if "img_prompt" in data:
        shot.image_url = None
        shot.video_url = None
        shot.status = "PENDING"
        project.final_video_url = None
    elif (
        "video_prompt" in data
        or "segment_script" in data
        or "duration" in data
        or "camera" in data
    ):
        shot.video_url = None
        project.final_video_url = None
    shot.version += 1
    await db.commit()
    await db.refresh(shot)
    return shot


@router.post("/projects/{project_id}/shots/{shot_id}/regen-image", response_model=ProjectOut)
async def regen_image(
    project_id: int,
    shot_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    project = await _get_owned_project(db, project_id, user)
    _ensure_side_task_allowed(project)
    shot = next((s for s in project.shots if s.id == shot_id), None)
    if not shot:
        raise HTTPException(status_code=404, detail="分镜不存在")
    project.status = ProjectStatus.IMAGING
    project.error_msg = None
    await db.commit()
    pipeline.dispatch_regen_image(project_id, shot_id)
    return await _get_owned_project(db, project_id, user)


@router.post("/projects/{project_id}/shots/{shot_id}/regen-video", response_model=ProjectOut)
async def regen_video(
    project_id: int,
    shot_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    project = await _get_owned_project(db, project_id, user)
    _ensure_side_task_allowed(project)
    if (project.pipeline_mode or "full") == "image_text":
        raise HTTPException(status_code=400, detail="图文模式无需生成 AI 视频，请直接重新合成成片")
    shot = next((s for s in project.shots if s.id == shot_id), None)
    if not shot or not (shot.image_url or shot.image_ark_url):
        raise HTTPException(status_code=400, detail="请先生成该镜画面")
    project.status = ProjectStatus.VIDEOING
    project.error_msg = None
    await db.commit()
    pipeline.dispatch_regen_video(project_id, shot_id)
    return await _get_owned_project(db, project_id, user)


@router.post("/projects/{project_id}/shots/{shot_id}/regen-audio", response_model=ProjectOut)
async def regen_audio(
    project_id: int,
    shot_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    project = await _get_owned_project(db, project_id, user)
    _ensure_side_task_allowed(project)
    shot = next((s for s in project.shots if s.id == shot_id), None)
    if not shot:
        raise HTTPException(status_code=404, detail="分镜不存在")
    project.status = ProjectStatus.AUDIOING
    project.error_msg = None
    await db.commit()
    pipeline.dispatch_regen_audio(project_id, shot_id)
    return await _get_owned_project(db, project_id, user)


@router.post("/projects/{project_id}/regen-audio", response_model=ProjectOut)
async def regen_all_audio(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    """Re-TTS all shots with current voice_id, then recompose final video."""
    project = await _get_owned_project(db, project_id, user)
    if project.status in {
        ProjectStatus.SCRIPTING,
        ProjectStatus.IMAGING,
        ProjectStatus.VIDEOING,
        ProjectStatus.AUDIOING,
        ProjectStatus.COMPOSING,
        ProjectStatus.AUDITING,
    }:
        raise HTTPException(status_code=409, detail="生成进行中，请稍后")
    if not project.shots:
        raise HTTPException(status_code=400, detail="暂无分镜，请先生成")
    project.status = ProjectStatus.AUDIOING
    project.progress = 80
    project.error_msg = None
    project.final_video_url = None
    await db.commit()
    pipeline.dispatch_regen_project_audio_and_compose(project_id)
    return await _get_owned_project(db, project_id, user)


@router.post("/projects/{project_id}/compose", response_model=ProjectOut)
async def compose_only(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    """Recompose final video from existing images/audio/(videos)."""
    project = await _get_owned_project(db, project_id, user)
    if project.status in {
        ProjectStatus.SCRIPTING,
        ProjectStatus.IMAGING,
        ProjectStatus.VIDEOING,
        ProjectStatus.AUDIOING,
        ProjectStatus.COMPOSING,
        ProjectStatus.AUDITING,
    }:
        raise HTTPException(status_code=409, detail="生成进行中，请稍后")
    if not project.shots or not (
        any(s.image_url for s in project.shots) or any(s.video_url for s in project.shots)
    ):
        raise HTTPException(status_code=400, detail="缺少分镜图或镜头视频，无法合成")
    project.status = ProjectStatus.COMPOSING
    project.progress = 90
    project.error_msg = None
    await db.commit()
    pipeline.dispatch_compose_only(project_id)
    return await _get_owned_project(db, project_id, user)


@router.post("/projects/{project_id}/publish", response_model=WorkOut)
async def publish_work(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Work:
    project = await _get_owned_project(db, project_id, user)
    if project.status != ProjectStatus.DONE or not project.final_video_url:
        raise HTTPException(status_code=400, detail="成片未完成，无法发布")
    existing = await db.execute(select(Work).where(Work.project_id == project.id))
    work = existing.scalar_one_or_none()
    if work:
        work.title = project.title
        work.cover_url = project.cover_url
        work.video_url = project.final_video_url
    else:
        work = Work(
            project_id=project.id,
            user_id=user.id,
            title=project.title,
            cover_url=project.cover_url,
            video_url=project.final_video_url,
        )
        db.add(work)
    await db.commit()
    await db.refresh(work)
    return work


@router.get("/works", response_model=list[WorkOut])
async def list_works(db: AsyncSession = Depends(get_db)) -> list[Work]:
    result = await db.execute(
        select(Work).where(Work.visibility == "public").order_by(Work.id.desc()).limit(50)
    )
    return list(result.scalars().all())


@router.get("/quota")
async def quota(user: User = Depends(get_current_user)) -> dict:
    from app.config import get_settings

    settings = get_settings()
    return {
        "quota_left": user.quota_left,
        "quota_enabled": settings.quota_enabled,
        "unlimited": (not settings.billing_enabled) or bool(user.billing_unlimited),
        "billing_enabled": settings.billing_enabled,
        "balance_fen": int(getattr(user, "balance_fen", 0) or 0),
        "frozen_fen": int(getattr(user, "frozen_fen", 0) or 0),
        "balance_yuan": round(int(getattr(user, "balance_fen", 0) or 0) / 100, 2),
        "markup": settings.billing_markup,
    }
