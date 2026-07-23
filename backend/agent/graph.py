"""
Buco Orchestration Agent — LangGraph ReAct agent with output guardrails.

Flow: START → agent_node → (tool_node → agent_node)* → END

Guardrails applied to every response:
  1. GROUNDING  — spot cards are only shown if they exist in real tool results
                  (or were genuinely shown earlier in the conversation). The
                  model cannot invent restaurants.
  2. SANITIZING — internal markup ([SPOTS_START] blocks, bracketed context
                  notes, raw JSON) never reaches the user.
"""

import os
import re
import json
import traceback
from typing import AsyncIterator
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, MessagesState
from langgraph.prebuilt import ToolNode, tools_condition

from agent.llm import get_llm, GROQ_MODELS
from agent.tools import BUCO_TOOLS, CURRENT_USER_LOCATION
from agent.prompts import build_system_prompt

DEV = os.getenv("ENVIRONMENT", "development") == "development"

# Assistant messages that are error artifacts — never feed back as history.
_ERROR_SNIPPETS = (
    "Something went wrong",
    "Can't reach the Buco server",
    "Connection lost",
)


def _build_graph(model: str):
    llm = get_llm(model).bind_tools(BUCO_TOOLS)

    async def agent_node(state: MessagesState):
        response = await llm.ainvoke(state["messages"])
        return {"messages": [response]}

    graph = StateGraph(MessagesState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(BUCO_TOOLS, handle_tool_errors=True))
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", tools_condition)
    graph.add_edge("tools", "agent")
    return graph.compile()


_graphs: dict[str, object] = {}


def get_graph(model: str):
    if model not in _graphs:
        _graphs[model] = _build_graph(model)
    return _graphs[model]


# ── Guardrail 2: sanitize text ────────────────────────────────────────────────

def parse_spots_from_response(content: str) -> tuple[str, list[dict]]:
    """Extracts ALL [SPOTS_START]...[SPOTS_END] blocks (the model sometimes
    emits several) and strips every trace of internal markup from the text."""
    spots: list[dict] = []
    text = content

    while "[SPOTS_START]" in text and "[SPOTS_END]" in text:
        start = text.index("[SPOTS_START]")
        end   = text.index("[SPOTS_END]")
        raw   = text[start + len("[SPOTS_START]"):end].strip()
        text  = text[:start] + text[end + len("[SPOTS_END]"):]
        try:
            spots.extend(json.loads(raw).get("spots", []))
        except json.JSONDecodeError:
            pass  # malformed block — dropped, never shown

    # Unterminated block → cut everything from the stray tag onward.
    if "[SPOTS_START]" in text:
        text = text[:text.index("[SPOTS_START]")]
    text = text.replace("[SPOTS_END]", "")

    # Internal context notes the model may have imitated.
    text = re.sub(r"\[Spots I showed the user:.*?\]", "", text, flags=re.S)
    text = re.sub(r"\[Spots currently shown.*?\]", "", text, flags=re.S)
    # Any bracketed block leaking internal fields (id=, lat=, lng=).
    text = re.sub(r"\[[^\[\]]*\b(?:id|lat|lng)=[^\[\]]*\]", "", text, flags=re.S)
    # Stray raw JSON the model printed outside a block.
    text = re.sub(r'\{\s*"spots"\s*:.*?\}\s*\]\s*\}', "", text, flags=re.S)
    # Collapse leftover blank lines.
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    return text, spots


# ── Guardrail 1: ground spots in real data ────────────────────────────────────

def _ground_spots(model_spots: list[dict], allowed: list[dict]) -> list[dict]:
    """Returns only spots that exist in `allowed` (real tool results or spots
    genuinely shown earlier). The authoritative version of each spot is used,
    so ids/coords/prices are always real. Fabrications are dropped; if the
    model fabricated everything but the tools DID find spots, the real tool
    results are shown instead."""
    if not allowed:
        return []

    by_id   = {str(s.get("id")): s for s in allowed if s.get("id")}
    by_name = {str(s.get("name", "")).strip().lower(): s for s in allowed if s.get("name")}

    grounded, used = [], set()
    for ms in model_spots:
        real = by_id.get(str(ms.get("id"))) or by_name.get(str(ms.get("name", "")).strip().lower())
        if real is not None:
            key = str(real.get("id")) or str(real.get("name"))
            if key not in used:
                grounded.append(real)
                used.add(key)

    if not grounded and model_spots:
        # Model fabricated all of them — fall back to genuine results.
        grounded = allowed[:4]

    return grounded[:6]


def _extract_tool_spots(tool_message_content) -> list[dict]:
    try:
        data = json.loads(tool_message_content) if isinstance(tool_message_content, str) else {}
        found = data.get("spots", [])
        return found if isinstance(found, list) else []
    except (json.JSONDecodeError, AttributeError, TypeError):
        return []


async def _run_once(model: str, messages: list) -> tuple[str, list[dict], bool]:
    """Runs the graph once. Returns (final_text, real_tool_spots, tool_was_called)."""
    graph = get_graph(model)
    full_response = ""
    tool_spots: list[dict] = []
    tool_called = False

    async for chunk in graph.astream({"messages": messages}):
        if "tools" in chunk:
            tool_called = True
            for msg in chunk["tools"]["messages"]:
                tool_spots.extend(_extract_tool_spots(getattr(msg, "content", "")))
        if "agent" in chunk:
            for msg in chunk["agent"]["messages"]:
                if getattr(msg, "tool_calls", None):
                    continue  # intermediate "thinking" turn
                if hasattr(msg, "content") and msg.content:
                    content = msg.content
                    if isinstance(content, list):
                        content = " ".join(
                            c.get("text", "") for c in content if isinstance(c, dict)
                        )
                    full_response += content

    return full_response, tool_spots, tool_called


def _build_history_messages(conversation_history: list[dict]) -> tuple[list, list[dict], str]:
    """Converts saved history into LLM messages (token-efficient). Returns
    (messages, previously_shown_spots, context_note). The context note goes
    into the SYSTEM channel — never into an assistant message, so the model
    can't learn to imitate it in visible replies."""
    messages: list = []
    history_spots: list[dict] = []

    recent = [
        m for m in (conversation_history or [])
        if not (m.get("role") == "assistant"
                and any(snip in (m.get("content") or "") for snip in _ERROR_SNIPPETS))
    ][-8:]

    for msg in recent:
        content = (msg.get("content") or "")[:400]
        if msg.get("role") == "user":
            messages.append(HumanMessage(content=content))
        elif msg.get("role") == "assistant":
            history_spots.extend(msg.get("spots") or [])
            messages.append(AIMessage(content=content))

    # Compact reference for follow-ups — most recent spots only.
    context_note = ""
    if history_spots:
        lines = [
            f"- {s.get('name')} | id={s.get('id')} | {s.get('address')} | {s.get('price_label') or ''}"
            for s in history_spots[-6:]
        ]
        context_note = (
            "Internal reference — spots currently shown to the user (answer "
            "follow-ups from this; never print this list or its ids verbatim):\n"
            + "\n".join(lines)
        )

    return messages, history_spots, context_note


async def run_agent_stream(
    user_message: str,
    session_id: str,
    city: str = "Toronto, ON",
    user_id: str | None = None,
    conversation_history: list[dict] | None = None,
    user_location: dict | None = None,
) -> AsyncIterator[dict]:
    """
    Runs the Buco agent and yields SSE-compatible event dicts.
    Yields: {"type": "text"|"spots"|"done"|"error", ...}
    """
    # Make the user's coordinates available to tools (distance filtering).
    CURRENT_USER_LOCATION.set(user_location)

    history_messages, history_spots, context_note = _build_history_messages(conversation_history or [])

    messages: list = [
        SystemMessage(content=build_system_prompt(city=city, user_id=user_id)),
        *history_messages,
    ]
    if context_note:
        messages.append(SystemMessage(content=context_note))
    messages.append(HumanMessage(content=user_message))

    last_error: Exception | None = None
    for model in GROQ_MODELS:
        try:
            full_response, tool_spots, tool_called = await _run_once(model, messages)
            clean_text, model_spots = parse_spots_from_response(full_response)

            # Ground every card in real data (this run's tools + prior turns).
            spots = _ground_spots(model_spots, tool_spots + history_spots)

            # Tools found spots but the model forgot the block → show them anyway.
            if not spots and tool_spots and tool_called:
                spots = tool_spots[:4]

            if not clean_text and not spots:
                raise RuntimeError(f"Model '{model}' returned an empty response")

            if clean_text:
                yield {"type": "text", "content": clean_text}
            if spots:
                yield {"type": "spots", "spots": spots}
            yield {"type": "done"}
            return

        except Exception as e:  # try the next fallback model
            last_error = e
            print(f"[Agent] model '{model}' failed: {e}")
            traceback.print_exc()

    detail = f" ({type(last_error).__name__}: {last_error})" if DEV and last_error else ""
    yield {
        "type": "error",
        "message": f"Something went wrong. Please try again.{detail}",
    }
