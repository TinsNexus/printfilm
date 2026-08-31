"""计费集成测试：内存 SQLite + 开启 billing。"""
from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import get_settings
from app.database import Base
from app.models import User
from app.models_tasks import TaskRun


@pytest.fixture
def billing_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """测试环境强制开启计费，buffer=1 便于断言。"""
    settings = get_settings()
    monkeypatch.setattr(settings, "billing_enabled", True)
    monkeypatch.setattr(settings, "billing_estimate_buffer", 1.0)


@pytest_asyncio.fixture
async def db_session(billing_enabled: None) -> AsyncIterator[AsyncSession]:
    """每个用例独立内存库，自动建表。"""
    # 注册全部 ORM 表
    import app.models  # noqa: F401
    import app.models_agent  # noqa: F401
    import app.models_api  # noqa: F401
    import app.models_drama  # noqa: F401
    import app.models_settings  # noqa: F401
    import app.models_tasks  # noqa: F401

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with session_factory() as session:
        yield session

    await engine.dispose()


async def make_user(
    db: AsyncSession,
    *,
    balance_fen: int = 100_000,
    frozen_fen: int = 0,
    billing_unlimited: bool = False,
) -> User:
    """创建测试用户。"""
    user = User(
        email=f"billing-{uuid.uuid4().hex[:10]}@test.local",
        hashed_password="test",
        balance_fen=balance_fen,
        frozen_fen=frozen_fen,
        billing_unlimited=billing_unlimited,
    )
    db.add(user)
    await db.flush()
    return user


async def make_task(
    db: AsyncSession,
    user: User,
    *,
    domain: str = "api",
    task_type: str = "v1_image",
    status: str = "pending",
    billing_status: str = "none",
    provider_task_id: str | None = None,
) -> TaskRun:
    """创建测试 TaskRun（无业务 FK）。"""
    task = TaskRun(
        domain=domain,
        task_type=task_type,
        status=status,
        requested_by=user.id,
        provider_task_id=provider_task_id,
        billing_status=billing_status,
        payload={},
    )
    db.add(task)
    await db.flush()
    return task
