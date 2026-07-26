import pytest
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


async def test_login_then_me_then_logout(client: AsyncClient) -> None:
    # 1. Login (auto-register)
    r = await client.post("/api/auth/login", json={"work_id": "han001"})
    assert r.status_code == 200, r.text
    user = r.json()
    assert user["work_id"] == "han001"
    assert user["name"] == "han001"
    assert user["is_admin"] is False
    assert "id" in user

    # Cookie should be set
    cookies = r.cookies
    assert "pf_session" in cookies

    # 2. /api/me works with cookie
    r = await client.get("/api/me")
    assert r.status_code == 200
    assert r.json()["work_id"] == "han001"

    # 3. Logout
    r = await client.post("/api/auth/logout")
    assert r.status_code == 204

    # 4. /api/me now 401
    r = await client.get("/api/me")
    assert r.status_code == 401
    err = r.json()["detail"]["error"]
    assert err["code"] == "unauthenticated"


async def test_invalid_work_id_format(client: AsyncClient) -> None:
    r = await client.post("/api/auth/login", json={"work_id": "x"})  # too short
    assert r.status_code == 422  # pydantic min_length=2 catches first
    # also test invalid chars
    r = await client.post("/api/auth/login", json={"work_id": "han 01"})
    assert r.status_code == 400
    err = r.json()["detail"]["error"]
    assert err["code"] == "invalid_input"


async def test_relogin_does_not_duplicate_user(client: AsyncClient, session) -> None:
    from sqlalchemy import select, func
    from app.models import User

    for _ in range(3):
        r = await client.post("/api/auth/login", json={"work_id": "han001"})
        assert r.status_code == 200

    count = (
        await session.execute(select(func.count()).select_from(User).where(User.work_id == "han001"))
    ).scalar_one()
    assert count == 1


async def test_admin_flag(client: AsyncClient) -> None:
    r = await client.post("/api/auth/login", json={"work_id": "admin001"})
    assert r.status_code == 200
    assert r.json()["is_admin"] is True
