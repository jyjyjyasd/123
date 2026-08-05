import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AgentSession


@pytest.mark.asyncio
async def test_batch_delete_agent_sessions(client: AsyncClient, session: AsyncSession) -> None:
    # 1. 登录用户 A (han001)
    login_a = await client.post("/api/auth/login", json={"work_id": "han001"})
    assert login_a.status_code == 200
    cookies_a = login_a.cookies

    # 2. 创建 3 个会话
    session_ids = []
    for _ in range(3):
        create_resp = await client.post("/api/agent/sessions", cookies=cookies_a)
        assert create_resp.status_code == 201
        session_ids.append(create_resp.json()["session_id"])

    # 3. 登录用户 B (han002) 并创建一个会话作为干扰项
    login_b = await client.post("/api/auth/login", json={"work_id": "han002"})
    assert login_b.status_code == 200
    cookies_b = login_b.cookies

    create_b_resp = await client.post("/api/agent/sessions", cookies=cookies_b)
    assert create_b_resp.status_code == 201
    session_b_id = create_b_resp.json()["session_id"]

    # 4. 回到用户 A，尝试删除自己的 2 个会话以及用户 B 的 1 个会话 (越权操作)
    # 应只删除自己那 2 个，B 的会话不受影响
    target_delete_ids = [session_ids[0], session_ids[1], session_b_id]
    
    delete_resp = await client.post(
        "/api/agent/sessions/batch-delete",
        json={"session_ids": target_delete_ids},
        cookies=cookies_a,
    )
    assert delete_resp.status_code == 204

    # 5. 校验数据库中的软删除状态
    # A 的第 1、2 个会话应被软删除 (deleted_at is not None)
    stmt_deleted = select(AgentSession).where(
        AgentSession.id.in_([session_ids[0], session_ids[1]])
    )
    deleted_rows = (await session.execute(stmt_deleted)).scalars().all()
    assert len(deleted_rows) == 2
    for s in deleted_rows:
        assert s.deleted_at is not None

    # A 的第 3 个会话没有被删 (deleted_at is None)
    stmt_kept = select(AgentSession).where(AgentSession.id == session_ids[2])
    kept_s = (await session.execute(stmt_kept)).scalar_one()
    assert kept_s.deleted_at is None

    # B 的会话不应该被 A 删掉 (deleted_at remains None)
    stmt_b = select(AgentSession).where(AgentSession.id == session_b_id)
    b_s = (await session.execute(stmt_b)).scalar_one()
    assert b_s.deleted_at is None

    # 6. 校验 A 的列表 API，应该只剩下第 3 个会话
    list_resp = await client.get("/api/agent/sessions", cookies=cookies_a)
    assert list_resp.status_code == 200
    list_body = list_resp.json()
    active_ids = [s["id"] for s in list_body]
    
    assert session_ids[0] not in active_ids
    assert session_ids[1] not in active_ids
    assert session_ids[2] in active_ids
