import json
from unittest.mock import patch
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import AgentSession, User


pytestmark = pytest.mark.asyncio


async def test_refresh_styles_decoupling(client: AsyncClient, session) -> None:
    # 1. Login to get user
    r = await client.post("/api/auth/login", json={"work_id": "han001"})
    assert r.status_code == 200
    user_data = r.json()
    user_id = user_data["id"]

    # 2. Insert an AgentSession with some layout recommendations
    initial_layout_recs = [
        {"index": 1, "name": "Layout Old", "layout_notes": "Old Notes"}
    ]
    initial_style_recs = [
        {"index": 1, "name": "Style Old", "description": "Old Style"}
    ]

    agent_session = AgentSession(
        user_id=user_id,
        status="clarifying",
        aspect_ratio="1:1",
        resolution="1k",
        stream_a=json.dumps({
            "copy": "Old Copy",
            "layout_notes": "Old Notes",
            "layout_prompt": "Old Layout Prompt",
            "layout_recommendations": initial_layout_recs
        }),
        stream_b=json.dumps({
            "visual_description": "Old Visual",
            "style_recommendations": initial_style_recs
        }),
        clarify_messages=json.dumps([])
    )
    session.add(agent_session)
    await session.commit()
    await session.refresh(agent_session)

    session_id = agent_session.id

    # 3. Prepare mock LLM stream output that attempts to return new layout recommendations and new style recommendations
    mock_structured = {
        "status": "clarifying",
        "stream_a": {
            "copy": "New Copy",
            "layout_notes": "New Notes",
            "layout_prompt": "New Layout Prompt",
            "layout_recommendations": [
                {"index": 1, "name": "Layout New", "layout_notes": "New Notes"}
            ]
        },
        "stream_b": {
            "visual_description": "New Visual",
            "style_recommendations": [
                {"index": 1, "name": "Style New", "description": "New Style"}
            ]
        }
    }

    # An async generator mimicking stream_chat
    async def mock_stream_chat(*args, **kwargs):
        assert kwargs.get("is_refresh_styles") is True
        yield "Chunk 1", None
        yield "Chunk 2", mock_structured

    # 4. Patch stream_chat and call POST /api/agent/sessions/{session_id}/refresh_styles
    with patch("app.agent.llm_client.stream_chat", side_effect=mock_stream_chat):
        resp = await client.post(f"/api/agent/sessions/{session_id}/refresh-styles")
        assert resp.status_code == 200, resp.text

    # 5. Fetch from DB and verify state
    # We must expire the session's objects or use a new session transaction,
    # conftest session fixture keeps expire_on_commit=False, so let's execute select query.
    res = await session.execute(select(AgentSession).where(AgentSession.id == session_id))
    updated_session = res.scalar_one()

    stream_a = json.loads(updated_session.stream_a)
    stream_b = json.loads(updated_session.stream_b)

    # layout_recommendations, copy and layout_notes must stay as initial values
    assert stream_a["layout_recommendations"] == initial_layout_recs
    assert stream_a["copy"] == "Old Copy"
    assert stream_a["layout_notes"] == "Old Notes"

    # style_recommendations must be updated to mock_structured values
    assert stream_b["style_recommendations"] == [
        {"index": 1, "name": "Style New", "description": "New Style"}
    ]
    # visual_description must be untouched (retains Old Visual)
    assert stream_b["visual_description"] == "Old Visual"
