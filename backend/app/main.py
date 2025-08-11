from __future__ import annotations

import json
import os
import uuid
from typing import Literal

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---- DB helpers (must exist in app/db.py; see note below) ----
from .db import init_db, set_presence, get_online_users

# =================== Pydantic models ===================

class PresenceUser(BaseModel):
    user_id: str
    username: str

class PresencePayload(BaseModel):
    type: Literal["presence"]
    users: list[PresenceUser]

class MessageIn(BaseModel):
    type: Literal["message"]
    to: str
    text: str = Field(min_length=1, max_length=2000)

class MessageOut(MessageIn):
    # Python keyword "from" -> JSON alias
    from_: str = Field(alias="from")
    class Config:
        populate_by_name = True

# =================== FastAPI app ===================

app = FastAPI(title="Real-Time Chat")

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# in-memory fallback presence (used if DB is absent)
connections: dict[str, WebSocket] = {}   # user_id -> websocket
usernames: dict[str, str] = {}           # user_id -> username

# =================== Lifecycle ===================

@app.on_event("startup")
async def _startup():
    # Creates tables if DATABASE_URL is set; otherwise it no-ops (fallback to memory)
    await init_db()

# =================== REST ===================

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/users")
async def users():
    # Prefer DB presence if configured
    online = await get_online_users()
    if online:
        return online
    # Fallback to in-memory
    return [{"user_id": uid, "username": usernames.get(uid, uid)} for uid in connections.keys()]

# =================== Presence helpers ===================

async def _broadcast(payload: dict):
    dead: list[str] = []
    for uid, ws in list(connections.items()):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(uid)
    for uid in dead:
        connections.pop(uid, None)
        usernames.pop(uid, None)

async def broadcast_presence():
    users = [PresenceUser(user_id=uid, username=usernames.get(uid, uid)) for uid in connections.keys()]
    payload = PresencePayload(type="presence", users=users)
    await _broadcast(payload.model_dump())

async def send_to(target_user_id: str, message: dict):
    ws = connections.get(target_user_id)
    if ws:
        await ws.send_json(message)

# =================== WebSocket ===================

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()

    qp = ws.query_params
    user_id = qp.get("user_id") or str(uuid.uuid4())
    username = qp.get("username") or f"User-{user_id[:5]}"

    # register
    connections[user_id] = ws
    usernames[user_id] = username

    # record presence in DB if available
    await set_presence(user_id, username, "online")
    await broadcast_presence()

    try:
        while True:
            raw = await ws.receive_text()

            # allow either plain text or JSON
            try:
                data = json.loads(raw)
            except Exception:
                data = {"type": "message", "to": user_id, "text": str(raw)}

            if data.get("type") == "ping":
                await ws.send_json({"type": "pong"})
                continue

            if data.get("type") == "message":
                msg_in = MessageIn(**data)  # validate input
                msg_out = MessageOut(type="message", to=msg_in.to, text=msg_in.text, **{"from": user_id})
                await send_to(msg_out.to, msg_out.model_dump(by_alias=True))
            else:
                await ws.send_json({"type": "ack", "received": data})

    except WebSocketDisconnect:
        # cleanup & notify
        connections.pop(user_id, None)
        usernames.pop(user_id, None)
        await set_presence(user_id, username, "offline")
        await broadcast_presence()
