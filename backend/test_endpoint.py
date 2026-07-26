import asyncio
import traceback
import json
from sqlalchemy import select
from app.db import SessionLocal
from app.models import AgentSession, User
from app.agent.skill_runner import extend_poster_parallel
from app.routers.agent_sessions import _to_out

async def main():
    async with SessionLocal() as db:
        session_id = "8d46019b-aee9-4233-bda0-3994424147a6"
        s = (await db.execute(select(AgentSession).where(AgentSession.id == session_id))).scalar_one()
        user = (await db.execute(select(User).where(User.id == s.user_id))).scalar_one()
        
        print(f"Testing extend_poster and _to_out for session: {s.id}")
        try:
            updated_s = await extend_poster_parallel(
                s,
                ratios=["9:16", "16:9"],
                resolution="1k",
                base_image_url=None,
                user=user,
                db=db
            )
            print("Successfully extended. Now calling _to_out...")
            out = _to_out(updated_s)
            print("Successfully serialized!")
            print(f"Serialized Output: {out.model_dump_json(indent=2)}")
        except Exception as e:
            print("Failed with exception:")
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
