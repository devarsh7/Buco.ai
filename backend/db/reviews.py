"""Verified reviews: a review is only allowed from someone who has a verified
visit at that spot — so the reviews feed is trustworthy by construction.
"""
from db.supabase import get_supabase_client

REVIEW_POINTS = 15


async def has_verified_visit(user_id: str, spot_id: str) -> bool:
    client = get_supabase_client()
    try:
        r = (
            client.table("visits")
            .select("id")
            .eq("user_id", user_id)
            .eq("spot_id", spot_id)
            .eq("verified", True)
            .limit(1)
            .execute()
        )
        return bool(r.data)
    except Exception:
        return False


async def create_review(
    user_id: str,
    spot_id: str,
    worth_it: bool,
    actual_spend: float | None = None,
    comment: str = "",
) -> dict:
    client = get_supabase_client()

    if not await has_verified_visit(user_id, spot_id):
        return {"ok": False, "error": "no_verified_visit",
                "message": "Check in at the venue before you can review it."}

    # First review for this (user, spot)? Points are awarded once.
    existing = (
        client.table("reviews").select("id")
        .eq("user_id", user_id).eq("spot_id", spot_id).limit(1).execute()
    )
    is_new = not existing.data

    row = {
        "user_id": user_id,
        "spot_id": spot_id,
        "worth_it": worth_it,
        "actual_spend": actual_spend,
        "comment": (comment or "")[:600],
        "verified": True,
    }
    try:
        res = client.table("reviews").upsert(row, on_conflict="spot_id,user_id").execute()
    except Exception as e:
        print(f"[reviews] upsert error: {e}")
        return {"ok": False, "error": "save_failed", "message": "Couldn't save your review — try again."}

    points = 0
    if is_new and res.data:
        points = REVIEW_POINTS
        try:
            client.table("points_ledger").insert(
                {"user_id": user_id, "delta": points, "reason": "review"}
            ).execute()
        except Exception as e:
            print(f"[reviews] points error: {e}")

    return {"ok": True, "points_awarded": points, "message": "Review posted!"}


def _flatten(row: dict) -> dict:
    """Collapse Supabase's nested join objects into a flat review card."""
    user = row.get("users") or {}
    spot = row.get("spots") or {}
    return {
        "id": row.get("id"),
        "spot_id": row.get("spot_id", ""),
        "user_id": row.get("user_id", ""),
        "worth_it": bool(row.get("worth_it")),
        "actual_spend": row.get("actual_spend"),
        "comment": row.get("comment") or "",
        "created_at": row.get("created_at"),
        "user_name": user.get("display_name") or "A local",
        "spot_name": spot.get("name") or "",
        "spot_category": spot.get("category") or "",
    }


async def get_spot_reviews(spot_id: str, limit: int = 20) -> list[dict]:
    client = get_supabase_client()
    try:
        r = (
            client.table("reviews")
            .select("*, users(display_name), spots(name, category)")
            .eq("spot_id", spot_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [_flatten(x) for x in (r.data or [])]
    except Exception as e:
        print(f"[reviews] get_spot_reviews error: {e}")
        return []


async def get_review_feed(limit: int = 30) -> list[dict]:
    client = get_supabase_client()
    try:
        r = (
            client.table("reviews")
            .select("*, users(display_name), spots(name, category, city)")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [_flatten(x) for x in (r.data or [])]
    except Exception as e:
        print(f"[reviews] get_review_feed error: {e}")
        return []
