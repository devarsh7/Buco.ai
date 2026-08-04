"""Rewards & redemption.

Redeeming spends points (a debit in points_ledger) and issues a one-time code
the user shows in store. No POS integration: staff validate the code in Buco and
apply a normal manual comp in whatever register they already have.

Guards: reward must be active + in stock, user must have enough points AND a
verified visit at that spot, and a compensating balance re-check catches the
rare concurrent-redeem race (harden with a Postgres RPC at high volume).
"""
import secrets
from datetime import datetime, timezone, timedelta

from db.supabase import get_supabase_client
from db.visits import get_points_balance
from db.reviews import has_verified_visit

_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
REDEEM_WINDOW_MIN = 30


def _code(n: int = 6) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(n))


async def list_spot_rewards(spot_id: str) -> list[dict]:
    client = get_supabase_client()
    try:
        r = (
            client.table("rewards").select("*")
            .eq("spot_id", spot_id).eq("active", True)
            .order("cost_points", desc=False).execute()
        )
        return [{
            "id": x["id"], "spot_id": x["spot_id"], "title": x["title"],
            "description": x.get("description") or "", "cost_points": x["cost_points"],
            "stock": x.get("stock"), "terms": x.get("terms") or "",
        } for x in (r.data or [])]
    except Exception as e:
        print(f"[rewards] list error: {e}")
        return []


async def create_reward(spot_id: str, title: str, cost_points: int,
                        description: str = "", stock: int | None = None,
                        created_by: str | None = None) -> dict:
    client = get_supabase_client()
    try:
        res = client.table("rewards").insert({
            "spot_id": spot_id, "title": title[:120], "cost_points": int(cost_points),
            "description": description[:400], "stock": stock, "created_by": created_by,
        }).execute()
        return {"ok": True, "id": res.data[0]["id"]} if res.data else {"ok": False, "message": "failed"}
    except Exception as e:
        print(f"[rewards] create error: {e}")
        return {"ok": False, "message": "Couldn't create the reward."}


async def redeem_reward(user_id: str, reward_id: str) -> dict:
    client = get_supabase_client()

    reward = (
        client.table("rewards").select("*").eq("id", reward_id).eq("active", True)
        .limit(1).execute()
    ).data
    if not reward:
        return {"ok": False, "message": "That reward isn't available."}
    reward = reward[0]

    if reward.get("stock") is not None and reward["stock"] <= 0:
        return {"ok": False, "message": "This reward is out of stock."}

    cost = reward["cost_points"]
    if await get_points_balance(user_id) < cost:
        return {"ok": False, "message": "You don't have enough points yet."}

    if not await has_verified_visit(user_id, reward["spot_id"]):
        return {"ok": False, "message": "Check in at the venue before redeeming here."}

    # Debit points, then re-check balance to catch a concurrent double-spend.
    ledger = client.table("points_ledger").insert({
        "user_id": user_id, "delta": -cost, "reason": "redemption",
    }).execute()
    ledger_id = ledger.data[0]["id"] if ledger.data else None

    if await get_points_balance(user_id) < 0:
        if ledger_id:
            client.table("points_ledger").delete().eq("id", ledger_id).execute()
        return {"ok": False, "message": "Not enough points — try again."}

    if reward.get("stock") is not None:
        client.table("rewards").update({"stock": reward["stock"] - 1}).eq("id", reward_id).gt("stock", 0).execute()

    code = _code()
    expires = (datetime.now(timezone.utc) + timedelta(minutes=REDEEM_WINDOW_MIN)).isoformat()
    client.table("redemptions").insert({
        "user_id": user_id, "reward_id": reward_id, "spot_id": reward["spot_id"],
        "points_spent": cost, "code": code, "status": "issued", "expires_at": expires,
    }).execute()

    return {"ok": True, "code": code, "title": reward["title"],
            "expires_at": expires, "message": "Show this code in store."}


async def get_my_redemptions(user_id: str) -> list[dict]:
    client = get_supabase_client()
    try:
        r = (
            client.table("redemptions")
            .select("id, code, status, expires_at, created_at, rewards(title), spots(name)")
            .eq("user_id", user_id).eq("status", "issued")
            .order("created_at", desc=True).execute()
        )
        out = []
        for x in (r.data or []):
            out.append({
                "id": x["id"], "code": x["code"], "status": x["status"],
                "expires_at": x.get("expires_at"),
                "title": (x.get("rewards") or {}).get("title", ""),
                "spot_name": (x.get("spots") or {}).get("name", ""),
            })
        return out
    except Exception as e:
        print(f"[rewards] my redemptions error: {e}")
        return []


async def redeem_code(code: str, spot_id: str | None = None) -> dict:
    """Merchant side: validate a code and mark it redeemed."""
    client = get_supabase_client()
    code = (code or "").strip().upper()
    if not code:
        return {"ok": False, "message": "Enter a code."}

    row = (
        client.table("redemptions")
        .select("*, rewards(title), spots(name)")
        .eq("code", code).limit(1).execute()
    ).data
    if not row:
        return {"ok": False, "message": "No such code."}
    row = row[0]

    if row["status"] == "redeemed":
        return {"ok": False, "message": "Already redeemed."}
    if row["status"] == "expired":
        return {"ok": False, "message": "This code has expired."}

    exp = row.get("expires_at")
    if exp:
        try:
            if datetime.fromisoformat(exp.replace("Z", "+00:00")) < datetime.now(timezone.utc):
                client.table("redemptions").update({"status": "expired"}).eq("id", row["id"]).execute()
                return {"ok": False, "message": "This code has expired."}
        except Exception:
            pass

    if spot_id and row["spot_id"] != spot_id:
        return {"ok": False, "message": "This code isn't for this venue."}

    client.table("redemptions").update(
        {"status": "redeemed", "redeemed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", row["id"]).execute()

    return {
        "ok": True,
        "reward_title": (row.get("rewards") or {}).get("title", ""),
        "spot_name": (row.get("spots") or {}).get("name", ""),
        "message": "Redeemed — apply the reward.",
    }
