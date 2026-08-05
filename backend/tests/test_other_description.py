import json
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.agent.skill_runner import compile_prompt
from app.models import AgentSession

@pytest.mark.asyncio
async def test_other_image_uses_user_description_not_vision_llm(
    client: AsyncClient, session
) -> None:
    # 1️⃣ 登录
    login = await client.post("/api/auth/login", json={"work_id": "han001"})
    assert login.status_code == 200
    cookies = login.cookies
    user_id = login.json()["id"]

    # 2️⃣ 创建一个 AgentSession 并存入 DB
    s = AgentSession(
        user_id=user_id,
        status="init",
        aspect_ratio="1:1",
        resolution="1k",
        clarify_messages=json.dumps([]),
    )
    session.add(s)
    await session.commit()
    await session.refresh(s)

    # 3️⃣ 上传一个 "other" 类型的图片（1×1 PNG）
    png_data = bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
        "0000000d49444154789c63f8cf000000010001005c2eafd60000000049454e44ae426082"
    )
    upload_resp = await client.post(
        "/api/uploads",
        files={"file": ("other.png", png_data, "image/png")},
        cookies=cookies,
    )
    assert upload_resp.status_code == 201
    upload_body = upload_resp.json()
    file_id = upload_body["file_id"]

    # 4️⃣ 手动把该文件作为 "other" 材料加入会话，带 description
    stream_b = {
        "subject_materials": [
            {
                "id": "mat-1",
                "url": f"/api/files/{file_id}",
                "type": "other",
                "description": "展示品牌标语",
            }
        ]
    }
    s.stream_b = json.dumps(stream_b, ensure_ascii=False)
    await session.commit()

    # 5️⃣ 验证 compile_prompt 使用用户提供的 description，并且 Vision LLM 未被调用
    with patch("app.agent.llm_client.describe_reference_image") as mock_desc:
        prompt = await compile_prompt(s, db=session)
        assert "展示品牌标语" in prompt
        mock_desc.assert_not_called()
