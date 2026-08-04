import json
import uuid
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from models.schemas import ChatRequest
from agent.graph import run_agent_stream
from agent.fastpath import extract_intent, should_fast_path, compose_answer, parse_travel_limit
from agent.tools import perform_search, CURRENT_USER_LOCATION, CURRENT_TRAVEL_LIMIT
from db.supabase import save_conversation_message, get_conversation

router = APIRouter(prefix="/chat", tags=["chat"])


def _shown_names(history: list[dict]) -> list[str]:
    names = []
    for m in history:
        for s in m.get("spots") or []:
            if s.get("name"):
                names.append(s["name"])
    return names


def _prev_user_message(history: list[dict]) -> str:
    for m in reversed(history):
        if m.get("role") == "user":
            return m.get("content") or ""
    return ""


async def _persist(request: ChatRequest, history: list[dict], text: str, spots: list):
    if not request.session_id or not (text or spots):
        return
    updated = history + [
        {"role": "user",      "content": request.message},
        {"role": "assistant", "content": text, "spots": spots},
    ]
    try:
        await save_conversation_message(
            session_id=request.session_id,
            user_id=request.user_id,
            messages=updated[-20:],
            title=history[0]["content"][:60] if history else request.message[:60],
        )
    except Exception:
        pass


async def _fast_stream(request: ChatRequest, history: list[dict], intent: dict):
    """Deterministic answer: search + template. One small LLM call total."""
    result = await perform_search(
        query=intent.get("query") or request.message[:60],
        location=request.city,
        price_max=float(intent.get("price_max") or 15),
        open_now=bool(intent.get("open_now")),
        happy_hour_now=bool(intent.get("happy_hour")),
        party_size=int(intent.get("party_size") or 1),
        max_distance_km=float(intent.get("radius_km") or 0),
        exclude_names=intent.get("exclude") or [],
    )
    spots = result.get("spots", [])
    text = compose_answer(intent, result)

    yield f"data: {json.dumps({'type': 'text', 'content': text})}\n\n"
    if spots:
        yield f"data: {json.dumps({'type': 'spots', 'spots': spots})}\n\n"
    yield f"data: {json.dumps({'type': 'done'})}\n\n"

    await _persist(request, history, text, spots)


async def _agent_stream(request: ChatRequest, history: list[dict], user_location: dict | None):
    assistant_text  = ""
    assistant_spots = []

    async for event in run_agent_stream(
        user_message=request.message,
        session_id=request.session_id or str(uuid.uuid4()),
        city=request.city,
        user_id=request.user_id,
        conversation_history=history,
        user_location=user_location,
    ):
        if event["type"] == "text":
            assistant_text = event["content"]
        elif event["type"] == "spots":
            assistant_spots = event["spots"]
        yield f"data: {json.dumps(event)}\n\n"

    await _persist(request, history, assistant_text, assistant_spots)


@router.post("/")
async def chat(request: ChatRequest, req: Request):
    """
    Main chat endpoint. Streams SSE events to the frontend.
    Events: text | spots | done | error

    Plain search queries take the fast path (small model extracts intent,
    deterministic search, templated answer). Conversational turns go through
    the full agent.
    """
    session_id = request.session_id or str(uuid.uuid4())
    request.session_id = session_id

    user_location = (
        {"lat": request.user_lat, "lng": request.user_lng}
        if request.user_lat is not None and request.user_lng is not None
        else None
    )
    CURRENT_USER_LOCATION.set(user_location)

    # Deterministic hard travel limit from the raw words ("under 30 mins",
    # "within 2 km"). Enforced strictly downstream, regardless of the LLM.
    travel_limit = parse_travel_limit(request.message)
    CURRENT_TRAVEL_LIMIT.set(travel_limit)

    # Load prior turns so the agent has memory within a session.
    history: list[dict] = []
    try:
        conv = await get_conversation(session_id)
        if conv and isinstance(conv.get("messages"), list):
            history = conv["messages"]
    except Exception:
        pass

    intent = await extract_intent(
        message=request.message,
        city=request.city,
        shown_names=_shown_names(history),
        prev_user_message=_prev_user_message(history),
    )

    # Reflect the hard limit in the intent so the templated answer says
    # "within X km" and the search enforces it.
    if intent is not None and travel_limit and travel_limit > 0:
        intent["radius_km"] = travel_limit

    if should_fast_path(intent):
        print(f"[chat] FAST PATH: {intent}")
        stream = _fast_stream(request, history, intent)
    else:
        print(f"[chat] full agent (intent={intent})")
        stream = _agent_stream(request, history, user_location)

    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Session-ID": session_id,
            "Access-Control-Allow-Origin": "*",
        },
    )
