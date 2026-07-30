import json
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import AgentSession
from app.agent.skill_runner import session_to_dict

pytestmark = pytest.mark.asyncio


async def test_design_json_aggregation_and_api(client: AsyncClient, session) -> None:
    # 1. Login
    r = await client.post("/api/auth/login", json={"work_id": "test_user_design_json"})
    assert r.status_code == 200
    user_id = r.json()["id"]

    # 2. Create an AgentSession in prompting status with stream_a and stream_b
    sa_data = {
        "copy": "主标题文字 | 副标题说明 | 底部按钮",
        "layout_notes": "居中排版",
        "layout_recommendations": [{"index": 1, "name": "Layout 1", "layout_notes": "居中"}]
    }
    sb_data = {
        "visual_description": "Cyberpunk neon theme",
        "style_recommendations": [{"index": 1, "name": "Cyberpunk", "description": "Neon style"}]
    }
    agent_session = AgentSession(
        user_id=user_id,
        status="prompting",
        aspect_ratio="1:1",
        resolution="1k",
        stream_a=json.dumps(sa_data, ensure_ascii=False),
        stream_b=json.dumps(sb_data, ensure_ascii=False),
        clarify_messages=json.dumps([]),
        design_json=json.dumps({
            "copy": {
                "raw": "主标题文字 | 副标题说明 | 底部按钮",
                "segments": [
                    {"text": "主标题文字", "role": "headline", "level": 1},
                    {"text": "副标题说明", "role": "other", "level": 2},
                    {"text": "底部按钮", "role": "other", "level": 2}
                ]
            },
            "visual": {
                "description_en": "Cyberpunk neon theme",
                "palette": [],
                "mood": []
            },
            "layout": {
                "description": "居中排版",
                "structure": [],
                "global_notes": ""
            },
            "recommendations": {
                "styles": [{"index": 1, "name": "Cyberpunk", "description": "Neon style"}],
                "layouts": [{"index": 1, "name": "Layout 1", "layout_notes": "居中"}]
            },
            "missing_fields": []
        }, ensure_ascii=False)
    )
    session.add(agent_session)
    await session.commit()
    await session.refresh(agent_session)

    # 3. Test GET session endpoint returns parsed design_json dict
    resp = await client.get(f"/api/agent/sessions/{agent_session.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["design_json"] is not None
    assert data["design_json"]["copy"]["raw"] == "主标题文字 | 副标题说明 | 底部按钮"
    assert len(data["design_json"]["copy"]["segments"]) == 3
    assert data["design_json"]["copy"]["segments"][0]["text"] == "主标题文字"
    assert data["design_json"]["copy"]["segments"][0]["role"] == "headline"
    assert data["design_json"]["visual"]["description_en"] == "Cyberpunk neon theme"
    assert len(data["design_json"]["recommendations"]["styles"]) == 1


async def test_legacy_session_design_json_null(client: AsyncClient, session) -> None:
    # Login
    r = await client.post("/api/auth/login", json={"work_id": "test_user_legacy"})
    assert r.status_code == 200
    user_id = r.json()["id"]

    # Create a legacy session without design_json
    agent_session = AgentSession(
        user_id=user_id,
        status="prompting",
        aspect_ratio="1:1",
        resolution="1k",
        stream_a=json.dumps({"copy": "Legacy copy"}),
        stream_b=json.dumps({"visual_description": "Legacy visual"}),
        design_json=None,
    )
    session.add(agent_session)
    await session.commit()

    resp = await client.get(f"/api/agent/sessions/{agent_session.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["design_json"] is None
