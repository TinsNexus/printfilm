# Admin template CRUD
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_admin
from app.models import Project, Template, User
from app.schemas import (
    AdminTemplateCreate,
    AdminTemplateListOut,
    AdminTemplateOut,
    AdminTemplatePatch,
    PageMeta,
)

router = APIRouter()


@router.get("/templates", response_model=AdminTemplateListOut)
async def list_templates(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminTemplateListOut:
    # All templates including inactive
    total = int((await db.execute(select(func.count()).select_from(Template))).scalar_one() or 0)
    result = await db.execute(
        select(Template)
        .order_by(Template.sort_order, Template.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [AdminTemplateOut.model_validate(t) for t in result.scalars().all()]
    return AdminTemplateListOut(
        items=items, meta=PageMeta(page=page, page_size=page_size, total=total)
    )


@router.get("/templates/{template_id}", response_model=AdminTemplateOut)
async def get_template(
    template_id: str,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminTemplateOut:
    tpl = await db.get(Template, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")
    return AdminTemplateOut.model_validate(tpl)


@router.post("/templates", response_model=AdminTemplateOut)
async def create_template(
    body: AdminTemplateCreate,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminTemplateOut:
    # Create a new template row
    existing = await db.get(Template, body.id)
    if existing:
        raise HTTPException(status_code=400, detail="模板 ID 已存在")
    tpl = Template(**body.model_dump())
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return AdminTemplateOut.model_validate(tpl)


@router.patch("/templates/{template_id}", response_model=AdminTemplateOut)
async def patch_template(
    template_id: str,
    body: AdminTemplatePatch,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminTemplateOut:
    # Partial update including is_active / is_premium
    tpl = await db.get(Template, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(tpl, key, value)
    await db.commit()
    await db.refresh(tpl)
    return AdminTemplateOut.model_validate(tpl)


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    # Refuse delete when projects still reference the template
    tpl = await db.get(Template, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="模板不存在")
    used = int(
        (
            await db.execute(
                select(func.count()).select_from(Project).where(Project.template_id == template_id)
            )
        ).scalar_one()
        or 0
    )
    if used > 0:
        raise HTTPException(status_code=400, detail=f"模板仍被 {used} 个项目引用，无法删除")
    await db.delete(tpl)
    await db.commit()
    return {"ok": True}
