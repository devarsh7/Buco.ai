"""Area-heat engine (the towers).

Momentum is a decaying score: every unique verified visitor in a geohash cell
adds heat that halves every HALF_LIFE_DAYS. Tower height is set by an area's
*percentile* among all active areas — so towers are meaningful from day one and
the bar rises automatically as the city gets busier.

Anti-abuse baked in:
- one contribution per unique verified user per area (no rallying 50 check-ins
  from 5 people),
- verified visits only (GPS + photo + timestamp upstream),
- brand-new accounts are weighted down.
"""
from datetime import datetime, timezone

from db.supabase import get_supabase_client

HALF_LIFE_DAYS = 3.5
WINDOW_DAYS = 14              # older visits contribute negligibly
NEW_ACCOUNT_DAYS = 3         # accounts younger than this count for less
NEW_ACCOUNT_WEIGHT = 0.5

# percentile cutoffs (fraction of areas at or hotter than this one)
TIER_CUTOFFS = [(0.05, 3), (0.15, 2), (0.30, 1)]


def _parse(ts: str) -> datetime:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)


def _tier_for(rank: int, count: int) -> int:
    if count <= 0:
        return 0
    pct = rank / count  # 0 = hottest
    for cutoff, tier in TIER_CUTOFFS:
        if pct < cutoff:
            return tier
    # guarantee the single hottest area always shows a tower
    return 1 if rank == 0 else 0


async def recompute_heat() -> dict:
    """Recompute every area's heat + tier and replace the area_heat table.
    Meant to run on a schedule (~every 15 min)."""
    client = get_supabase_client()
    now = datetime.now(timezone.utc)
    window_start = (now.timestamp() - WINDOW_DAYS * 86400)
    start_iso = datetime.fromtimestamp(window_start, tz=timezone.utc).isoformat()

    try:
        rows = (
            client.table("visits")
            .select("user_id, spot_id, lat, lng, geohash7, created_at")
            .eq("verified", True)
            .gte("created_at", start_iso)
            .limit(20000)          # paginate beyond this at real scale
            .execute()
        ).data or []
    except Exception as e:
        print(f"[heat] fetch error: {e}")
        return {"ok": False, "message": "fetch failed"}

    # trust weights by account age
    uids = list({r["user_id"] for r in rows})
    weights: dict[str, float] = {}
    if uids:
        try:
            urows = client.table("users").select("id, created_at").in_("id", uids).execute().data or []
            for u in urows:
                age_days = (now - _parse(u.get("created_at") or now.isoformat())).total_seconds() / 86400
                weights[u["id"]] = NEW_ACCOUNT_WEIGHT if age_days < NEW_ACCOUNT_DAYS else 1.0
        except Exception:
            pass

    areas: dict[str, dict] = {}
    for r in rows:
        gh = r.get("geohash7")
        if not gh or r.get("lat") is None or r.get("lng") is None:
            continue
        a = areas.setdefault(gh, {"users": {}, "spots": {}, "lat_sum": 0.0, "lng_sum": 0.0, "n": 0})
        age_days = (now - _parse(r["created_at"])).total_seconds() / 86400
        decay = 0.5 ** (age_days / HALF_LIFE_DAYS)
        uid = r["user_id"]
        # keep only each user's strongest (most recent) contribution → unique-user weighting
        if uid not in a["users"] or decay > a["users"][uid]:
            a["users"][uid] = decay
        a["spots"][r["spot_id"]] = a["spots"].get(r["spot_id"], 0) + 1
        a["lat_sum"] += float(r["lat"]); a["lng_sum"] += float(r["lng"]); a["n"] += 1

    scored = []
    for gh, a in areas.items():
        heat = sum(decay * weights.get(uid, 1.0) for uid, decay in a["users"].items())
        if heat <= 0:
            continue
        top_spots = [sid for sid, _ in sorted(a["spots"].items(), key=lambda x: -x[1])[:3]]
        scored.append({
            "geohash7": gh,
            "heat_score": round(heat, 3),
            "lat": round(a["lat_sum"] / a["n"], 6),
            "lng": round(a["lng_sum"] / a["n"], 6),
            "top_spot_ids": top_spots,
            "visitor_count": len(a["users"]),
        })

    scored.sort(key=lambda x: -x["heat_score"])
    count = len(scored)
    hot = []
    for i, s in enumerate(scored):
        tier = _tier_for(i, count)
        if tier > 0:
            s["tier"] = tier
            s["updated_at"] = now.isoformat()
            hot.append(s)

    # Replace the summary table (small + read-cached → full swap is simplest/correct)
    try:
        client.table("area_heat").delete().neq("geohash7", "").execute()
        if hot:
            client.table("area_heat").insert(hot).execute()
    except Exception as e:
        print(f"[heat] write error: {e}")
        return {"ok": False, "message": "write failed"}

    return {"ok": True, "areas_scored": count, "towers": len(hot)}


async def get_towers(
    min_lng: float | None = None, min_lat: float | None = None,
    max_lng: float | None = None, max_lat: float | None = None,
) -> list[dict]:
    client = get_supabase_client()
    try:
        q = client.table("area_heat").select("*").gt("tier", 0)
        if None not in (min_lng, min_lat, max_lng, max_lat):
            q = q.gte("lat", min_lat).lte("lat", max_lat).gte("lng", min_lng).lte("lng", max_lng)
        rows = q.execute().data or []
    except Exception as e:
        print(f"[heat] get_towers error: {e}")
        return []

    # resolve top spot names in one query
    all_ids = list({sid for r in rows for sid in (r.get("top_spot_ids") or [])})
    names: dict[str, str] = {}
    if all_ids:
        try:
            srows = client.table("spots").select("id, name").in_("id", all_ids).execute().data or []
            names = {s["id"]: s["name"] for s in srows}
        except Exception:
            pass

    towers = []
    for r in rows:
        towers.append({
            "geohash7": r["geohash7"],
            "lat": r.get("lat"),
            "lng": r.get("lng"),
            "tier": r.get("tier", 0),
            "visitor_count": r.get("visitor_count", 0),
            "spot_names": [names.get(sid, "") for sid in (r.get("top_spot_ids") or []) if names.get(sid)],
        })
    return towers
