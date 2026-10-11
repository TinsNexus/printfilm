"""后台上游网关开关：切换 9Router 后即时生效，默认模型解锁预设，切回后恢复 TokenFree。"""

from __future__ import annotations

import pytest

from app.config import get_settings, reload_settings
from app.schemas_routing import AdminRoutingSettingsPatch, DefaultModels
from app.schemas_settings import AdminModelSettingsPatch
from app.services.model_settings import (
    get_admin_routing_settings,
    load_model_settings_cache,
    patch_admin_model_settings,
    patch_admin_routing_settings,
)
from app.services.nine_router.config import is_9router_active
from app.services.tokenfree_gateway import TOKENFREE_BASE_URL


@pytest.mark.asyncio
async def test_switch_to_9router_and_back(db_session):
    from app.services import model_settings as _ms

    saved_overlay = dict(_ms._overlay)
    saved_snapshot = _ms._routing_snapshot
    try:
        # 先走一遍首次引导（建渠道），之后开关才会被保留
        await load_model_settings_cache(db_session)
        await patch_admin_model_settings(
            db_session,
            AdminModelSettingsPatch(
                upstream_gateway_type="9router",
                ninerouter_base_url="http://localhost:20128",
                ninerouter_api_key="sk-9r-test",
            ),
        )
        s = get_settings()
        assert is_9router_active()
        assert s.openai_base_url == "http://localhost:20128/v1"
        assert s.openai_api_key == "sk-9r-test"

        routing = await get_admin_routing_settings(db_session)
        assert routing.gateway_type == "9router"

        out, _ = await patch_admin_routing_settings(
            db_session,
            AdminRoutingSettingsPatch(
                default_models=DefaultModels(text_model="cc/claude-sonnet-4", image_model="", video_model="", audio_model="")
            ),
        )
        assert out.default_models.text_model == "cc/claude-sonnet-4"

        await patch_admin_model_settings(db_session, AdminModelSettingsPatch(upstream_gateway_type="tokenfree"))
        assert not is_9router_active()
        assert get_settings().openai_base_url == TOKENFREE_BASE_URL
        assert get_settings().openai_api_key != "sk-9r-test"
    finally:
        await db_session.rollback()
        # 还原进程内全局状态，避免污染其它用例
        from app.services import model_settings

        model_settings._overlay.clear()
        model_settings._overlay.update(saved_overlay)
        model_settings._routing_snapshot = saved_snapshot
        reload_settings()
