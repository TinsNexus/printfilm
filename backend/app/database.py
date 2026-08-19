"""Async SQLAlchemy engine / session — pool sized per API vs Celery role."""

from __future__ import annotations

import os
import sys
from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()


class Base(DeclarativeBase):
    pass


def is_celery_worker_process() -> bool:
    """True when running inside a Celery worker child (smaller DB pool)."""
    role = (os.environ.get("PRINTFILM_DB_ROLE") or settings.db_pool_role or "").strip().lower()
    if role in {"celery", "worker"}:
        return True
    if role == "api":
        return False
    prog = Path(sys.argv[0]).name.lower() if sys.argv else ""
    if prog.startswith("celery"):
        return True
    return len(sys.argv) > 1 and "worker" in sys.argv[1:]


def _postgres_pool_kwargs() -> dict:
    """Build QueuePool kwargs for Postgres; empty for SQLite."""
    if not settings.database_url.startswith("postgresql"):
        return {}
    if is_celery_worker_process():
        pool_size = max(1, int(settings.db_pool_size_celery))
        max_overflow = max(0, int(settings.db_max_overflow_celery))
    else:
        pool_size = max(1, int(settings.db_pool_size))
        max_overflow = max(0, int(settings.db_max_overflow))
    return {
        "pool_pre_ping": True,
        "pool_size": pool_size,
        "max_overflow": max_overflow,
        "pool_recycle": max(60, int(settings.db_pool_recycle_sec)),
        "pool_timeout": max(5, int(settings.db_pool_timeout_sec)),
    }


_engine_kwargs: dict = {"echo": bool(settings.sql_echo)}
_engine_kwargs.update(_postgres_pool_kwargs())

engine = create_async_engine(settings.database_url, **_engine_kwargs)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    from app import models  # noqa: F401
    from app import models_agent  # noqa: F401
    from app import models_drama  # noqa: F401
    from app import models_api  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def dispose_engine() -> None:
    """Drop pooled connections so the next asyncio.run can bind a fresh loop.

    Celery (and any code that calls asyncio.run repeatedly) must dispose between
    runs; otherwise asyncpg/SQLAlchemy futures stay attached to a closed loop.
    """
    await engine.dispose()


def pool_status() -> dict | None:
    """Snapshot SQLAlchemy pool counters for /api/health (Postgres only)."""
    if not settings.database_url.startswith("postgresql"):
        return None
    pool = engine.pool
    if is_celery_worker_process():
        cap = int(settings.db_pool_size_celery) + int(settings.db_max_overflow_celery)
    else:
        cap = int(settings.db_pool_size) + int(settings.db_max_overflow)
    return {
        "role": "celery" if is_celery_worker_process() else "api",
        "size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "max": cap,
    }
