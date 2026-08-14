"""独立创作工具 API：/api/tools/*"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.models import ToolRun, User
from app.schemas_tools import ToolRunListOut, ToolRunOut, ToolRunRecordOut, ToolTaskOut
from app.services.studio_tools import (
    get_tool_run,
    list_tool_runs,
    persist_tool_run,
    poll_video_task,
    run_image_tool,
    save_upload,
    start_video_tool,
    update_tool_run_task,
)

router = APIRouter(prefix="/tools", tags=["tools"])

IMAGE_TOOLS = {"t2i", "i2i", "i2p", "ecom"}
VIDEO_TOOLS = {"t2v", "v2v"}


# 提交独立工具生成（生图同步返回；生视频返回 task_id 供轮询）
@router.post("/run", response_model=ToolRunOut)
async def run_tool(
    tool_id: str = Form(...),
    prompt: str = Form(""),
    negative: str = Form(""),
    ratio: str = Form(""),
    strength: str = Form(""),
    mode: str = Form(""),
    pack: str = Form(""),
    duration: str = Form(""),
    motion: str = Form(""),
    files: list[UploadFile] | None = File(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ToolRunOut:
    tid = (tool_id or "").strip()
    saved: list[Path] = []
    try:
        for item in files or []:
            raw = await item.read()
            if not raw:
                continue
            if len(raw) > 40 * 1024 * 1024:
                raise ValueError("单个文件不能超过 40MB")
            saved.append(save_upload(user.id, raw, item.filename or "upload.bin"))
        if tid in IMAGE_TOOLS:
            data = await run_image_tool(
                db,
                user,
                tool_id=tid,
                prompt=prompt,
                negative=negative,
                ratio=ratio or None,
                strength=strength or None,
                mode=mode or None,
                pack=pack or None,
                files=saved,
            )
        elif tid in VIDEO_TOOLS:
            data = await start_video_tool(
                db,
                user,
                tool_id=tid,
                prompt=prompt,
                ratio=ratio or None,
                duration_raw=duration or None,
                motion=motion or None,
                files=saved,
            )
        else:
            raise ValueError("未知工具")
        await persist_tool_run(
            db,
            user_id=user.id,
            tool_id=tid,
            prompt=prompt,
            params={
                "negative": negative,
                "ratio": ratio,
                "strength": strength,
                "mode": mode,
                "pack": pack,
                "duration": duration,
                "motion": motion,
            },
            data=data,
        )
        await db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)[:400]) from exc
    return ToolRunOut.model_validate(data)


# 查询 Seedance 视频任务状态（单次，不阻塞），并回写创作记录
@router.get("/tasks/{task_id}", response_model=ToolTaskOut)
async def get_tool_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ToolTaskOut:
    if not task_id.strip():
        raise HTTPException(status_code=400, detail="缺少任务")
    data = await poll_video_task(user, task_id.strip())
    await update_tool_run_task(db, user.id, task_id.strip(), data)
    await db.commit()
    return ToolTaskOut.model_validate(data)


# 把 ORM 记录转成列表/详情项（时间用 ISO）
def _record_out(row: ToolRun) -> ToolRunRecordOut:
    created = row.created_at.isoformat() if row.created_at else ""
    return ToolRunRecordOut(
        id=row.id,
        tool_id=row.tool_id,
        kind=row.kind,
        status=row.status,
        prompt=row.prompt or "",
        preview_url=row.preview_url,
        urls=list(row.urls or []),
        task_id=row.task_id,
        params=row.params if isinstance(row.params, dict) else None,
        error=row.error,
        created_at=created,
    )


# 个人中心：当前用户的工具创作记录（服务端分页）
@router.get("/runs", response_model=ToolRunListOut)
async def list_runs(
    page: int = Query(1, ge=1),
    page_size: int = Query(8, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ToolRunListOut:
    rows, total = await list_tool_runs(db, user.id, page=page, page_size=page_size)
    await db.commit()
    return ToolRunListOut(
        items=[_record_out(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


# 个人中心：单条创作详情（含 OSS 结果地址）
@router.get("/runs/{run_id}", response_model=ToolRunRecordOut)
async def get_run(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ToolRunRecordOut:
    row = await get_tool_run(db, user.id, run_id)
    if not row:
        raise HTTPException(status_code=404, detail="记录不存在")
    await db.commit()
    return _record_out(row)
