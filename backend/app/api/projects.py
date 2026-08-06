import asyncio
import io
import json
import re
import zipfile
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sse_starlette.sse import EventSourceResponse

from app.database import get_db
from app.deps import get_current_user
from app.models import Project, ProjectStatus, Shot, User, Work
from app.schemas import (
    ProjectCreate,
    ProjectDownloadRequest,
    ProjectListItem,
    ProjectOut,
    ProjectUpdate,
    ShotOut,
    ShotUpdate,
    WorkOut,
)
from app.services import pipeline, storage
from app.services.progress import redis_bridge, subscribe, unsubscribe
from app.services.voices import list_voices

router = APIRouter(tags=["projects"])


@router.get("/voices")
async def get_voices() -> list[dict]:
    return list_voices()


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


@router.post("/projects", response_model=ProjectOut)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Project:
    from app.models import Template

    tpl = await db.get(Template, body.template_id)
    if not tpl or not tpl.is_active:
        raise HTTPException(status_code=400, detail="无效模板")
    project = Project(
        user_id=user.id,
        template_id=body.template_id,
        title=body.title,
        source_type=body.source_type,
        source_text=body.source_text,
        resolution_mode=body.resolution_mode,
        pipeline_mode=body.pipeline_mode,
        voice_id=(body.voice_id or "").strip(),
        style_prompt=(body.style_prompt or "").strip(),
        character_prompt=(body.character_prompt or "").strip(),
        extra_prompt=(body.extra_prompt or "").strip(),
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


@router.get("/projects", response_model=list[ProjectListItem])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Project]:
    result = await db.execute(
        select(Project).where(Project.user_id == user.id).order_by(Project.id.desc())
    )
    return list(result.scalars().all())


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

        tpl = await db.get(Template, data["template_id"])
        if not tpl or not tpl.is_active:
            raise HTTPException(status_code=400, detail="无效模板")
    for k, v in data.items():
        setattr(project, k, v)
    await db.commit()
    return await _get_owned_project(db, project_id, user)


@router.post("/projects/{project_id}/generate", response_model=ProjectOut)
async def generate_project(
    project_id: int,
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
        raise HTTPException(status_code=409, detail="生成进行中，请稍后")

    # Resume: clear error, keep existing shots/media (pipeline skips finished stages)
    project.error_msg = None
    project.final_video_url = None
    project.status = ProjectStatus.SCRIPTING
    if project.progress <= 0:
        project.progress = 1
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
        ProjectStatus.IMAGE_READY,
        ProjectStatus.VIDEOING,
        ProjectStatus.VIDEO_READY,
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
        ProjectStatus.IMAGE_READY,
        ProjectStatus.VIDEOING,
        ProjectStatus.VIDEO_READY,
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
    elif "video_prompt" in data or "duration" in data or "camera" in data:
        shot.video_url = None
        project.final_video_url = None
    shot.version += 1
    await db.commit()
    await db.refresh(shot)
    return shot


@router.post("/projects/{project_id}/shots/{shot_id}/regen-image", response_model=ShotOut)
async def regen_image(
    project_id: int,
    shot_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Shot:
    await _get_owned_project(db, project_id, user)
    try:
        await pipeline.regen_shot_image(project_id, shot_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        msg = str(exc)
        if "PolicyViolation" in msg or "SensitiveContent" in msg:
            raise HTTPException(
                status_code=400,
                detail="画面提示词触发内容安全策略，请编辑分镜去掉品牌/人名后重试",
            ) from exc
        raise HTTPException(status_code=502, detail=msg[:500]) from exc
    project = await _get_owned_project(db, project_id, user)
    shot = next(s for s in project.shots if s.id == shot_id)
    return shot


@router.post("/projects/{project_id}/shots/{shot_id}/regen-video", response_model=ShotOut)
async def regen_video(
    project_id: int,
    shot_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Shot:
    await _get_owned_project(db, project_id, user)
    try:
        await pipeline.regen_shot_video(project_id, shot_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:500]) from exc
    project = await _get_owned_project(db, project_id, user)
    shot = next(s for s in project.shots if s.id == shot_id)
    return shot


@router.post("/projects/{project_id}/shots/{shot_id}/regen-audio", response_model=ShotOut)
async def regen_audio(
    project_id: int,
    shot_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Shot:
    await _get_owned_project(db, project_id, user)
    try:
        await pipeline.regen_shot_audio(project_id, shot_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:500]) from exc
    project = await _get_owned_project(db, project_id, user)
    shot = next(s for s in project.shots if s.id == shot_id)
    return shot


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
    try:
        await pipeline.regen_project_audio_and_compose(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:500]) from exc
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
    if not project.shots or not any(s.image_url for s in project.shots):
        raise HTTPException(status_code=400, detail="缺少分镜图，无法合成")
    project.status = ProjectStatus.COMPOSING
    project.progress = 90
    project.error_msg = None
    await db.commit()
    try:
        await pipeline.compose_only(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:500]) from exc
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
        "unlimited": not settings.quota_enabled,
    }
