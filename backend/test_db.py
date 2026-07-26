import asyncio
from sqlalchemy import select
from app.db import SessionLocal
from app.models import AgentSession, User, Generation

async def main():
    async with SessionLocal() as session:
        # Find all agent sessions
        res = await session.execute(select(AgentSession).order_by(AgentSession.updated_at.desc()))
        sessions = res.scalars().all()
        print(f"Total agent sessions: {len(sessions)}")
        for s in sessions[:5]:
            print(f"ID: {s.id}, Status: {s.status}, Gen ID: {s.generation_id}")
            
if __name__ == "__main__":
    asyncio.run(main())
