"""Public site-config + admin WeChat QR upload."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import site as site_api
from app.api.admin import settings as admin_settings
from app.config import Settings, get_settings
from app.database import get_db
from app.deps import get_current_admin
from app.schemas_settings import AdminModelSettingsOut


def _minimal_png() -> bytes:
    # 1x1 PNG
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
    )


@pytest.fixture()
def site_app(tmp_path, monkeypatch):
    """挂载公开 site-config + 管理端上传（鉴权与 DB 打桩）。"""
    from app.services import storage

    monkeypatch.setattr(storage, "STATIC_ROOT", tmp_path)
    (tmp_path / "site").mkdir(parents=True, exist_ok=True)

    def fake_settings() -> Settings:
        return Settings(wechat_group_qr_url="/static/site/wechat_group_qr.png")

    get_settings.cache_clear()
    monkeypatch.setattr("app.api.site.get_settings", fake_settings)

    app = FastAPI()
    app.include_router(site_api.router, prefix="/api")
    app.include_router(admin_settings.router, prefix="/api/admin")

    async def _admin():
        return type("U", (), {"id": 1, "role": "admin"})()

    async def _db():
        yield AsyncMock()

    app.dependency_overrides[get_current_admin] = _admin
    app.dependency_overrides[get_db] = _db

    yield app
    get_settings.cache_clear()
    app.dependency_overrides.clear()


def test_site_config_returns_qr_url(site_app):
    client = TestClient(site_app)
    res = client.get("/api/site-config")
    assert res.status_code == 200
    assert res.json()["wechat_group_qr_url"] == "/static/site/wechat_group_qr.png"


def test_admin_upload_wechat_qr(site_app, tmp_path):
    fake_out = AdminModelSettingsOut(
        wechat_group_qr_url="/static/site/wechat_group_qr.png?v=1",
        source="db",
    )

    async def _patch(_db, body):
        assert body.wechat_group_qr_url
        assert "wechat_group_qr" in body.wechat_group_qr_url
        return fake_out, ["wechat_group_qr_url"]

    with patch("app.api.admin.settings.patch_admin_model_settings", new=_patch), patch(
        "app.api.admin.settings.storage.publish_local",
        return_value="/static/site/wechat_group_qr.png",
    ):
        client = TestClient(site_app)
        res = client.post(
            "/api/admin/settings/site/wechat-group-qr",
            files={"file": ("qr.png", _minimal_png(), "image/png")},
        )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["ok"] is True
    assert data["wechat_group_qr_url"].startswith("/static/site/wechat_group_qr.png")
    assert (tmp_path / "site" / "wechat_group_qr.png").is_file()
