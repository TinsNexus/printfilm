"""Public site-facing config (no auth)."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.config import get_settings

router = APIRouter(tags=["site"])


class SiteConfigOut(BaseModel):
    """Safe public marketing / contact knobs for the user frontend."""

    wechat_group_qr_url: str = Field(default="", description="微信用户群二维码 URL")


@router.get("/site-config", response_model=SiteConfigOut)
async def get_site_config() -> SiteConfigOut:
    """返回前台可公开读取的站点配置（微信群二维码等）。"""
    url = str(get_settings().wechat_group_qr_url or "").strip()
    return SiteConfigOut(wechat_group_qr_url=url)
