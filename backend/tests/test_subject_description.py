import json
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import AgentSession
from app.agent.skill_runner import get_subject_description, session_to_dict

pytestmark = pytest.mark.asyncio


async def test_session_description_logic(client: AsyncClient, session) -> None:
    # 1. Login
    r = await client.post("/api/auth/login", json={"work_id": "test_naming_user"})
    assert r.status_code == 200
    user_id = r.json()["id"]

    # 2. Blank session (new session) should return None
    s_blank = AgentSession(
        user_id=user_id,
        status="init",
        aspect_ratio="1:1",
        resolution="1k",
    )
    assert get_subject_description(s_blank) is None

    # 3. Session with messages (user prompt fallback)
    s_msgs = AgentSession(
        user_id=user_id,
        status="clarifying",
        clarify_messages=json.dumps([
            {"id": "1", "role": "assistant", "content": "您好，我是设计助理。", "timestamp": "2026-08-02T12:00:00Z"},
            {"id": "2", "role": "user", "content": "  # 想要设计一款猫粮促销的海报\n第二行内容很长很长很长", "timestamp": "2026-08-02T12:00:05Z"}
        ], ensure_ascii=False)
    )
    # 第一行，过滤 #，首尾空格，截断至 12 个字内
    assert get_subject_description(s_msgs) == "想要设计一款猫粮促销的海..."

    # 4. Session with design_json containing headline
    s_design = AgentSession(
        user_id=user_id,
        status="prompting",
        design_json=json.dumps({
            "copy": [
                {"text": "超长标题大促销一二三四五六七八九十", "role": "headline", "level": 1},
                {"text": "副标题", "role": "other", "level": 2}
            ]
        }, ensure_ascii=False)
    )
    # 从 design_json 提取 headline，截断至 15 个字内
    assert get_subject_description(s_design) == "超长标题大促销一二三四五六七八..."

    # 5. Verify session_to_dict contains subject_description
    d = session_to_dict(s_msgs)
    assert d["subject_description"] == "想要设计一款猫粮促销的海..."

    # 6. Verify GET sessions API returns subject_description
    session.add(s_msgs)
    await session.commit()
    await session.refresh(s_msgs)

    resp = await client.get(f"/api/agent/sessions/{s_msgs.id}")
    assert resp.status_code == 200
    assert resp.json()["subject_description"] == "想要设计一款猫粮促销的海..."
