import os
import traceback
import uuid as uuid_lib
from supabase import create_client, Client
from functools import lru_cache


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Returns a cached Supabase client using service role key (backend only)."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    return create_client(url, key)


def _is_uuid(value: str) -> bool:
    try:
        uuid_lib.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


# ── SPOTS ─────────────────────────────────────────────────────────────────────

# Filler words that carry no meaning for matching names/cuisines.
_STOPWORDS = {
    "cheap", "affordable", "budget", "best", "good", "top", "great", "nice",
    "under", "over", "around", "near", "nearby", "me", "my", "the", "a", "an",
    "in", "for", "with", "and", "or", "of", "to", "at", "on",
    "food", "spot", "spots", "place", "places", "restaurant", "restaurants",
    "open", "now", "today", "tonight", "tomorrow", "downtown",
    "find", "show", "all", "some", "any", "something",
    "within", "km", "kms", "walking", "distance", "spots",
}


def _search_tokens(query: str) -> list[str]:
    tokens = []
    for raw in "".join(c if c.isalpha() else " " for c in (query or "").lower()).split():
        if len(raw) < 3 or raw in _STOPWORDS:
            continue
        tokens.append(raw)
        if raw.endswith("s"):  # crude singular: "salons" also matches "salon"
            tokens.append(raw[:-1])
    return tokens[:8]


async def search_curated_spots(
    query: str,
    city: str = "Toronto",
    category: str | None = None,
    price_max: float | None = None,
    limit: int = 5,
) -> list[dict]:
    """Text search across our manually curated spots table.
    Matches query tokens against name + cuisine_tags; falls back to a
    city/price-only search when nothing matches the text."""
    client = get_supabase_client()

    def base_query():
        q = (
            client.table("spots")
            .select("*")
            .ilike("city", f"%{city}%")
            .eq("verified", True)
        )
        if category:
            q = q.eq("category", category)
        if price_max is not None:
            q = q.lte("price_min", price_max)
        return q

    try:
        tokens = _search_tokens(query)
        if tokens:
            ors = []
            for t in tokens:
                ors.append(f"name.ilike.%{t}%")
                ors.append(f"cuisine_tags.cs.{{{t}}}")
            result = base_query().or_(",".join(ors)).limit(limit).execute()
            if result.data:
                return result.data
        # Fallback: no text match — return whatever fits city/category/price.
        result = base_query().limit(limit).execute()
        return result.data or []
    except Exception as e:
        print(f"[Supabase] search error: {type(e).__name__}: {e}")
        traceback.print_exc()
        return []


async def get_spot_by_id(spot_id: str) -> dict | None:
    client = get_supabase_client()
    try:
        result = client.table("spots").select("*").eq("id", spot_id).single().execute()
        return result.data
    except Exception:
        return None


async def upsert_external_spot(spot: dict) -> str | None:
    """
    Inserts an external (e.g. Yelp) spot into the spots table so it can be
    bookmarked. Dedupes on yelp_id. Returns the spot's UUID.
    """
    client = get_supabase_client()
    try:
        yelp_id = spot.get("yelp_id") or spot.get("id", "")
        existing = (
            client.table("spots").select("id").eq("yelp_id", yelp_id).limit(1).execute()
        )
        if existing.data:
            return existing.data[0]["id"]

        row = {
            "name":         spot.get("name", "Unknown"),
            "category":     spot.get("category") or "restaurant",
            "cuisine_tags": spot.get("cuisine_tags") or [],
            "address":      spot.get("address", ""),
            "city":         spot.get("city") or "Toronto",
            "lat":          spot.get("lat"),
            "lng":          spot.get("lng"),
            "price_min":    spot.get("price_min"),
            "price_max":    spot.get("price_max"),
            "phone":        spot.get("phone", ""),
            "website":      spot.get("website", ""),
            "photos":       [spot["image_url"]] if spot.get("image_url") else [],
            "yelp_id":      yelp_id,
            "verified":     False,
        }
        if row["category"] not in ("restaurant", "cafe", "salon", "spa", "bar", "other"):
            row["category"] = "other"
        result = client.table("spots").insert(row).execute()
        return result.data[0]["id"] if result.data else None
    except Exception as e:
        print(f"[Supabase] upsert external spot error: {e}")
        return None


# ── BOOKMARKS (Wishlist) ──────────────────────────────────────────────────────

async def save_bookmark(
    user_id: str, spot_id: str, note: str = "", spot: dict | None = None
) -> dict | None:
    client = get_supabase_client()
    try:
        # External (Yelp) spots aren't in the spots table yet — insert first.
        if not _is_uuid(spot_id):
            if not spot:
                print("[Supabase] bookmark error: non-UUID spot_id without spot payload")
                return None
            resolved = await upsert_external_spot({**spot, "yelp_id": spot_id})
            if not resolved:
                return None
            spot_id = resolved

        result = (
            client.table("bookmarks")
            .upsert(
                {"user_id": user_id, "spot_id": spot_id, "note": note},
                on_conflict="user_id,spot_id",
            )
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"[Supabase] bookmark error: {e}")
        return None


async def get_user_bookmarks(user_id: str) -> list[dict]:
    client = get_supabase_client()
    try:
        result = (
            client.table("bookmarks")
            .select("*, spots(*)")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []
    except Exception as e:
        print(f"[Supabase] get bookmarks error: {e}")
        return []


async def delete_bookmark(user_id: str, bookmark_id: str) -> bool:
    client = get_supabase_client()
    try:
        client.table("bookmarks").delete().eq("id", bookmark_id).eq(
            "user_id", user_id
        ).execute()
        return True
    except Exception as e:
        print(f"[Supabase] delete bookmark error: {e}")
        return False


# ── CONVERSATIONS ─────────────────────────────────────────────────────────────

async def save_conversation_message(
    session_id: str,
    user_id: str | None,
    messages: list[dict],
    title: str = "",
):
    client = get_supabase_client()
    if not _is_uuid(session_id):
        print(f"[Supabase] conversation save skipped: '{session_id}' is not a UUID")
        return
    try:
        row = {
            "id": session_id,
            "user_id": user_id if _is_uuid(user_id or "") else None,
            "messages": messages,
            "updated_at": "now()",
        }
        if title:
            row["title"] = title
        client.table("conversations").upsert(row).execute()
    except Exception as e:
        print(f"[Supabase] conversation save error: {e}")


async def get_conversation(session_id: str) -> dict | None:
    client = get_supabase_client()
    if not _is_uuid(session_id):
        return None
    try:
        result = (
            client.table("conversations")
            .select("*")
            .eq("id", session_id)
            .single()
            .execute()
        )
        return result.data
    except Exception:
        return None


async def list_conversations(user_id: str, limit: int = 30) -> list[dict]:
    client = get_supabase_client()
    try:
        result = (
            client.table("conversations")
            .select("id, title, messages, created_at, updated_at")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as e:
        print(f"[Supabase] list conversations error: {e}")
        return []


async def rename_conversation(session_id: str, title: str) -> bool:
    client = get_supabase_client()
    try:
        client.table("conversations").update({"title": title}).eq(
            "id", session_id
        ).execute()
        return True
    except Exception as e:
        print(f"[Supabase] rename conversation error: {e}")
        return False


async def delete_conversation(session_id: str) -> bool:
    client = get_supabase_client()
    try:
        client.table("conversations").delete().eq("id", session_id).execute()
        return True
    except Exception as e:
        print(f"[Supabase] delete conversation error: {e}")
        return False
