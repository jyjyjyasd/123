import pytest
from httpx import AsyncClient
from app.models import AgentSession
from sqlalchemy import select
import json

pytestmark = pytest.mark.asyncio

async def _login(client: AsyncClient, work_id: str) -> dict:
    r = await client.post("/api/auth/login", json={"work_id": work_id})
    assert r.status_code == 200, r.text
    return r.json()

async def test_refresh_copy_endpoint(client: AsyncClient, session) -> None:
    me = await _login(client, "han001")
    
    # 1. Create a session
    r = await client.post("/api/agent/sessions")
    assert r.status_code == 201
    session_id = r.json()["session_id"]

    # Mock some messages to seed initial user prompt
    s_row = (await session.execute(select(AgentSession).where(AgentSession.id == session_id))).scalar_one()
    s_row.clarify_messages = json.dumps([
        {
            "id": "msg1",
            "role": "user",
            "content": "帮我做一张极简风的夏日草莓市集海报，文案是‘甜美多汁的草莓盛宴’",
            "timestamp": "2026-06-11T00:00:00Z"
        }
    ])
    await session.commit()

    # 2. Call the refresh-copy endpoint
    from unittest.mock import AsyncMock
    import app.agent.llm_client
    
    # We patch refresh_copy_text to return a mock string
    app.agent.llm_client.refresh_copy_text = AsyncMock(return_value="草莓市集 | 6月15日")

    payload = {
        "density": "疏",
        "current_copy": "甜美多汁的草莓盛宴 | 6月15日相聚大都会",
        "selected_style_name": "极简日系",
        "selected_style_desc": "留白与网格"
    }

    resp = await client.post(f"/api/agent/sessions/{session_id}/refresh-copy", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "refreshed_copy" in data
    assert data["refreshed_copy"] == "草莓市集 | 6月15日"

    # Verify refresh_copy_text was called with correct params
    app.agent.llm_client.refresh_copy_text.assert_called_once_with(
        density="疏",
        current_copy="甜美多汁的草莓盛宴 | 6月15日相聚大都会",
        aspect_ratio="1:1",
        selected_style_name="极简日系",
        selected_style_desc="留白与网格",
        initial_user_prompt="帮我做一张极简风的夏日草莓市集海报，文案是‘甜美多汁的草莓盛宴’",
        poster_strategy=None,
    )

    # 3. Verify that density and copy are persisted in the database session.stream_a
    await session.close()  # Close active session and query a clean one
    db_session = (await session.execute(select(AgentSession).where(AgentSession.id == session_id))).scalar_one()
    stream_a_data = json.loads(db_session.stream_a)
    assert stream_a_data["density"] == "疏"
    assert stream_a_data["copy"] == "草莓市集 | 6月15日"
