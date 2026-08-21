"""对外 REST API：生图 / 生视频 / Seedance 转发。"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.deps import get_api_user
from app.models import User
from app.schemas_api import (
    V1GenerationOut,
    V1ImageGenerateRequest,
    V1SeedanceTaskRequest,
    V1VideoGenerateRequest,
)
from app.services.billing import record_usage, settle_usage_charge
from app.services.studio_tools import poll_video_task, ratio_to_size
from app.services import storage

router = APIRouter(prefix="/v1", tags=["public-api"])


async def _resolve_api_user(
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
) -> User:
    from fastapi.security import HTTPAuthorizationCredentials

    creds = None
    if authorization and authorization.lower().startswith("bearer "):
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=authorization[7:].strip())
    return await get_api_user(creds=creds, db=db, x_api_key=x_api_key)


@router.post("/images/generations", response_model=V1GenerationOut)
async def generate_image(
    body: V1ImageGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_resolve_api_user),
) -> V1GenerationOut:
    """文生图 / 图生图（Seedream）。"""
    ark = get_ark()
    refs: list[str] | None = None
    prompt = body.prompt.strip()
    if body.image_url:
        refs = [body.image_url.strip()]
        prompt = f"{prompt}。在保持主体可识别的前提下适度改变风格"
    size = ratio_to_size(body.ratio)
    try:
        result = await ark.gen_image(
            prompt,
            body.negative,
            refs,
            project_id=0,
            shot_no=user.id,
            size=size,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:400]) from exc

    ev = await record_usage(
        db,
        user_id=user.id,
        project_id=None,
        billing_key="seedream",
        model=get_settings().model_image,
        estimated=True,
        raw={"source": "api_v1_image"},
    )
    try:
        await settle_usage_charge(db, user, int(ev.charge_fen or 0), ref_type="api", ref_id=f"img:{ev.id}")
    except ValueError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc

    url = result.local_url or result.remote_url or ""
    if url:
        url = storage.republish_url(url, sync=True) or url
    await db.commit()
    return V1GenerationOut(status="succeeded", kind="image", urls=[url] if url else [])


@router.post("/videos/generations", response_model=V1GenerationOut)
async def generate_video(
    body: V1VideoGenerateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_resolve_api_user),
) -> V1GenerationOut:
    """首帧图 + 文案 → Seedance 图生视频，返回 task_id。"""
    ark = get_ark()
    try:
        task_id = await ark.gen_video_i2v(
            body.image_url.strip(),
            body.prompt.strip(),
            body.duration,
            resolution=body.resolution,
            generate_audio=body.generate_audio,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:400]) from exc

    ev = await record_usage(
        db,
        user_id=user.id,
        project_id=None,
        billing_key="seedance2:video0",
        model=get_settings().model_video,
        estimated=True,
        raw={"source": "api_v1_video", "duration": body.duration},
    )
    try:
        await settle_usage_charge(db, user, int(ev.charge_fen or 0), ref_type="api", ref_id=f"vid:{ev.id}")
    except ValueError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc

    await db.commit()
    return V1GenerationOut(
        status="queued",
        kind="video",
        task_id=task_id,
        preview_url=body.image_url,
        urls=[],
    )


@router.post("/seedance/tasks", response_model=V1GenerationOut)
async def forward_seedance(
    body: V1SeedanceTaskRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_resolve_api_user),
) -> V1GenerationOut:
    """转发 Seedance 多模态 body 到火山方舟。"""
    if not body.content:
        raise HTTPException(status_code=400, detail="content 不能为空")
    settings = get_settings()
    payload: dict = {
        "model": settings.model_video,
        "content": body.content,
        "resolution": body.resolution,
        "watermark": body.watermark,
        "generate_audio": body.generate_audio,
        "return_last_frame": body.return_last_frame,
    }
    if body.duration is not None:
        payload["duration"] = body.duration
    if body.ratio:
        payload["ratio"] = body.ratio

    ark = get_ark()
    try:
        task_id = await ark.gen_video_seedance_body(payload, project_id=0)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc)[:400]) from exc

    ev = await record_usage(
        db,
        user_id=user.id,
        project_id=None,
        billing_key="seedance2:video0",
        model=settings.model_video,
        estimated=True,
        raw={"source": "api_v1_seedance"},
    )
    try:
        await settle_usage_charge(db, user, int(ev.charge_fen or 0), ref_type="api", ref_id=f"sd:{ev.id}")
    except ValueError as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc

    await db.commit()
    return V1GenerationOut(status="queued", kind="video", task_id=task_id, urls=[])


@router.get("/tasks/{task_id}", response_model=V1GenerationOut)
async def get_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(_resolve_api_user),
) -> V1GenerationOut:
    """查询 Seedance 视频任务状态。"""
    if not task_id.strip():
        raise HTTPException(status_code=400, detail="缺少 task_id")
    data = await poll_video_task(user, task_id.strip())
    await db.commit()
    return V1GenerationOut(
        status=str(data.get("status") or "running"),
        kind="video",
        urls=list(data.get("urls") or []),
        task_id=task_id.strip(),
        error=data.get("error"),
    )
