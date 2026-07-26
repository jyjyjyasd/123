import json
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import pytest
from httpx import AsyncClient

from app.models import Generation, User


pytestmark = pytest.mark.asyncio


async def _seed_generations(session, user_id: str, count: int) -> list[str]:
    """Insert N generations with descending created_at, returns IDs in newest-first order."""
    base = datetime.now(timezone.utc)
    rows: list[Generation] = []
    for i in range(count):
        g = Generation(
            user_id=user_id,
            action="generate",
            status="completed",
            prompt=f"prompt #{i}",
            params=json.dumps({"size": "square", "quality": "high", "n": 1}),
            output_file_ids=None,
            created_at=base - timedelta(seconds=i),
        )
        session.add(g)
        rows.append(g)
    await session.commit()
    for g in rows:
        await session.refresh(g)
    # newest-first
    return [g.id for g in sorted(rows, key=lambda r: r.created_at, reverse=True)]


async def _login(client: AsyncClient, work_id: str) -> dict:
    r = await client.post("/api/auth/login", json={"work_id": work_id})
    assert r.status_code == 200, r.text
    return r.json()


async def test_history_pagination(client: AsyncClient, session) -> None:
    me = await _login(client, "han001")
    ids = await _seed_generations(session, me["id"], 25)

    # First page
    r = await client.get("/api/history?page_size=10")
    assert r.status_code == 200
    page1 = r.json()
    assert page1["has_more"] is True
    assert page1["next_cursor"] is not None
    assert [it["id"] for it in page1["items"]] == ids[:10]
    assert page1["items"][0]["prompt"] == "prompt #0"

    # Second page
    r = await client.get(f"/api/history?page_size=10&cursor={quote(page1['next_cursor'])}")
    page2 = r.json()
    assert page2["has_more"] is True
    assert [it["id"] for it in page2["items"]] == ids[10:20]

    # Third page (last 5)
    r = await client.get(f"/api/history?page_size=10&cursor={quote(page2['next_cursor'])}")
    page3 = r.json()
    assert page3["has_more"] is False
    assert page3["next_cursor"] is None
    assert [it["id"] for it in page3["items"]] == ids[20:]


async def test_history_user_isolation(client: AsyncClient, session) -> None:
    me1 = await _login(client, "han001")
    await _seed_generations(session, me1["id"], 3)

    # logout, login as someone else
    await client.post("/api/auth/logout")
    me2 = await _login(client, "han002")
    await _seed_generations(session, me2["id"], 2)

    r = await client.get("/api/history")
    rows = r.json()["items"]
    # han002 should only see their own 2
    assert len(rows) == 2
    for row in rows:
        # All belong to han002
        full = await client.get(f"/api/generations/{row['id']}")
        assert full.status_code == 200

    # han002 cannot fetch han001's generation directly either
    await client.post("/api/auth/logout")
    me1_again = await _login(client, "han001")
    assert me1_again["id"] == me1["id"]
    r = await client.get("/api/history")
    assert len(r.json()["items"]) == 3


async def test_delete_soft_excludes_from_history(client: AsyncClient, session) -> None:
    me = await _login(client, "han001")
    ids = await _seed_generations(session, me["id"], 5)

    target = ids[1]
    r = await client.delete(f"/api/generations/{target}")
    assert r.status_code == 204

    # GET single returns 404 now
    r = await client.get(f"/api/generations/{target}")
    assert r.status_code == 404

    # History no longer lists it
    r = await client.get("/api/history")
    listed = [it["id"] for it in r.json()["items"]]
    assert target not in listed
    assert len(listed) == 4


async def test_delete_404_for_other_users_id(client: AsyncClient, session) -> None:
    me1 = await _login(client, "han001")
    ids = await _seed_generations(session, me1["id"], 1)

    await client.post("/api/auth/logout")
    await _login(client, "han002")
    r = await client.delete(f"/api/generations/{ids[0]}")
    # Treated as 404 to avoid leaking existence
    assert r.status_code == 404


async def test_invalid_cursor_returns_400(client: AsyncClient) -> None:
    await _login(client, "han001")
    r = await client.get("/api/history?cursor=not-a-date")
    assert r.status_code == 400
    err = r.json()["detail"]["error"]
    assert err["code"] == "invalid_input"
