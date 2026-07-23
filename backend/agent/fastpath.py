"""
Fast path — skips the full ReAct agent for plain search queries.

  message → intent extraction (llama-3.1-8b, ~300ms, JSON only)
          → deterministic search (DB + Yelp + distance math)
          → templated answer (no second LLM call)

Anything conversational (comparisons, opinions, follow-up questions about
specific spots, bookmarking) falls through to the full agent. If extraction
fails in ANY way, we fall through too — the fast path can only make things
faster, never break them.
"""

import os
import json
import re
from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage

INTENT_PROMPT = """Extract search parameters from a user's message to a local-spots concierge app.
Default city: {city}. Currency: dollars.

Reply with ONLY a JSON object, no other text:
{{
 "is_search": true/false,      // true if this is a request to find food/drink/service spots
 "needs_llm": true/false,      // true if it needs conversation: comparisons ("which is better"),
                               // opinions, questions about a specific place, saving/bookmarks,
                               // multi-part questions, or anything that is not a plain search
 "query": "search words",      // the craving distilled: "cheap italian pasta" -> "italian pasta"
 "price_max": 15,              // per-person budget in dollars; if a TOTAL and group given, divide
 "party_size": 1,
 "radius_km": 0,               // "within 1 km" -> 1; "walking distance" -> 1.5; else 0
 "open_now": false,
 "happy_hour": false,          // wants happy hour / drink deals right now
 "exclude": []                 // if they want OTHER options than already shown, copy names from SHOWN
}}

SHOWN (spots already shown in this chat): {shown}
Previous user request: {prev}"""


def _get_intent_llm():
    return ChatGroq(
        model="llama-3.1-8b-instant",
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0,
        max_tokens=250,
        model_kwargs={"response_format": {"type": "json_object"}},
    )


async def extract_intent(
    message: str,
    city: str,
    shown_names: list[str],
    prev_user_message: str = "",
) -> dict | None:
    """Returns the parsed intent dict, or None if extraction failed."""
    try:
        llm = _get_intent_llm()
        prompt = INTENT_PROMPT.format(
            city=city,
            shown=json.dumps(shown_names[-8:]) if shown_names else "[]",
            prev=prev_user_message[:200] or "none",
        )
        resp = await llm.ainvoke(
            [SystemMessage(content=prompt), HumanMessage(content=message[:500])]
        )
        raw = resp.content if isinstance(resp.content, str) else ""
        m = re.search(r"\{.*\}", raw, re.S)
        if not m:
            return None
        intent = json.loads(m.group(0))
        if not isinstance(intent, dict):
            return None
        return intent
    except Exception as e:
        print(f"[fastpath] intent extraction failed: {e}")
        return None


def _walk_mins(km: float) -> int:
    return max(1, round((km * 1.2) / 4.8 * 60))


def compose_answer(intent: dict, result: dict) -> str:
    """Deterministic, honest one-liner about the search results. No LLM."""
    spots = result.get("spots", [])
    note = result.get("note", "")
    query = (intent.get("query") or "spots").strip()
    price = intent.get("price_max") or 15
    party = int(intent.get("party_size") or 1)

    if not spots:
        base = f"I couldn't find any {query} under ${round(price)}"
        if intent.get("radius_km"):
            base += f" within {intent['radius_km']} km"
        if intent.get("exclude"):
            base += " beyond the ones you've already seen"
        return base + ". Want me to widen the search — different cuisine, bigger budget, or more distance?"

    n = len(spots)
    closest = min(
        (s for s in spots if s.get("distance_km") is not None),
        key=lambda s: s["distance_km"],
        default=None,
    )

    parts = []
    if "nothing matched within" in note:
        radius = intent.get("radius_km")
        parts.append(
            f"Nothing under ${round(price)} within {radius} km — but here "
            f"{'is the nearest match' if n == 1 else f'are the {n} nearest'}."
        )
    else:
        parts.append(f"Found {n} {query} {'spot' if n == 1 else 'spots'} under ${round(price)}.")

    if closest:
        km = closest["distance_km"]
        parts.append(f"{closest['name']} is closest — {km} km, about a {_walk_mins(km)} min walk.")

    hh = next((s for s in spots if s.get("happy_hour_now")), None)
    if hh:
        parts.append(f"Heads up: {hh['name']}'s happy hour is on right now ({hh.get('happy_hour_label', '')}).")

    if party > 1:
        parts.append(f"For {party} people budget roughly ${round(price * party)} total — call ahead for a group table.")

    return " ".join(parts)


def should_fast_path(intent: dict | None) -> bool:
    return bool(intent and intent.get("is_search") and not intent.get("needs_llm"))
