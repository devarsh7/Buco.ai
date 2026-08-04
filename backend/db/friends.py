"""Friend graph + privacy-first visit sharing.

- Invite by a short friend code (no email enumeration).
- Visits are private by default; a user must opt in (`share_visits`) before
  friends can see their pins.
"""
import secrets

from db.supabase import get_supabase_client

_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no ambiguous 0/O/1/I/L


def _gen_code(n: int = 6) -> str:
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(n))


async def get_or_create_friend_code(user_id: str) -> str:
    client = get_supabase_client()
    try:
        row = client.table("users").select("friend_code").eq("id", user_id).single().execute()
        if row.data and row.data.get("friend_code"):
            return row.data["friend_code"]
    except Exception:
        pass
    for _ in range(5):
        code = _gen_code()
        try:
            client.table("users").update({"friend_code": code}).eq("id", user_id).execute()
            return code
        except Exception:
            continue  # unique clash — try another
    return ""


async def set_sharing(user_id: str, share: bool) -> bool:
    client = get_supabase_client()
    try:
        client.table("users").update({"share_visits": share}).eq("id", user_id).execute()
        return True
    except Exception as e:
        print(f"[friends] set_sharing error: {e}")
        return False


async def _get_user(user_id: str) -> dict:
    client = get_supabase_client()
    try:
        r = client.table("users").select("id, display_name, share_visits").eq("id", user_id).single().execute()
        return r.data or {}
    except Exception:
        return {}


async def send_request(user_id: str, code: str) -> dict:
    client = get_supabase_client()
    code = (code or "").strip().upper()
    if not code:
        return {"ok": False, "message": "Enter a friend code."}

    target = client.table("users").select("id, display_name").eq("friend_code", code).limit(1).execute()
    if not target.data:
        return {"ok": False, "message": "No one has that code."}
    addressee_id = target.data[0]["id"]
    if addressee_id == user_id:
        return {"ok": False, "message": "That's your own code!"}

    # already connected either direction?
    existing = (
        client.table("friendships")
        .select("id, status, requester_id, addressee_id")
        .or_(
            f"and(requester_id.eq.{user_id},addressee_id.eq.{addressee_id}),"
            f"and(requester_id.eq.{addressee_id},addressee_id.eq.{user_id})"
        )
        .limit(1)
        .execute()
    )
    if existing.data:
        st = existing.data[0]["status"]
        msg = "Already friends." if st == "accepted" else "Request already pending."
        return {"ok": False, "message": msg}

    client.table("friendships").insert({
        "requester_id": user_id,
        "addressee_id": addressee_id,
        "status": "pending",
    }).execute()
    return {"ok": True, "message": f"Request sent to {target.data[0].get('display_name') or 'them'}."}


async def respond_request(user_id: str, friendship_id: str, accept: bool) -> dict:
    client = get_supabase_client()
    row = client.table("friendships").select("*").eq("id", friendship_id).single().execute()
    if not row.data:
        return {"ok": False, "message": "Request not found."}
    if row.data["addressee_id"] != user_id:
        return {"ok": False, "message": "Not your request to answer."}
    status = "accepted" if accept else "declined"
    client.table("friendships").update({"status": status, "updated_at": "now()"}).eq("id", friendship_id).execute()
    return {"ok": True, "message": "Friend added!" if accept else "Request declined."}


async def _names_for(ids: list[str]) -> dict[str, dict]:
    if not ids:
        return {}
    client = get_supabase_client()
    r = client.table("users").select("id, display_name, share_visits").in_("id", ids).execute()
    return {u["id"]: u for u in (r.data or [])}


async def list_friends(user_id: str) -> dict:
    """Accepted friends + incoming/outgoing pending requests."""
    client = get_supabase_client()
    rows = (
        client.table("friendships")
        .select("*")
        .or_(f"requester_id.eq.{user_id},addressee_id.eq.{user_id}")
        .execute()
    ).data or []

    other_ids = [
        (r["addressee_id"] if r["requester_id"] == user_id else r["requester_id"])
        for r in rows
    ]
    people = await _names_for(list(set(other_ids)))

    friends, incoming, outgoing = [], [], []
    for r in rows:
        other = r["addressee_id"] if r["requester_id"] == user_id else r["requester_id"]
        person = people.get(other, {})
        card = {
            "friendship_id": r["id"],
            "user_id": other,
            "name": person.get("display_name") or "A local",
            "share_visits": bool(person.get("share_visits")),
        }
        if r["status"] == "accepted":
            friends.append(card)
        elif r["status"] == "pending":
            (incoming if r["addressee_id"] == user_id else outgoing).append(card)

    me = await _get_user(user_id)
    return {
        "code": await get_or_create_friend_code(user_id),
        "share_visits": bool(me.get("share_visits")),
        "friends": friends,
        "incoming": incoming,
        "outgoing": outgoing,
    }


async def _accepted_friend_ids(user_id: str) -> list[str]:
    client = get_supabase_client()
    rows = (
        client.table("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or_(f"requester_id.eq.{user_id},addressee_id.eq.{user_id}")
        .execute()
    ).data or []
    return [r["addressee_id"] if r["requester_id"] == user_id else r["requester_id"] for r in rows]


async def friends_map(user_id: str) -> list[dict]:
    """Verified visits of friends who opted into sharing, aggregated by spot."""
    client = get_supabase_client()
    friend_ids = await _accepted_friend_ids(user_id)
    if not friend_ids:
        return []
    people = await _names_for(friend_ids)
    sharers = [fid for fid in friend_ids if people.get(fid, {}).get("share_visits")]
    if not sharers:
        return []

    try:
        rows = (
            client.table("visits")
            .select("user_id, spot_id, spots(name, lat, lng, category)")
            .in_("user_id", sharers)
            .eq("verified", True)
            .execute()
        ).data or []
    except Exception as e:
        print(f"[friends] friends_map error: {e}")
        return []

    agg: dict[str, dict] = {}
    for r in rows:
        spot = r.get("spots") or {}
        sid = r["spot_id"]
        if spot.get("lat") is None or spot.get("lng") is None:
            continue
        if sid not in agg:
            agg[sid] = {
                "spot_id": sid,
                "name": spot.get("name", ""),
                "lat": spot.get("lat"),
                "lng": spot.get("lng"),
                "category": spot.get("category", ""),
                "friend_names": [],
                "friend_ids": set(),
            }
        uid = r["user_id"]
        if uid not in agg[sid]["friend_ids"]:
            agg[sid]["friend_ids"].add(uid)
            nm = people.get(uid, {}).get("display_name") or "A friend"
            agg[sid]["friend_names"].append(nm)

    pins = []
    for a in agg.values():
        pins.append({
            "spot_id": a["spot_id"],
            "name": a["name"],
            "lat": a["lat"],
            "lng": a["lng"],
            "category": a["category"],
            "friend_names": a["friend_names"],
            "friend_count": len(a["friend_ids"]),
        })
    return pins
