"""POST /api/uploads — single-file upload endpoint, decoupled from generations.

Exercises auth, MIME / size validation, and successful persistence.
"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import File


pytestmark = pytest.mark.asyncio


# 1×1 PNG (real bytes, parses cleanly through PIL)
_PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000d49444154789c63f8cf000000010001005c2eafd60000000049454e"
    "44ae426082"
)


async def _login(client: AsyncClient, work_id: str) -> dict:
    r = await client.post("/api/auth/login", json={"work_id": work_id})
    assert r.status_code == 200, r.text
    return r.json()


async def test_upload_requires_auth(client: AsyncClient) -> None:
    r = await client.post(
        "/api/uploads",
        files={"file": ("a.png", _PNG_1PX, "image/png")},
    )
    assert r.status_code == 401


async def test_upload_success_returns_file_ref(
    client: AsyncClient, session
) -> None:
    await _login(client, "han001")
    r = await client.post(
        "/api/uploads",
        files={"file": ("a.png", _PNG_1PX, "image/png")},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert isinstance(body["file_id"], str)
    assert body["url"] == f"/api/files/{body['file_id']}"
    assert body["width"] == 1 and body["height"] == 1

    row = (
        await session.execute(select(File).where(File.id == body["file_id"]))
    ).scalar_one()
    assert row.kind == "upload"
    assert row.deleted_at is None
    assert row.size_bytes == len(_PNG_1PX)


async def test_upload_rejects_bad_mime(client: AsyncClient) -> None:
    await _login(client, "han001")
    r = await client.post(
        "/api/uploads",
        files={"file": ("evil.gif", b"GIF89a;", "image/gif")},
    )
    assert r.status_code == 400
    err = r.json()["detail"]["error"]
    assert err["code"] == "invalid_input"
    assert "png/jpg/webp" in err["message"]


async def test_upload_rejects_empty(client: AsyncClient) -> None:
    await _login(client, "han001")
    r = await client.post(
        "/api/uploads",
        files={"file": ("empty.png", b"", "image/png")},
    )
    assert r.status_code == 400
    err = r.json()["detail"]["error"]
    assert err["code"] == "invalid_input"
    assert "为空" in err["message"]


async def test_upload_rejects_oversized(client: AsyncClient) -> None:
    await _login(client, "han001")
    payload = b"\x00" * (10 * 1024 * 1024 + 1)
    r = await client.post(
        "/api/uploads",
        files={"file": ("big.png", payload, "image/png")},
    )
    assert r.status_code == 400
    err = r.json()["detail"]["error"]
    assert err["code"] == "invalid_input"
    assert "10MB" in err["message"]
