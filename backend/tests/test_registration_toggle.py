"""自助注册开关：关闭后仅管理员引导邮箱可注册，且注册即为管理员。"""

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.auth import register
from app.api.capabilities import capabilities
from app.config import get_settings
from app.models import User
from app.schemas import RegisterRequest


def _req(email: str) -> RegisterRequest:
    return RegisterRequest(email=email, password="Passw0rd123", nickname="tester")


async def test_capabilities_expose_registration_switch(monkeypatch):
    monkeypatch.setattr(get_settings(), "registration_enabled", False)
    assert (await capabilities())["registration_enabled"] is False


async def test_closed_registration_rejects_regular_email(db_session, monkeypatch):
    monkeypatch.setattr(get_settings(), "registration_enabled", False)
    monkeypatch.setattr(get_settings(), "admin_bootstrap_emails", "boss@example.com")
    with pytest.raises(HTTPException) as exc:
        await register(_req("someone-closed@example.com"), db_session)
    assert exc.value.status_code == 403


async def test_closed_registration_allows_bootstrap_admin(db_session, monkeypatch):
    monkeypatch.setattr(get_settings(), "registration_enabled", False)
    monkeypatch.setattr(get_settings(), "admin_bootstrap_emails", " Boss-Reg@Example.com ")
    token = await register(_req("boss-reg@example.com"), db_session)
    assert token.access_token
    user = (await db_session.execute(select(User).where(User.email == "boss-reg@example.com"))).scalar_one()
    assert user.role == "admin"


async def test_open_registration_creates_regular_user(db_session, monkeypatch):
    monkeypatch.setattr(get_settings(), "registration_enabled", True)
    monkeypatch.setattr(get_settings(), "admin_bootstrap_emails", "")
    await register(_req("open-reg@example.com"), db_session)
    user = (await db_session.execute(select(User).where(User.email == "open-reg@example.com"))).scalar_one()
    assert user.role == "user"
