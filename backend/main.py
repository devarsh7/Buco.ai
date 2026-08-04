import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from routers import chat, spots, bookmarks, conversations, visits, reviews, friends, lists, heat
from routers import rewards_router, manager

load_dotenv()

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🟢 Buco backend starting...")
    from db.supabase import get_supabase_client
    from db.redis_client import get_redis_client
    try:
        get_supabase_client()
        print("  ✓ Supabase connected")
    except Exception as e:
        print(f"  ✗ Supabase: {e}")
    try:
        r = get_redis_client()
        print("  ✓ Redis connected" if r else "  ⚠ Redis not configured — caching disabled")
    except Exception:
        pass
    yield
    print("🔴 Buco backend shutting down")


app = FastAPI(title="Buco API", version="0.1.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],
    # Allow the Vercel production + preview deployments (*.vercel.app).
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router,      prefix="/api")
app.include_router(spots.router,     prefix="/api")
app.include_router(bookmarks.router, prefix="/api")
app.include_router(conversations.router, prefix="/api")
app.include_router(visits.router,    prefix="/api")
app.include_router(reviews.router,   prefix="/api")
app.include_router(friends.router,   prefix="/api")
app.include_router(lists.router,     prefix="/api")
app.include_router(heat.router,      prefix="/api")
app.include_router(rewards_router.router, prefix="/api")
app.include_router(manager.router,   prefix="/api")


@app.get("/health")
async def health():
    """Health check that also probes the database, so silent DB failures
    (bad keys, SSL issues, network blocks) are visible instead of swallowed."""
    db = {"ok": False, "spots": 0, "error": None}
    try:
        from db.supabase import get_supabase_client
        result = (
            get_supabase_client()
            .table("spots")
            .select("id", count="exact")
            .limit(1)
            .execute()
        )
        db["ok"] = True
        db["spots"] = result.count or 0
    except Exception as e:
        db["error"] = f"{type(e).__name__}: {e}"
    return {"status": "ok", "version": "0.1.0", "db": db}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
