"""Living-map data layer: verified check-ins, personal buildings, map pins.

Verification is decided server-side (never trust client-claimed location/time):
a visit is `verified` only when the device GPS is within VERIFY_RADIUS_M of the
spot AND no other verified visit exists in the last DEDUPE_HOURS.
"""
from datetime import datetime, timezone, timedelta

from db.supabase import get_supabase_client, get_spot_by_id
from db.geo import haversine_m, building_tier, building_label

VERIFY_RADIUS_M = 75          # must be within 75 m of the venue
DEDUPE_HOURS = 6              # one verified visit per user per spot per 6 h
POINTS_PER_VISIT = 10


async def create_visit(
    user_id: str,
    spot_id: str,
    lat: float,
    lng: float,
    photo_url: str = "",
) -> dict:
    """Record a check-in, verify presence, update the building tier, award points.

    Returns a dict describing the result (never raises for the normal
    'too far' / 'duplicate' cases — those come back as verified=False).
    """
    client = get_supabase_client()

    spot = await get_spot_by_id(spot_id)
    if not spot:
        return {"ok": False, "error": "spot_not_found"}

    # ── distance check ────────────────────────────────────────────────
    distance_m = None
    within_radius = False
    if spot.get("lat") is not None and spot.get("lng") is not None:
        distance_m = round(haversine_m(lat, lng, float(spot["lat"]), float(spot["lng"])), 1)
        within_radius = distance_m <= VERIFY_RADIUS_M

    # ── dedupe: a verified visit in the last 6 h blocks a new verified one ──
    since = (datetime.now(timezone.utc) - timedelta(hours=DEDUPE_HOURS)).isoformat()
    recent = (
        client.table("visits")
        .select("id")
        .eq("user_id", user_id)
        .eq("spot_id", spot_id)
        .eq("verified", True)
        .gte("created_at", since)
        .limit(1)
        .execute()
    )
    is_duplicate = bool(recent.data)
    verified = bool(within_radius and not is_duplicate and photo_url)

    # ── insert the visit ──────────────────────────────────────────────
    inserted = (
        client.table("visits")
        .insert({
            "user_id": user_id,
            "spot_id": spot_id,
            "lat": lat,
            "lng": lng,
            "photo_url": photo_url,
            "verified": verified,
            "distance_m": distance_m,
        })
        .execute()
    )
    visit_id = inserted.data[0]["id"] if inserted.data else None

    # ── count verified visits → building tier ─────────────────────────
    count_res = (
        client.table("visits")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .eq("spot_id", spot_id)
        .eq("verified", True)
        .execute()
    )
    visit_count = count_res.count or 0
    tier = building_tier(visit_count, spot.get("category"))
    # Did this check-in grow the building? (compare against the prior count)
    prev_count = visit_count - 1 if verified else visit_count
    prev_tier = building_tier(prev_count, spot.get("category"))
    leveled_up = verified and tier > prev_tier

    # ── award points only for a fresh verified visit ──────────────────
    points_awarded = 0
    if verified:
        points_awarded = POINTS_PER_VISIT
        try:
            client.table("points_ledger").insert({
                "user_id": user_id,
                "delta": points_awarded,
                "reason": "verified_visit",
                "visit_id": visit_id,
            }).execute()
        except Exception as e:  # points are non-critical; never fail a check-in on this
            print(f"[visits] points ledger error: {e}")

    if verified:
        message = "Checked in — verified!"
    elif is_duplicate:
        message = "Already checked in here recently."
    elif not photo_url:
        message = "Add a dish photo to verify your visit."
    elif not within_radius:
        message = "You need to be at the venue to check in."
    else:
        message = "Check-in recorded."

    return {
        "ok": True,
        "id": visit_id,
        "spot_id": spot_id,
        "verified": verified,
        "distance_m": distance_m,
        "visit_count": visit_count,
        "building_tier": tier,
        "building_label": building_label(tier),
        "leveled_up": leveled_up,
        "previous_tier": prev_tier,
        "points_awarded": points_awarded,
        "message": message,
    }


async def get_user_map(user_id: str) -> dict:
    """Return the user's personal map layers: visited buildings + wishlist pins."""
    client = get_supabase_client()

    # visited spots (verified) with per-spot visit counts
    visited: dict[str, dict] = {}
    try:
        rows = (
            client.table("visits")
            .select("spot_id, verified, spots(id, name, lat, lng, category)")
            .eq("user_id", user_id)
            .eq("verified", True)
            .execute()
        )
        for r in rows.data or []:
            spot = r.get("spots") or {}
            sid = r["spot_id"]
            if sid not in visited:
                visited[sid] = {
                    "spot_id": sid,
                    "name": spot.get("name", ""),
                    "lat": spot.get("lat"),
                    "lng": spot.get("lng"),
                    "category": spot.get("category", ""),
                    "layer": "visited",
                    "visit_count": 0,
                }
            visited[sid]["visit_count"] += 1
    except Exception as e:
        print(f"[visits] get_user_map visited error: {e}")

    for pin in visited.values():
        pin["building_tier"] = building_tier(pin["visit_count"], pin.get("category"))
        pin["building_label"] = building_label(pin["building_tier"])

    # wishlist pins (bookmarks) — skip any already visited
    wishlist: list[dict] = []
    try:
        rows = (
            client.table("bookmarks")
            .select("spot_id, spots(id, name, lat, lng, category)")
            .eq("user_id", user_id)
            .execute()
        )
        for r in rows.data or []:
            sid = r["spot_id"]
            if sid in visited:
                continue
            spot = r.get("spots") or {}
            wishlist.append({
                "spot_id": sid,
                "name": spot.get("name", ""),
                "lat": spot.get("lat"),
                "lng": spot.get("lng"),
                "category": spot.get("category", ""),
                "layer": "wishlist",
                "visit_count": 0,
                "building_tier": 0,
                "building_label": "",
            })
    except Exception as e:
        print(f"[visits] get_user_map wishlist error: {e}")

    return {"visited": list(visited.values()), "wishlist": wishlist}


async def spots_in_bounds(
    min_lng: float, min_lat: float, max_lng: float, max_lat: float, max_rows: int = 300
) -> list[dict]:
    """Discovery layer: verified spots inside the current map viewport (index-backed)."""
    client = get_supabase_client()
    try:
        res = client.rpc("spots_in_bounds", {
            "min_lng": min_lng, "min_lat": min_lat,
            "max_lng": max_lng, "max_lat": max_lat,
            "max_rows": max_rows,
        }).execute()
        return res.data or []
    except Exception as e:
        print(f"[visits] spots_in_bounds error: {e}")
        return []


async def get_points_balance(user_id: str) -> int:
    client = get_supabase_client()
    try:
        rows = client.table("points_ledger").select("delta").eq("user_id", user_id).execute()
        return sum(r["delta"] for r in (rows.data or []))
    except Exception:
        return 0
