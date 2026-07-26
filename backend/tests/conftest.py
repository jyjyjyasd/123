"""Pytest fixtures for backend tests.

Each test gets a fresh in-memory SQLite + isolated FastAPI app instance.
"""
from __future__ import annotations

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import Settings
from app.db import Base, get_session
from app.main import create_app


@pytest_asyncio.fixture
async def settings() -> Settings:
    return Settings(
        apimart_base_url="http://mock",
        apimart_api_key="mock",
        session_secret="test-secret-not-real-32-chars-long-enough",
        database_url="sqlite+aiosqlite:///:memory:",
        admin_work_ids="admin001",
        admin_elevation_secret="super-secret-admin-token",
    )


@pytest_asyncio.fixture
async def session(settings: Settings) -> AsyncSession:
    # Each test gets its own in-memory DB
    engine = create_async_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    maker = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with maker() as s:
        yield s

    await engine.dispose()


@pytest_asyncio.fixture
async def client(settings: Settings, session: AsyncSession) -> AsyncClient:
    from app.config import get_settings

    app = create_app()

    async def _override_session():
        yield session

    async def _override_settings():
        return settings

    app.dependency_overrides[get_session] = _override_session
    app.dependency_overrides[get_settings] = _override_settings

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
