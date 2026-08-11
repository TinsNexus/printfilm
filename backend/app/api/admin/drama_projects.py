"""Admin drama project list with pagination and owner email."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.database import get_db
from app.deps import get_current_admin
from app.models import User
from app.models_drama import DramaProject
from app.schemas import PageMeta

router = APIRouter()


class AdminDramaProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_email: str | None = None
    title: str
    description: str | None = None
    created_at: object | None = None
    updated_at: object | None = None


class AdminDramaProjectListOut(BaseModel):
    items: list[AdminDramaProjectOut]
    meta: PageMeta


@router.get("/drama-projects", response_model=AdminDramaProjectListOut)
async def list_drama_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminDramaProjectListOut:
    # Paginated drama projects joined with user email
    owner = aliased(User)
    stmt = select(DramaProject, owner.email).outerjoin(owner, owner.id == DramaProject.user_id)
    count_stmt = select(func.count()).select_from(DramaProject)

    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (
        await db.execute(
            stmt.order_by(DramaProject.id.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).all()

    items: list[AdminDramaProjectOut] = []
    for project, email in rows:
        data = AdminDramaProjectOut.model_validate(project)
        data.user_email = email
        items.append(data)

    return AdminDramaProjectListOut(
        items=items, meta=PageMeta(page=page, page_size=page_size, total=total)
    )
