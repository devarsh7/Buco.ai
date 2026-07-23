from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from db.supabase import (
    get_conversation,
    list_conversations,
    rename_conversation,
    delete_conversation,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


class RenamePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)


@router.get("/")
async def get_conversations(user_id: str = Query(...), limit: int = Query(default=30, le=100)):
    """List a user's conversations, most recent first."""
    conversations = await list_conversations(user_id=user_id, limit=limit)
    return {
        "conversations": [
            {
                "id": c["id"],
                "title": c.get("title") or _preview(c),
                "created_at": c.get("created_at"),
                "updated_at": c.get("updated_at"),
            }
            for c in conversations
        ]
    }


@router.get("/{session_id}")
async def get_one(session_id: str):
    conv = await get_conversation(session_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.patch("/{session_id}")
async def rename(session_id: str, payload: RenamePayload):
    ok = await rename_conversation(session_id, payload.title.strip())
    if not ok:
        raise HTTPException(status_code=500, detail="Could not rename conversation")
    return {"success": True}


@router.delete("/{session_id}")
async def delete(session_id: str):
    ok = await delete_conversation(session_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Could not delete conversation")
    return {"success": True}


def _preview(conv: dict) -> str:
    messages = conv.get("messages") or []
    for m in messages:
        if m.get("role") == "user":
            return (m.get("content") or "")[:60]
    return "New chat"
