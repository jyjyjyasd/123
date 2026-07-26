import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.agent.llm_client import audit_user_intent

@pytest.mark.asyncio
async def test_audit_user_intent_with_has_files() -> None:
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json = MagicMock(return_value={
        "choices": [
            {
                "message": {
                    "content": '{"rich": true, "reason": "user uploaded files", "position": "默认海报", "purpose": "视觉呈现", "question": null, "quick_replies": null}'
                }
            }
        ]
    })

    with patch("httpx.AsyncClient.post", return_value=mock_response) as mock_post:
        res = await audit_user_intent("端午节", has_files=True)
        assert res["rich"] is True
        assert res["position"] == "默认海报"
        assert res["purpose"] == "视觉呈现"
        
        # Verify has_files=true was sent in user prompt
        args, kwargs = mock_post.call_args
        payload = kwargs["json"]
        user_message_content = payload["messages"][1]["content"]
        assert "(has_files): true" in user_message_content
