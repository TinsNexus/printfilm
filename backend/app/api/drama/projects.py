"""Drama project CRUD."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.models_drama import DramaProject, DramaScript
from app.schemas_drama import (
    DramaProjectCreate,
    DramaProjectListItem,
    DramaProjectOut,
    DramaProjectUpdate,
    DramaScriptOut,
)
from app.services.drama.access import get_owned_drama_project

router = APIRouter()


def _project_out(project: DramaProject) -> DramaProjectOut:
    script = None
    if project.script:
        script = DramaScriptOut.model_validate(project.script)
    return DramaProjectOut(
        id=project.id,
        user_id=project.user_id,
        title=project.title,
        description=project.description,
        content=project.content,
        params=project.params,
        created_at=project.created_at,
        updated_at=project.updated_at,
        script=script,
        asset_count=len(project.assets) if project.assets is not None else 0,
        episode_count=len(project.episodes) if project.episodes is not None else 0,
    )


@router.get("/projects", response_model=list[DramaProjectListItem])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DramaProjectListItem]:
    # List current user's drama projects
    result = await db.execute(
        select(DramaProject)
        .where(DramaProject.user_id == user.id)
        .options(
            selectinload(DramaProject.script),
            selectinload(DramaProject.assets),
            selectinload(DramaProject.episodes),
        )
        .order_by(DramaProject.updated_at.desc())
    )
    rows = list(result.scalars().all())
    return [
        DramaProjectListItem(
            id=p.id,
            title=p.title,
            description=p.description,
            created_at=p.created_at,
            updated_at=p.updated_at,
            episode_count=len(p.episodes or []),
            asset_count=len(p.assets or []),
            has_script=p.script is not None,
        )
        for p in rows
    ]


@router.post("/projects", response_model=DramaProjectOut)
async def create_project(
    body: DramaProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DramaProjectOut:
    # Create project + empty script draft from creative source
    source = (body.source or "").strip()
    if len(source) < 20:
        raise HTTPException(status_code=400, detail="原始创意至少需要 20 个字")
    title = (body.title or "").strip()
    if not title:
        title = source[:40] + ("…" if len(source) > 40 else "")
    project = DramaProject(
        user_id=user.id,
        title=title or "未命名漫剧",
        description=body.description,
        params={
            **(body.params or {}),
            "episode_count": body.episode_count,
            "image_style_id": body.image_style_id,
        },
    )
    db.add(project)
    await db.flush()
    script = DramaScript(
        project_id=project.id,
        name=project.title,
        source=source,
        params={
            "episode_count": body.episode_count,
            "image_style_id": body.image_style_id,
            "summary_status": "pending",
            "episode_content_status": "pending",
        },
    )
    db.add(script)
    await db.commit()
    project = await get_owned_drama_project(
        db, project.id, user, with_script=True, with_assets=True, with_episodes=True
    )
    return _project_out(project)


@router.get("/projects/{project_id}", response_model=DramaProjectOut)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DramaProjectOut:
    project = await get_owned_drama_project(
        db, project_id, user, with_script=True, with_assets=True, with_episodes=True
    )
    return _project_out(project)


@router.patch("/projects/{project_id}", response_model=DramaProjectOut)
async def update_project(
    project_id: int,
    body: DramaProjectUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DramaProjectOut:
    project = await get_owned_drama_project(db, project_id, user, with_script=True)
    if body.title is not None:
        project.title = body.title.strip() or project.title
    if body.description is not None:
        project.description = body.description
    if body.content is not None:
        project.content = body.content
    if body.params is not None:
        project.params = body.params
    await db.commit()
    project = await get_owned_drama_project(
        db, project_id, user, with_script=True, with_assets=True, with_episodes=True
    )
    return _project_out(project)


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    project = await get_owned_drama_project(db, project_id, user)
    await db.delete(project)
    await db.commit()
    return {"ok": True}
