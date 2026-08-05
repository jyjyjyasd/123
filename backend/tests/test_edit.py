import json
from unittest.mock import patch, AsyncMock
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models import AgentSession, File, Generation, User

pytestmark = pytest.mark.asyncio

_PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000d49444154789c63f8cf000000010001005c2eafd60000000049454e"
    "44ae426082"
)


async def test_direct_edit_flow(client: AsyncClient, session) -> None:
    # 1. Login
    r = await client.post("/api/auth/login", json={"work_id": "han001"})
    assert r.status_code == 200
    user_data = r.json()
    user_id = user_data["id"]

    # 2. Upload an annotated image
    upload_resp = await client.post(
        "/api/uploads",
        files={"file": ("annotated.png", _PNG_1PX, "image/png")},
    )
    assert upload_resp.status_code == 201
    file_id = upload_resp.json()["file_id"]

    # 3. Create an existing Generation to act as the primary master poster
    primary_gen = Generation(
        user_id=user_id,
        action="generate",
        status="completed",
        prompt="Initial prompt",
        params=json.dumps({"size": "1:1", "resolution": "1k"}),
        output_file_ids=json.dumps([file_id]),
    )
    session.add(primary_gen)
    await session.commit()
    await session.refresh(primary_gen)

    # 4. Create an AgentSession with a completed generation ID
    agent_session = AgentSession(
        user_id=user_id,
        status="review",
        aspect_ratio="1:1",
        resolution="1k",
        generation_id=primary_gen.id,
        primary_ratio="1:1",
        primary_resolution="1k",
        stream_a=json.dumps({"copy": "Test Copy", "layout_notes": "Test layout notes"}),
        stream_b=json.dumps({"visual_description": "Initial design"}),
        clarify_messages=json.dumps([
            {"id": "msg-1", "role": "user", "content": "hello", "timestamp": "2026-07-08T00:00:00Z"},
            {"id": "msg-2", "role": "assistant", "content": "hi", "timestamp": "2026-07-08T00:00:01Z"}
        ])
    )
    session.add(agent_session)
    await session.commit()
    await session.refresh(agent_session)

    session_id = agent_session.id

    # 5. Patch rewrite_prompt_for_edit and background job execution
    mock_rewrite = AsyncMock(return_value="Rewritten final prompt based on annotation")
    
    with patch("app.agent.llm_client.rewrite_prompt_for_edit", mock_rewrite), \
         patch("app.jobs.run_generation_job", AsyncMock()) as mock_job:
        
        resp = await client.post(
            f"/api/agent/sessions/{session_id}/edit",
            json={
                "edit_description": "make the main object larger",
                "subject_file_id": file_id,
                "size": "9:16",
                "resolution": "2k",
            }
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "generating"

    # 6. Verify database side-effects
    res = await session.execute(select(AgentSession).where(AgentSession.id == session_id))
    updated_session = res.scalar_one()

    # Final prompt is updated
    assert updated_session.final_prompt == "Rewritten final prompt based on annotation"
    
    # Old image is NOT archived, but is in extended_images
    assert updated_session.archived_images is None
    extended = json.loads(updated_session.extended_images)
    assert len(extended) == 1
    assert extended[0]["generation_id"] == primary_gen.id
    assert extended[0]["source"] == "primary"

    # Clarify messages are NOT modified (isolated)
    messages = json.loads(updated_session.clarify_messages)
    assert len(messages) == 2
    assert messages[0]["content"] == "hello"

    # Verify a new Generation row was created with action="edit"
    new_gen_id = updated_session.generation_id
    gen_res = await session.execute(select(Generation).where(Generation.id == new_gen_id))
    new_gen = gen_res.scalar_one()
    assert new_gen.action == "edit"
    assert new_gen.status == "pending"
    assert json.loads(new_gen.reference_file_ids) == [file_id]
    # Size/resolution must come from the request body (current image), NOT from session.aspect_ratio / session.resolution
    params = json.loads(new_gen.params)
    assert params["size"] == "9:16"
    assert params["resolution"] == "2k"
    # session.aspect_ratio is "1:1" — verify it was NOT used
    assert params["size"] != agent_session.aspect_ratio

    # Verify job runner was launched
    mock_job.assert_called_once_with(new_gen.id)
