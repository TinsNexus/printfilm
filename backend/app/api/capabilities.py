"""Public feature availability without authentication or database access."""

from fastapi import APIRouter

from app.config import get_settings


router = APIRouter(prefix="/capabilities", tags=["capabilities"])


@router.get(
    "",
    summary="获取公开功能开关",
    description="无需登录，返回当前服务的公开功能开关，包括漫剧语音生成与自助注册是否启用。",
    response_description="公开功能开关",
)
async def capabilities() -> dict[str, bool]:
    settings = get_settings()
    return {
        "drama_voice_generation_enabled": settings.drama_voice_generation_enabled,
        "registration_enabled": settings.registration_enabled,
    }
