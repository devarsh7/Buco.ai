"""Restaurant manager side: claim a venue, read its dashboard, manage rewards.

The dashboard is almost entirely reads over data Buco already collects
(verified visits, reviews, area heat, redemptions) — that's the sellable moat.
"""
import secrets
from datetime import datetime, timezone, timedelta

from db.supabase import get_supabase_client

_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _gen(n: int = 6) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(n))


def _parse(ts: str) -> datetime:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)


async def is_manager(user_id: str, spot_id: str) -> bool:
    client = get_supabase_client()
    try:
        r = (client.table("spot_managers").select("user_id")
             .eq("spot_id", spot_id).eq("user_id", user_id).limit(1).execute())
        return bool(r.data)
    except Exception:
        return False


async def generate_claim_code(spot_id: str) -> dict:
    """Admin helper: mint a claim code for a venue and hand it to the owner."""
    client = get_supabase_client()
    for _ in range(5):
        code = _gen()
        try:
            client.table("spots").update({"claim_code": code}).eq("id", spot_id).execute()
            return {"ok": True, "claim_code": code}
        except Exception:
            continue
    return {"ok": False, "message": "Couldn't generate a code."}


async def claim_spot(user_id: str, claim_code: str) -> dict:
    client = get_supabase_client()
    code = (claim_code or "").strip().upper()
    if not code:
        return {"ok": False, "message": "Enter your claim code."}
    spot = (client.table("spots").select("id, name").eq("claim_code", code).limit(1).execute()).data
    if not spot:
        return {"ok": False, "message": "That claim code isn't valid."}
    try:
        client.table("spot_managers").upsert(
            {"spot_id": spot[0]["id"], "user_id": user_id, "role": "manager"},
            on_conflict="spot_id,user_id",
        ).execute()
        return {"ok": True, "spot_id": spot[0]["id"], "message": f"You now manage {spot[0]['name']}."}
    except Exception as e:
        print(f"[manager] claim error: {e}")
        return {"ok": False, "message": "Couldn't claim the venue."}


async def get_managed_spots(user_id: str) -> list[dict]:
    client = get_supabase_client()
    try:
        r = (client.table("spot_managers").select("spot_id, spots(name, city)")
             .eq("user_id", user_id).execute())
        out = []
        for x in (r.data or []):
            s = x.get("spots") or {}
            out.append({"spot_id": x["spot_id"], "name": s.get("name", ""), "city": s.get("city", "")})
        return out
    except Exception as e:
        print(f"[manager] managed spots error: {e}")
        return []


async def get_dashboard(user_id: str, spot_id: str) -> dict | None:
    client = get_supabase_client()
    if not await is_manager(user_id, spot_id):
        return None

    now = datetime.now(timezone.utc)
    spot = (client.table("spots").select("name").eq("id", spot_id).single().execute()).data or {}

    # ── visits ────────────────────────────────────────────────────────────
    visits = (client.table("visits").select("user_id, created_at")
              .eq("spot_id", spot_id).eq("verified", True).limit(20000).execute()).data or []
    per_user: dict[str, int] = {}
    d7 = d30 = 0
    day_counts: dict[str, int] = {}
    for v in visits:
        per_user[v["user_id"]] = per_user.get(v["user_id"], 0) + 1
        t = _parse(v["created_at"])
        age = (now - t).days
        if age < 7: d7 += 1
        if age < 30: d30 += 1
        day_counts[t.date().isoformat()] = day_counts.get(t.date().isoformat(), 0) + 1
    daily = []
    for i in range(13, -1, -1):
        day = (now - timedelta(days=i)).date().isoformat()
        daily.append({"date": day, "count": day_counts.get(day, 0)})
    visit_stats = {
        "total": len(visits),
        "unique_visitors": len(per_user),
        "repeat_visitors": sum(1 for c in per_user.values() if c > 1),
        "last_7d": d7, "last_30d": d30, "daily": daily,
    }

    # ── reviews ───────────────────────────────────────────────────────────
    reviews = (client.table("reviews")
               .select("worth_it, actual_spend, comment, created_at, users(display_name)")
               .eq("spot_id", spot_id).order("created_at", desc=True).limit(200).execute()).data or []
    worth = sum(1 for r in reviews if r.get("worth_it"))
    spends = [float(r["actual_spend"]) for r in reviews if r.get("actual_spend") is not None]
    review_stats = {
        "count": len(reviews),
        "worth_it_pct": round(100 * worth / len(reviews)) if reviews else 0,
        "avg_spend": round(sum(spends) / len(spends), 2) if spends else None,
        "recent": [{
            "user_name": (r.get("users") or {}).get("display_name") or "A local",
            "worth_it": bool(r.get("worth_it")),
            "actual_spend": r.get("actual_spend"),
            "comment": r.get("comment") or "",
            "created_at": r.get("created_at"),
        } for r in reviews[:6]],
    }

    # ── momentum (is this spot driving a tower?) ──────────────────────────
    momentum = {"tier": 0, "visitor_count": 0}
    try:
        heat = client.table("area_heat").select("tier, visitor_count").contains("top_spot_ids", [spot_id]).limit(1).execute().data
        if heat:
            momentum = {"tier": heat[0].get("tier", 0), "visitor_count": heat[0].get("visitor_count", 0)}
    except Exception:
        pass

    # ── redemptions ───────────────────────────────────────────────────────
    reds = (client.table("redemptions").select("status, points_spent")
            .eq("spot_id", spot_id).limit(20000).execute()).data or []
    redemption_stats = {
        "issued": sum(1 for r in reds if r["status"] == "issued"),
        "redeemed": sum(1 for r in reds if r["status"] == "redeemed"),
        "points_spent": sum(r.get("points_spent", 0) for r in reds),
    }

    # ── rewards ───────────────────────────────────────────────────────────
    rewards = (client.table("rewards").select("*")
               .eq("spot_id", spot_id).eq("active", True).order("cost_points").execute()).data or []
    reward_cards = [{
        "id": r["id"], "spot_id": r["spot_id"], "title": r["title"],
        "description": r.get("description") or "", "cost_points": r["cost_points"],
        "stock": r.get("stock"), "terms": r.get("terms") or "",
    } for r in rewards]

    return {
        "spot_id": spot_id, "spot_name": spot.get("name", ""),
        "visits": visit_stats, "reviews": review_stats,
        "momentum": momentum, "redemptions": redemption_stats, "rewards": reward_cards,
    }


async def deactivate_reward(user_id: str, reward_id: str) -> dict:
    client = get_supabase_client()
    reward = (client.table("rewards").select("spot_id").eq("id", reward_id).limit(1).execute()).data
    if not reward:
        return {"ok": False, "message": "Reward not found."}
    if not await is_manager(user_id, reward[0]["spot_id"]):
        return {"ok": False, "message": "You don't manage this venue."}
    try:
        client.table("rewards").update({"active": False}).eq("id", reward_id).execute()
        return {"ok": True, "message": "Reward paused."}
    except Exception as e:
        print(f"[manager] deactivate error: {e}")
        return {"ok": False, "message": "Couldn't pause the reward."}
