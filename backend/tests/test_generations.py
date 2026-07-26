"""create_generation 入参校验测试 —— 多图参考图（1–5 张）+ file_id 链接路径。

参考图自 v0.4 起从 multipart 改为先 POST /api/uploads 拿 file_id 再带回来。
为避开真实 proxy，这里只测同步发生的 4xx 校验路径；成功路径会触发
BackgroundTask 去打 http://mock 的代理（必然失败），但不影响 202 本身。
"""
from __future__ import annotations

import json

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import File, Generation


pytestmark = pytest.mark.asyncio


_PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000d49444154789c63f8cf000000010001005c2eafd60000000049454e"
    "44ae426082"
)


async def _login(client: AsyncClient, work_id: str) -> dict:
    r = await client.post("/api/auth/login", json={"work_id": work_id})
    assert r.status_code == 200, r.text
    return r.json()


async def _upload(client: AsyncClient, name: str = "ref.png") -> str:
    r = await client.post(
        "/api/uploads",
        files={"file": (name, _PNG_1PX, "image/png")},
    )
    assert r.status_code == 201, r.text
    return r.json()["file_id"]


async def _create_edit(
    client: AsyncClient,
    *,
    file_ids: list[str],
    prompt: str = "把这两张图合成一张",
):
    return await client.post(
        "/api/generations",
        data={
            "action": "edit",
            "prompt": prompt,
            "size": "1:1",
            # httpx flattens list values into repeated form fields
            "reference_file_ids": file_ids,
        },
    )


async def test_edit_rejects_when_no_reference(client: AsyncClient) -> None:
    await _login(client, "han001")
    r = await _create_edit(client, file_ids=[])
    assert r.status_code == 400
    assert r.json()["detail"]["error"]["code"] == "invalid_input"
    assert "至少 1 张" in r.json()["detail"]["error"]["message"]


async def test_edit_rejects_more_than_5_references(client: AsyncClient) -> None:
    await _login(client, "han001")
    file_ids = [await _upload(client, f"r{i}.png") for i in range(6)]
    r = await _create_edit(client, file_ids=file_ids)
    assert r.status_code == 400
    err = r.json()["detail"]["error"]
    assert err["code"] == "invalid_input"
    assert "最多 5 张" in err["message"]


async def test_edit_rejects_unknown_file_id(client: AsyncClient) -> None:
    await _login(client, "han001")
    r = await _create_edit(client, file_ids=["00000000-0000-0000-0000-000000000000"])
    assert r.status_code == 400
    err = r.json()["detail"]["error"]
    assert err["code"] == "invalid_input"


async def test_edit_rejects_other_users_file_id(client: AsyncClient) -> None:
    """A user must not be able to attach another user's uploaded file."""
    # User A uploads
    await _login(client, "alice001")
    a_file_id = await _upload(client)
    # Switch to user B (re-login overwrites cookie)
    await _login(client, "bob001")
    r = await _create_edit(client, file_ids=[a_file_id])
    assert r.status_code == 400
    err = r.json()["detail"]["error"]
    assert err["code"] == "invalid_input"


async def test_edit_accepts_multiple_references_persists_ids(
    client: AsyncClient, session
) -> None:
    """成功路径：2 张参考图都进 DB；reference_file_ids 是 JSON 数组。"""
    await _login(client, "han001")
    f1 = await _upload(client, "a.png")
    f2 = await _upload(client, "b.png")
    r = await _create_edit(client, file_ids=[f1, f2])
    assert r.status_code == 202, r.text
    job_id = r.json()["job_id"]

    gen = (
        await session.execute(select(Generation).where(Generation.id == job_id))
    ).scalar_one()
    assert gen.action == "edit"
    assert gen.reference_file_ids is not None
    ref_ids = json.loads(gen.reference_file_ids)
    assert ref_ids == [f1, f2]


async def test_generate_ignores_stray_reference_file_ids(
    client: AsyncClient, session
) -> None:
    """generate-mode: leaked file ids are dropped, not persisted."""
    await _login(client, "han001")
    f1 = await _upload(client)
    r = await client.post(
        "/api/generations",
        data={
            "action": "generate",
            "prompt": "a cat",
            "size": "1:1",
            "reference_file_ids": [f1],
        },
    )
    assert r.status_code == 202, r.text
    job_id = r.json()["job_id"]
    gen = (
        await session.execute(select(Generation).where(Generation.id == job_id))
    ).scalar_one()
    assert gen.action == "generate"
    assert gen.reference_file_ids is None


async def test_get_generation_returns_reference_files(client: AsyncClient) -> None:
    """GET /api/generations/{id} 必须吐出 reference_files —— 详情页要展示参考图缩略图。"""
    await _login(client, "han001")
    f1 = await _upload(client, "a.png")
    f2 = await _upload(client, "b.png")
    r = await _create_edit(client, file_ids=[f1, f2])
    assert r.status_code == 202, r.text
    job_id = r.json()["job_id"]

    detail = await client.get(f"/api/generations/{job_id}")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert [rf["file_id"] for rf in body["reference_files"]] == [f1, f2]
    for rf in body["reference_files"]:
        assert rf["url"] == f"/api/files/{rf['file_id']}"


async def test_get_generation_omits_reference_files_for_generate(
    client: AsyncClient,
) -> None:
    await _login(client, "han001")
    r = await client.post(
        "/api/generations",
        data={
            "action": "generate",
            "prompt": "a cat",
            "size": "1:1",
        },
    )
    assert r.status_code == 202, r.text
    job_id = r.json()["job_id"]
    detail = await client.get(f"/api/generations/{job_id}")
    assert detail.status_code == 200
    assert detail.json()["reference_files"] == []


async def test_uploaded_file_is_fetchable_by_owner(client: AsyncClient) -> None:
    """Sanity: file uploaded via /api/uploads is served back via /api/files/{id}."""
    await _login(client, "han001")
    fid = await _upload(client)
    r = await client.get(f"/api/files/{fid}")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/png")
    assert r.content == _PNG_1PX
