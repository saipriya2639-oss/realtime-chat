from __future__ import annotations
import os
from typing import Optional, List, Dict

from sqlalchemy import String, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

class Base(DeclarativeBase):
    pass

class Presence(Base):
    __tablename__ = "presence"
    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(16))  # "online" | "offline"

engine = None
SessionLocal: Optional[async_sessionmaker[AsyncSession]] = None

async def init_db():
    """Initialize DB if DATABASE_URL is set; otherwise, leave engine/session None (fallback to memory)."""
    global engine, SessionLocal
    if not DATABASE_URL:
        return
    engine = create_async_engine(DATABASE_URL, echo=False, future=True)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def set_presence(user_id: str, username: str, status: str):
    if not SessionLocal:
        return
    async with SessionLocal() as session:
        row = await session.get(Presence, user_id)
        if row is None:
            row = Presence(user_id=user_id, username=username, status=status)
            session.add(row)
        else:
            row.username = username
            row.status = status
        await session.commit()

async def get_online_users() -> List[Dict[str, str]]:
    if not SessionLocal:
        return []
    async with SessionLocal() as session:
        res = await session.execute(select(Presence).where(Presence.status == "online"))
        rows = res.scalars().all()
        return [{"user_id": r.user_id, "username": r.username} for r in rows]
