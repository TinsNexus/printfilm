# Admin project list and detail for failure triage
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.database import get_db
from app.deps import get_current_admin
from app.models import Project, Shot, User
from app.schemas import AdminProjectDetailOut, AdminProjectListOut, AdminProjectOut, PageMeta

router = APIRouter()


@router.get("/projects", response_model=AdminProjectListOut)
async def list_projects(
    status: str | None = None,
    q: str | None = None,
    user_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminProjectListOut:
    # Paginated projects with owner email and shot count
    owner = aliased(User)
    shot_count = (
        select(func.count(Shot.id)).where(Shot.project_id == Project.id).correlate(Project).scalar_subquery()
    )
    stmt = select(Project, owner.email, shot_count).outerjoin(owner, owner.id == Project.user_id)
    count_stmt = select(func.count()).select_from(Project)

    if status and status.strip():
        stmt = stmt.where(Project.status == status.strip())
        count_stmt = count_stmt.where(Project.status == status.strip())
    if user_id is not None:
        stmt = stmt.where(Project.user_id == user_id)
        count_stmt = count_stmt.where(Project.user_id == user_id)
    if q and q.strip():
        like = f"%{q.strip()}%"
        filt = or_(Project.title.ilike(like), Project.error_msg.ilike(like))
        stmt = stmt.where(filt)
        count_stmt = count_stmt.where(filt)

    total = int((await db.execute(count_stmt)).scalar_one() or 0)
    rows = (
        await db.execute(
            stmt.order_by(Project.id.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).all()

    items: list[AdminProjectOut] = []
    for project, email, scount in rows:
        data = AdminProjectOut.model_validate(project)
        data.user_email = email
        data.shot_count = int(scount or 0)
        items.append(data)

    return AdminProjectListOut(
        items=items, meta=PageMeta(page=page, page_size=page_size, total=total)
    )


@router.get("/projects/{project_id}", response_model=AdminProjectDetailOut)
async def get_project(
    project_id: int,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminProjectDetailOut:
    # Project detail for ops triage
    owner = aliased(User)
    shot_count = (
        select(func.count(Shot.id)).where(Shot.project_id == Project.id).correlate(Project).scalar_subquery()
    )
    row = (
        await db.execute(
            select(Project, owner.email, shot_count)
            .outerjoin(owner, owner.id == Project.user_id)
            .where(Project.id == project_id)
        )
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="项目不存在")
    project, email, scount = row
    data = AdminProjectDetailOut.model_validate(project)
    data.user_email = email
    data.shot_count = int(scount or 0)
    return data
