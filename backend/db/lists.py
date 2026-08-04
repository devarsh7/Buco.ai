"""Collaborative plans: shared lists of spots that friends build together.

Membership is required for every read/write; adding a member requires that the
person actually be an accepted friend of whoever adds them.
"""
from db.supabase import get_supabase_client, ensure_user, _is_uuid, upsert_external_spot
from db.friends import _accepted_friend_ids


async def _is_member(list_id: str, user_id: str) -> bool:
    client = get_supabase_client()
    try:
        r = (
            client.table("list_members").select("user_id")
            .eq("list_id", list_id).eq("user_id", user_id).limit(1).execute()
        )
        return bool(r.data)
    except Exception:
        return False


async def _names_for(ids: list[str]) -> dict[str, str]:
    if not ids:
        return {}
    client = get_supabase_client()
    r = client.table("users").select("id, display_name").in_("id", list(set(ids))).execute()
    return {u["id"]: (u.get("display_name") or "A local") for u in (r.data or [])}


async def create_list(owner_id: str, name: str) -> dict:
    client = get_supabase_client()
    await ensure_user(owner_id)
    name = (name or "").strip()[:80] or "Untitled plan"
    try:
        res = client.table("lists").insert({"owner_id": owner_id, "name": name}).execute()
        lst = res.data[0]
        client.table("list_members").insert({"list_id": lst["id"], "user_id": owner_id}).execute()
        return {"ok": True, "id": lst["id"], "name": lst["name"], "owner_id": owner_id,
                "item_count": 0, "member_count": 1}
    except Exception as e:
        print(f"[lists] create error: {e}")
        return {"ok": False, "message": "Couldn't create the plan."}


async def get_lists(user_id: str) -> list[dict]:
    client = get_supabase_client()
    try:
        mem = client.table("list_members").select("list_id").eq("user_id", user_id).execute()
        list_ids = [m["list_id"] for m in (mem.data or [])]
        if not list_ids:
            return []
        rows = client.table("lists").select("*").in_("id", list_ids).order("created_at", desc=True).execute()
        items = client.table("list_items").select("list_id").in_("list_id", list_ids).execute()
        members = client.table("list_members").select("list_id").in_("list_id", list_ids).execute()

        item_counts: dict[str, int] = {}
        for it in (items.data or []):
            item_counts[it["list_id"]] = item_counts.get(it["list_id"], 0) + 1
        member_counts: dict[str, int] = {}
        for m in (members.data or []):
            member_counts[m["list_id"]] = member_counts.get(m["list_id"], 0) + 1

        return [{
            "id": l["id"],
            "name": l["name"],
            "owner_id": l["owner_id"],
            "item_count": item_counts.get(l["id"], 0),
            "member_count": member_counts.get(l["id"], 0),
        } for l in (rows.data or [])]
    except Exception as e:
        print(f"[lists] get_lists error: {e}")
        return []


async def get_list_detail(user_id: str, list_id: str) -> dict | None:
    client = get_supabase_client()
    if not await _is_member(list_id, user_id):
        return None
    try:
        lst = client.table("lists").select("*").eq("id", list_id).single().execute().data
        members = client.table("list_members").select("user_id").eq("list_id", list_id).execute().data or []
        items = (
            client.table("list_items")
            .select("id, spot_id, note, added_by, spots(name, category, lat, lng)")
            .eq("list_id", list_id)
            .order("created_at", desc=False)
            .execute()
        ).data or []

        name_ids = [m["user_id"] for m in members] + [i["added_by"] for i in items if i.get("added_by")]
        names = await _names_for(name_ids)

        return {
            "id": lst["id"],
            "name": lst["name"],
            "owner_id": lst["owner_id"],
            "members": [{"user_id": m["user_id"], "name": names.get(m["user_id"], "A local")} for m in members],
            "items": [{
                "id": i["id"],
                "spot_id": i["spot_id"],
                "name": (i.get("spots") or {}).get("name", ""),
                "category": (i.get("spots") or {}).get("category", ""),
                "lat": (i.get("spots") or {}).get("lat"),
                "lng": (i.get("spots") or {}).get("lng"),
                "note": i.get("note") or "",
                "added_by_name": names.get(i.get("added_by"), "") if i.get("added_by") else "",
            } for i in items],
        }
    except Exception as e:
        print(f"[lists] get_list_detail error: {e}")
        return None


async def add_member(actor_id: str, list_id: str, friend_id: str) -> dict:
    client = get_supabase_client()
    if not await _is_member(list_id, actor_id):
        return {"ok": False, "message": "You're not on this plan."}
    if friend_id not in await _accepted_friend_ids(actor_id):
        return {"ok": False, "message": "You can only add accepted friends."}
    try:
        client.table("list_members").upsert(
            {"list_id": list_id, "user_id": friend_id}, on_conflict="list_id,user_id"
        ).execute()
        return {"ok": True, "message": "Added to the plan."}
    except Exception as e:
        print(f"[lists] add_member error: {e}")
        return {"ok": False, "message": "Couldn't add them."}


async def add_item(actor_id: str, list_id: str, spot_id: str, note: str = "", spot: dict | None = None) -> dict:
    client = get_supabase_client()
    if not await _is_member(list_id, actor_id):
        return {"ok": False, "message": "You're not on this plan."}
    # External (Yelp) spot not yet in the spots table — upsert it first.
    if not _is_uuid(spot_id):
        if not spot:
            return {"ok": False, "message": "Couldn't add that spot."}
        resolved = await upsert_external_spot({**spot, "yelp_id": spot_id})
        if not resolved:
            return {"ok": False, "message": "Couldn't add that spot."}
        spot_id = resolved
    try:
        client.table("list_items").upsert(
            {"list_id": list_id, "spot_id": spot_id, "added_by": actor_id, "note": (note or "")[:200]},
            on_conflict="list_id,spot_id",
        ).execute()
        return {"ok": True, "message": "Added to the plan."}
    except Exception as e:
        print(f"[lists] add_item error: {e}")
        return {"ok": False, "message": "Couldn't add that spot."}


async def rename_list(user_id: str, list_id: str, name: str) -> dict:
    client = get_supabase_client()
    if not await _is_member(list_id, user_id):
        return {"ok": False, "message": "You're not on this plan."}
    name = (name or "").strip()[:80]
    if not name:
        return {"ok": False, "message": "Enter a name."}
    try:
        client.table("lists").update({"name": name}).eq("id", list_id).execute()
        return {"ok": True, "message": "Renamed."}
    except Exception as e:
        print(f"[lists] rename error: {e}")
        return {"ok": False, "message": "Couldn't rename the plan."}


async def delete_list(user_id: str, list_id: str) -> dict:
    client = get_supabase_client()
    lst = client.table("lists").select("owner_id").eq("id", list_id).limit(1).execute().data
    if not lst:
        return {"ok": False, "message": "Plan not found."}
    if lst[0]["owner_id"] != user_id:
        return {"ok": False, "message": "Only the plan's owner can delete it."}
    try:
        client.table("lists").delete().eq("id", list_id).execute()  # cascades to members + items
        return {"ok": True, "message": "Plan deleted."}
    except Exception as e:
        print(f"[lists] delete error: {e}")
        return {"ok": False, "message": "Couldn't delete the plan."}


async def remove_item(actor_id: str, list_id: str, spot_id: str) -> dict:
    client = get_supabase_client()
    if not await _is_member(list_id, actor_id):
        return {"ok": False, "message": "You're not on this plan."}
    try:
        client.table("list_items").delete().eq("list_id", list_id).eq("spot_id", spot_id).execute()
        return {"ok": True, "message": "Removed."}
    except Exception as e:
        print(f"[lists] remove_item error: {e}")
        return {"ok": False, "message": "Couldn't remove that."}
