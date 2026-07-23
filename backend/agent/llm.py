import os
from langchain_groq import ChatGroq

# ══════════════════════════════════════════════════════════════════════════════
# LLM CONFIGURATION
# To switch providers: comment out the active block, uncomment the desired one.
# All providers work identically — no agent code changes needed.
# ══════════════════════════════════════════════════════════════════════════════

# Primary + fallbacks, tried in order. 70B is far more reliable at tool-calling
# than 8B-instant (which frequently fails with "Failed to call a function").
GROQ_MODELS = [
    os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
    "llama-3.1-8b-instant",
]


def get_llm(model: str | None = None):
    # ── FREE TIER (active) ── Groq
    # Sign up free at https://console.groq.com
    # NOTE: streaming must stay False — the installed langchain-groq (0.1.x)
    # is incompatible with the newer groq SDK's AsyncStream when streaming=True
    # ("'AsyncStream' object has no attribute 'dict'"). The app sends the full
    # answer as one SSE event anyway, so nothing is lost.
    return ChatGroq(
        model=model or GROQ_MODELS[0],
        api_key=os.getenv("GROQ_API_KEY"),
        temperature=0.4,  # warm/conversational, still reliable at tool calls
        streaming=False,
        max_retries=2,
        max_tokens=700,   # keeps replies tight and token bills low
    )

    # ── PAID: Anthropic Claude (best reasoning — recommended upgrade) ──────────
    # from langchain_anthropic import ChatAnthropic
    # return ChatAnthropic(
    #     model="claude-sonnet-4-6",
    #     api_key=os.getenv("ANTHROPIC_API_KEY"),
    #     temperature=0.1,
    #     streaming=True,
    # )

    # ── PAID: OpenAI GPT-4o ──────────────────────────────────────────────────
    # from langchain_openai import ChatOpenAI
    # return ChatOpenAI(
    #     model="gpt-4o",
    #     api_key=os.getenv("OPENAI_API_KEY"),
    #     temperature=0.1,
    #     streaming=True,
    # )
