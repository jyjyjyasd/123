import json
from datetime import datetime, timezone
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.models import File, Generation


pytestmark = pytest.mark.asyncio


async def _login(client: AsyncClient, work_id: str) -> dict:
    r = await client.post("/api/auth/login", json={"work_id": work_id})
    assert r.status_code == 200, r.text
    return r.json()


async def test_admin_elevation_required_for_stats(client: AsyncClient) -> None:
    await _login(client, "admin001")

    r = await client.get("/api/admin/stats")
    assert r.status_code == 403
    err = r.json()["detail"]["error"]
    assert err["code"] == "forbidden"

    r = await client.post("/api/admin/elevate", json={"secret": "wrong"})
    assert r.status_code == 403

    r = await client.post(
        "/api/admin/elevate",
        json={"secret": "super-secret-admin-token"},
    )
    assert r.status_code == 200
    assert r.json() == {"is_admin": True, "is_admin_elevated": True}

    me = await client.get("/api/me")
    assert me.status_code == 200
    assert me.json()["is_admin"] is True
    assert me.json()["is_admin_elevated"] is True

    stats = await client.get("/api/admin/stats")
    assert stats.status_code == 200
    payload = stats.json()
    assert payload["today"]["total"]["total"] == 0
    assert payload["today"]["generate"]["total"] == 0
    assert payload["today"]["edit"]["total"] == 0
    assert payload["month"]["total"]["total"] == 0
    assert payload["top_users"] == []
    assert payload["recent_failures"] == []


async def test_non_admin_cannot_elevate(client: AsyncClient) -> None:
    await _login(client, "han001")

    r = await client.post(
        "/api/admin/elevate",
        json={"secret": "super-secret-admin-token"},
    )
    assert r.status_code == 403
    err = r.json()["detail"]["error"]
    assert err["code"] == "forbidden"


async def test_cross_user_file_requires_elevation(
    client: AsyncClient,
    session,
    settings,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    admin = await _login(client, "admin001")

    target = await _login(client, "han002")
    test_data_dir = tmp_path / "data"
    test_settings = settings.model_copy(
        update={
            "upload_dir": test_data_dir / "uploads",
            "output_dir": test_data_dir / "outputs",
        }
    )
    test_settings.upload_dir.mkdir(parents=True, exist_ok=True)
    test_settings.output_dir.mkdir(parents=True, exist_ok=True)

    import app.storage as storage_module

    monkeypatch.setattr(storage_module, "get_settings", lambda: test_settings)

    file_row = File(
        user_id=target["id"],
        kind="output",
        path="outputs/han002/2026/04/mock.png",
        mime_type="image/png",
        size_bytes=4,
        width=1,
        height=1,
    )
    session.add(file_row)
    await session.commit()
    await session.refresh(file_row)

    abs_path = test_settings.upload_dir.parent / file_row.path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(b"png!")

    await client.post("/api/auth/logout")
    await _login(client, admin["work_id"])

    r = await client.get(f"/api/files/{file_row.id}")
    assert r.status_code == 404

    elevate = await client.post(
        "/api/admin/elevate",
        json={"secret": "super-secret-admin-token"},
    )
    assert elevate.status_code == 200

    r = await client.get(f"/api/files/{file_row.id}")
    assert r.status_code == 200
    assert r.content == b"png!"


async def test_admin_gallery_lists_all_users(client: AsyncClient, session) -> None:
    admin = await _login(client, "admin001")
    user = await _login(client, "han002")

    now = datetime.now(timezone.utc)
    rows = [
        Generation(
            user_id=admin["id"],
            action="generate",
            status="completed",
            prompt="admin shot",
            params=json.dumps({"size": "square", "quality": "high", "n": 1}),
            created_at=now,
            completed_at=now,
        ),
        Generation(
            user_id=user["id"],
            action="edit",
            status="failed",
            prompt="user fail",
            params=json.dumps({"size": "landscape", "quality": "high", "n": 1}),
            error_code="content_policy",
            created_at=now,
            completed_at=now,
        ),
    ]
    session.add_all(rows)
    await session.commit()

    await client.post("/api/auth/logout")
    await _login(client, "admin001")

    # Without elevation: 403
    r = await client.get("/api/admin/gallery")
    assert r.status_code == 403

    await client.post(
        "/api/admin/elevate",
        json={"secret": "super-secret-admin-token"},
    )

    r = await client.get("/api/admin/gallery")
    assert r.status_code == 200
    payload = r.json()
    assert len(payload["items"]) == 2
    work_ids = {it["work_id"] for it in payload["items"]}
    assert work_ids == {"admin001", "han002"}

    # Filter by action
    r = await client.get("/api/admin/gallery?action=edit")
    assert r.status_code == 200
    payload = r.json()
    assert len(payload["items"]) == 1
    assert payload["items"][0]["work_id"] == "han002"

    # Filter by status
    r = await client.get("/api/admin/gallery?status=failed")
    assert r.status_code == 200
    payload = r.json()
    assert len(payload["items"]) == 1
    assert payload["items"][0]["error_code"] == "content_policy"

    # Filter by user_id
    r = await client.get(f"/api/admin/gallery?user_id={user['id']}")
    assert r.status_code == 200
    payload = r.json()
    assert len(payload["items"]) == 1
    assert payload["items"][0]["user_id"] == user["id"]


async def test_admin_users_search(client: AsyncClient, session) -> None:
    await _login(client, "admin001")
    await _login(client, "han005")
    await _login(client, "han006")
    await _login(client, "alice")

    await client.post("/api/auth/logout")
    await _login(client, "admin001")

    # without elevation: 403
    r = await client.get("/api/admin/users")
    assert r.status_code == 403

    await client.post(
        "/api/admin/elevate",
        json={"secret": "super-secret-admin-token"},
    )

    # no q → all users (most recent login first)
    r = await client.get("/api/admin/users")
    assert r.status_code == 200
    payload = r.json()
    work_ids = [u["work_id"] for u in payload]
    assert set(work_ids) >= {"admin001", "han005", "han006", "alice"}

    # q matches by work_id substring
    r = await client.get("/api/admin/users?q=han")
    assert r.status_code == 200
    payload = r.json()
    work_ids = {u["work_id"] for u in payload}
    assert work_ids == {"han005", "han006"}

    # q is case-insensitive
    r = await client.get("/api/admin/users?q=ALI")
    assert r.status_code == 200
    payload = r.json()
    assert len(payload) == 1
    assert payload[0]["work_id"] == "alice"

    # q with no match
    r = await client.get("/api/admin/users?q=zzz_no_match")
    assert r.status_code == 200
    assert r.json() == []


async def test_admin_storage_summary(client: AsyncClient, session) -> None:
    from datetime import timedelta

    await _login(client, "admin001")
    user = await _login(client, "han004")

    now = datetime.now(timezone.utc)
    fresh = now - timedelta(days=1)
    expired_upload = now - timedelta(days=10)  # past 7d retention
    expired_output = now - timedelta(days=40)  # past 30d retention

    rows = [
        File(
            user_id=user["id"],
            kind="upload",
            path="uploads/han004/a.png",
            mime_type="image/png",
            size_bytes=1024,
            created_at=fresh,
        ),
        File(
            user_id=user["id"],
            kind="upload",
            path="uploads/han004/b.png",
            mime_type="image/png",
            size_bytes=2048,
            created_at=expired_upload,
        ),
        File(
            user_id=user["id"],
            kind="output",
            path="outputs/han004/c.png",
            mime_type="image/png",
            size_bytes=4096,
            created_at=fresh,
        ),
        File(
            user_id=user["id"],
            kind="output",
            path="outputs/han004/d.png",
            mime_type="image/png",
            size_bytes=8192,
            created_at=expired_output,
        ),
    ]
    session.add_all(rows)
    await session.commit()

    await client.post("/api/auth/logout")
    await _login(client, "admin001")

    # without elevation: 403
    r = await client.get("/api/admin/storage")
    assert r.status_code == 403

    await client.post(
        "/api/admin/elevate",
        json={"secret": "super-secret-admin-token"},
    )

    r = await client.get("/api/admin/storage")
    assert r.status_code == 200
    payload = r.json()
    assert payload["uploads"]["file_count"] == 2
    assert payload["uploads"]["bytes"] == 1024 + 2048
    assert payload["uploads"]["expired_count"] == 1
    assert payload["uploads"]["retention_days"] == 7
    assert payload["outputs"]["file_count"] == 2
    assert payload["outputs"]["bytes"] == 4096 + 8192
    assert payload["outputs"]["expired_count"] == 1
    assert payload["outputs"]["retention_days"] == 30
    assert payload["cleanup_implemented"] is False


async def test_admin_generation_detail(client: AsyncClient, session) -> None:
    await _login(client, "admin001")
    user = await _login(client, "han003")

    now = datetime.now(timezone.utc)
    gen = Generation(
        user_id=user["id"],
        action="generate",
        status="failed",
        prompt="detail test",
        params=json.dumps({"size": "square", "quality": "high", "n": 1}),
        revised_prompt="rewritten",
        error_code="content_policy",
        error_message="blocked by policy",
        created_at=now,
        completed_at=now,
    )
    session.add(gen)
    await session.commit()
    await session.refresh(gen)

    await client.post("/api/auth/logout")
    await _login(client, "admin001")

    # Without elevation: 403
    r = await client.get(f"/api/admin/generations/{gen.id}")
    assert r.status_code == 403

    await client.post(
        "/api/admin/elevate",
        json={"secret": "super-secret-admin-token"},
    )

    r = await client.get(f"/api/admin/generations/{gen.id}")
    assert r.status_code == 200
    payload = r.json()
    assert payload["work_id"] == "han003"
    assert payload["action"] == "generate"
    assert payload["status"] == "failed"
    assert payload["prompt"] == "detail test"
    assert payload["revised_prompt"] == "rewritten"
    assert payload["error_code"] == "content_policy"
    assert payload["error_message"] == "blocked by policy"
    assert payload["output_files"] == []
    assert payload["reference_files"] == []

    # Unknown id → 404
    r = await client.get("/api/admin/generations/nonexistent-id")
    assert r.status_code == 404


async def test_admin_stats_aggregate_counts(client: AsyncClient, session) -> None:
    admin = await _login(client, "admin001")
    user = await _login(client, "han002")

    now = datetime.now(timezone.utc)
    rows = [
        Generation(
            user_id=admin["id"],
            action="generate",
            status="completed",
            prompt="ok",
            params=json.dumps({"size": "square", "quality": "high", "n": 1}),
            created_at=now,
            completed_at=now,
        ),
        Generation(
            user_id=user["id"],
            action="edit",
            status="failed",
            prompt="bad",
            params=json.dumps({"size": "square", "quality": "high", "n": 1}),
            error_code="upstream_error",
            error_message="proxy down",
            created_at=now,
            completed_at=now,
        ),
    ]
    session.add_all(rows)
    await session.commit()

    await client.post("/api/auth/logout")
    await _login(client, "admin001")
    await client.post(
        "/api/admin/elevate",
        json={"secret": "super-secret-admin-token"},
    )

    r = await client.get("/api/admin/stats")
    assert r.status_code == 200
    payload = r.json()
    assert payload["today"]["total"]["total"] == 2
    assert payload["today"]["total"]["failed"] == 1
    assert payload["today"]["generate"]["total"] == 1
    assert payload["today"]["generate"]["failed"] == 0
    assert payload["today"]["edit"]["total"] == 1
    assert payload["today"]["edit"]["failed"] == 1
    assert payload["month"]["total"]["total"] == 2
    assert payload["month"]["total"]["failed"] == 1
    top_by_wid = {u["work_id"]: u for u in payload["top_users"]}
    assert top_by_wid["admin001"]["generate"] == 1
    assert top_by_wid["admin001"]["edit"] == 0
    assert top_by_wid["han002"]["edit"] == 1
    assert top_by_wid["han002"]["generate"] == 0
    assert payload["recent_failures"][0]["work_id"] == "han002"
    assert payload["recent_failures"][0]["error_code"] == "upstream_error"
    assert len(payload["last_7_days"]) == 7
    today_iso = datetime.now(timezone.utc).date().isoformat()
    assert payload["last_7_days"][-1]["date"] == today_iso
    assert payload["last_7_days"][-1]["total"] == 2
    assert payload["last_7_days"][-1]["failed"] == 1
    # earliest day in window has zeros (no fixtures backdated)
    assert payload["last_7_days"][0]["total"] == 0
