import os
import re
import json
import math
import httpx
import contextvars
from datetime import datetime
from langchain_core.tools import tool
from db.supabase import (
    search_curated_spots,
    save_bookmark as db_save_bookmark,
    get_user_bookmarks as db_get_bookmarks,
)
from db.redis_client import cache_get, cache_set, make_search_cache_key

# Set per-request by the agent runner — the user's real coordinates.
CURRENT_USER_LOCATION: contextvars.ContextVar[dict | None] = contextvars.ContextVar(
    "buco_user_location", default=None
)

# A hard travel limit (km) parsed deterministically from the raw user message.
# When >0, results past this distance are dropped entirely (no "nearest" fallback).
CURRENT_TRAVEL_LIMIT: contextvars.ContextVar[float] = contextvars.ContextVar(
    "buco_travel_limit", default=0.0
)

YELP_BASE_URL = "https://api.yelp.com/v3/businesses/search"
YELP_PRICE_MAP = {15: "1,2", 20: "1,2", 25: "1,2,3", 999: "1,2,3,4"}


def _yelp_price_filter(price_max: float) -> str:
    for ceiling, label in YELP_PRICE_MAP.items():
        if price_max <= ceiling:
            return label
    return "1,2"


_VAGUE_LOCATIONS = ("near me", "nearby", "near by", "current location", "my location", "here", "close to me")


def _clean_location(location: str) -> str:
    """LLMs often pass the user's literal words ('near me', 'within 1km of
    you') as the location, which matches no city in the database. Replace
    vague or distance-phrase locations with the configured default city."""
    loc = (location or "").strip().lower()
    looks_like_radius = bool(re.search(r"\d+\s*(km|kms|kilometer|mile|mi|m)\b|within|radius|of (you|me)", loc))
    if not loc or loc in ("me", "near") or looks_like_radius or any(v in loc for v in _VAGUE_LOCATIONS):
        return os.getenv("DEFAULT_CITY", "Toronto, ON")
    return location.strip()


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ── Cuisine strictness ────────────────────────────────────────────────────────
# When the user names a cuisine we NEVER show anything off-cuisine (a pizza
# search must never surface Indian). These terms decide what counts as a match.
CUISINE_MATCH: dict[str, list[str]] = {
    "pizza": ["pizza", "pizzeria"],
    "pasta": ["pasta", "italian"],
    "italian": ["italian", "pizza", "pasta", "trattoria"],
    "sushi": ["sushi", "japanese"],
    "ramen": ["ramen", "japanese"],
    "japanese": ["japanese", "sushi", "ramen", "izakaya"],
    "pho": ["pho", "vietnamese"],
    "vietnamese": ["vietnamese", "pho", "banh"],
    "indian": ["indian", "pakistani", "curry", "tikka", "biryani", "punjabi", "tandoor"],
    "thai": ["thai"],
    "chinese": ["chinese", "dim sum", "szechuan", "sichuan", "cantonese", "dumpling", "hakka"],
    "korean": ["korean", "bibimbap", "bulgogi"],
    "mexican": ["mexican", "taco", "burrito", "taqueria"],
    "burger": ["burger"],
    "shawarma": ["shawarma", "middle eastern", "lebanese"],
    "mediterranean": ["mediterranean", "greek", "lebanese", "falafel", "middle eastern"],
    "greek": ["greek", "mediterranean"],
    "vegan": ["vegan"],
    "vegetarian": ["vegetarian"],
    "bbq": ["bbq", "barbecue", "smokehouse"],
    "noodle": ["noodle", "ramen", "udon", "pho"],
    "sandwich": ["sandwich", "deli", "banh mi", "sub"],
    "cafe": ["cafe", "coffee", "espresso"],
    "coffee": ["coffee", "cafe", "espresso"],
    "dessert": ["dessert", "ice cream", "bakery", "gelato"],
    "seafood": ["seafood", "fish", "oyster"],
    "breakfast": ["breakfast", "brunch", "diner"],
    "brunch": ["brunch", "breakfast"],
    "wings": ["wings", "chicken"],
    "steak": ["steak", "steakhouse"],
    "salon": ["salon", "nail", "hair"],
    "spa": ["spa", "massage"],
}

# Query cuisine → Yelp category alias (tightens the API search itself).
YELP_CATEGORY_ALIASES: dict[str, str] = {
    "pizza": "pizza", "pasta": "italian", "italian": "italian", "sushi": "sushi",
    "ramen": "ramen", "japanese": "japanese", "pho": "vietnamese", "vietnamese": "vietnamese",
    "indian": "indpak", "thai": "thai", "chinese": "chinese", "korean": "korean",
    "mexican": "mexican", "burger": "burgers", "shawarma": "mideastern",
    "mediterranean": "mediterranean", "greek": "greek", "vegan": "vegan",
    "vegetarian": "vegetarian", "bbq": "bbq", "seafood": "seafood",
    "sandwich": "sandwiches", "cafe": "cafes", "coffee": "coffee", "dessert": "desserts",
    "breakfast": "breakfast_brunch", "brunch": "breakfast_brunch", "steak": "steak",
    "salon": "hair", "spa": "spas",
}


def _query_cuisines(query: str) -> list[str]:
    q = (query or "").lower()
    return [key for key in CUISINE_MATCH if key in q]


def _matches_cuisine(spot: dict, match_terms: set[str]) -> bool:
    if not match_terms:
        return True
    hay = (str(spot.get("name", "")) + " " + " ".join(spot.get("cuisine_tags") or [])).lower()
    return any(t in hay for t in match_terms)


# Only these fields go back to the LLM — keeps tool output small (token cost)
# and keeps internal columns (embeddings, timestamps) out of the context.
_SPOT_FIELDS = (
    "id", "name", "category", "cuisine_tags", "address", "city", "postal_code",
    "lat", "lng", "price_min", "price_max", "price_label", "distance_km",
    "phone", "website", "image_url", "rating", "buco_pick", "buco_score",
    "is_open", "source", "happy_hour_now", "happy_hour_label",
)


def _slim(spot: dict) -> dict:
    out = {k: spot[k] for k in _SPOT_FIELDS if spot.get(k) not in (None, "", [], {})}
    if "price_label" not in out and out.get("price_min") is not None:
        pmax = out.get("price_max", out["price_min"])
        out["price_label"] = f"${round(float(out['price_min']))}–{round(float(pmax))}"
    return out


def _happy_hour_status(spot: dict) -> tuple[bool, str]:
    """Reads the spot's happy_hour JSONB. Format per day (mon..sun):
    {"fri": [{"start": "16:00", "end": "18:00", "deals": [{"item": "cocktails", "price": 8}]}]}
    Returns (active_right_now, human_label)."""
    hh = spot.get("happy_hour") or {}
    if not isinstance(hh, dict):
        return False, ""
    now = datetime.now()
    day = now.strftime("%a").lower()
    windows = hh.get(day) or hh.get(day[:3]) or []
    now_hm = now.strftime("%H:%M")
    for w in windows:
        start, end = str(w.get("start", "")), str(w.get("end", ""))
        deals = w.get("deals") or []
        deal_txt = ", ".join(
            f"${d.get('price')} {d.get('item')}" for d in deals if d.get("item")
        )
        label = f"{start}–{end}" + (f" · {deal_txt}" if deal_txt else "")
        if start and end and start <= now_hm <= end:
            return True, label
    if windows:
        w = windows[0]
        return False, f"today {w.get('start')}–{w.get('end')}"
    return False, ""


def _format_yelp_spot(biz: dict) -> dict:
    price_str = biz.get("price", "$")
    dist_km   = round(biz.get("distance", 0) / 1000, 1)
    addr      = ", ".join(biz.get("location", {}).get("display_address", []))
    categories = [c["title"] for c in biz.get("categories", [])]
    return {
        "id":           biz.get("id", ""),
        "name":         biz.get("name", ""),
        "category":     "restaurant",
        "cuisine_tags": [c.lower().replace(" ", "_") for c in categories],
        "address":      addr,
        "city":         biz.get("location", {}).get("city", ""),
        "postal_code":  biz.get("location", {}).get("zip_code", ""),
        "lat":          biz.get("coordinates", {}).get("latitude"),
        "lng":          biz.get("coordinates", {}).get("longitude"),
        "price_label":  price_str,
        "price_min":    len(price_str) * 8.0 if price_str else None,
        "price_max":    len(price_str) * 15.0 if price_str else None,
        "distance_km":  dist_km,
        "phone":        biz.get("phone", ""),
        "website":      biz.get("url", ""),
        "image_url":    biz.get("image_url", ""),
        "rating":       biz.get("rating"),
        "buco_pick":    False,
        "is_open":      not biz.get("is_closed", False),
        "source":       "yelp",
    }


async def perform_search(
    query: str,
    location: str = "Toronto, ON",
    price_max: float = 15.0,
    open_now: bool = False,
    happy_hour_now: bool = False,
    party_size: int = 1,
    max_distance_km: float = 0,
    exclude_names: list[str] | None = None,
    include_curated: bool = True,
) -> dict:
    """Core search — callable directly (fast path) or via the agent tool.
    Returns {"spots": [...], "note": "...", "message": "..."}."""
    location = _clean_location(location)
    yelp_key = os.getenv("YELP_API_KEY", "")
    has_yelp = bool(yelp_key) and "your_yelp" not in yelp_key
    uloc = CURRENT_USER_LOCATION.get()

    # A hard limit parsed from the raw message overrides the LLM and is enforced
    # strictly — this is what makes "under 30 mins" never return farther places.
    hard_radius = False
    travel_limit = CURRENT_TRAVEL_LIMIT.get()
    if travel_limit and travel_limit > 0:
        max_distance_km = travel_limit
        hard_radius = True

    # Strict cuisine: if the query names a cuisine, only matching spots survive.
    cuisines = _query_cuisines(query)
    match_terms: set[str] = set()
    for c in cuisines:
        match_terms.update(CUISINE_MATCH.get(c, [c]))
    print(f"[search_spots] query={query!r} location={location!r} price_max={price_max} "
          f"open_now={open_now} happy_hour_now={happy_hour_now} party_size={party_size} "
          f"max_distance_km={max_distance_km} exclude={exclude_names or []} "
          f"user_loc={'yes' if uloc else 'no'}")

    cache_key = make_search_cache_key(
        f"{query}:hh{int(happy_hour_now)}:r{max_distance_km or 0}", location, price_max
    )

    merged = cache_get(cache_key)
    radius_note = ""

    if merged is None:
        # 1. Curated DB first (our verified data always leads)
        curated = await search_curated_spots(
            query=query,
            city=location.split(",")[0].strip(),
            price_max=price_max,
            limit=4 if has_yelp else 8,
        ) if include_curated else []
        curated_formatted = []
        for s in curated:
            active, label = _happy_hour_status(s)
            s = _slim({**s, "source": "curated"})
            if active:
                s["happy_hour_now"] = True
            if label:
                s["happy_hour_label"] = label
            if uloc and s.get("lat") is not None and s.get("lng") is not None:
                s["distance_km"] = round(
                    _haversine_km(uloc["lat"], uloc["lng"], float(s["lat"]), float(s["lng"])), 2
                )
            curated_formatted.append(s)
        if uloc:
            curated_formatted.sort(key=lambda s: s.get("distance_km", 9999))
        if happy_hour_now:
            curated_formatted = [s for s in curated_formatted if s.get("happy_hour_now")]

        # 2. Yelp fills the rest — fetch extra so "show me others" has depth
        yelp_spots = []
        if has_yelp:
            try:
                params = {
                    "term": query,
                    "limit": 20,
                    "price": _yelp_price_filter(price_max),
                    # Closest-first when we know where the user is — your algorithm's
                    # cuisine → distance → cost ordering.
                    "sort_by": "distance" if uloc else "best_match",
                }
                if cuisines and YELP_CATEGORY_ALIASES.get(cuisines[0]):
                    params["categories"] = YELP_CATEGORY_ALIASES[cuisines[0]]
                if uloc:
                    params["latitude"] = uloc["lat"]
                    params["longitude"] = uloc["lng"]
                else:
                    params["location"] = location
                if max_distance_km and max_distance_km > 0:
                    params["radius"] = min(int(max_distance_km * 1000), 40000)
                if open_now:
                    params["open_now"] = True
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(
                        YELP_BASE_URL,
                        headers={"Authorization": f"Bearer {yelp_key}"},
                        params=params,
                    )
                    if resp.status_code == 401:
                        print("[Yelp] 401 Unauthorized — check YELP_API_KEY in backend/.env")
                    elif resp.status_code == 429:
                        print("[Yelp] 429 rate limited — daily free quota (500 calls) may be exhausted")
                    resp.raise_for_status()
                    yelp_spots = [_slim(_format_yelp_spot(b)) for b in resp.json().get("businesses", [])]
                    print(f"[Yelp] returned {len(yelp_spots)} businesses")
                    if happy_hour_now:
                        yelp_spots = []  # Yelp has no happy-hour data — curated only
            except Exception as e:
                print(f"[Yelp] API error: {e}")

        curated_names = {s["name"].lower() for s in curated_formatted}
        merged = curated_formatted + [s for s in yelp_spots if s["name"].lower() not in curated_names]
        merged = merged[:14]
        if merged:
            cache_set(cache_key, merged)

    # Strict single-cuisine — drop anything off-cuisine (applies to fresh + cached).
    if match_terms:
        merged = [s for s in merged if _matches_cuisine(s, match_terms)]

    # Order by distance, then cost — the cuisine → distance → cost priority.
    if uloc:
        merged = sorted(
            merged,
            key=lambda s: (round(s.get("distance_km") or 9999, 1), s.get("price_min") or 9999),
        )

    # Radius filter on the full candidate list.
    if max_distance_km and max_distance_km > 0 and uloc:
        within = [s for s in merged if s.get("distance_km") is not None and s["distance_km"] <= max_distance_km]
        if hard_radius:
            # Strict: an explicit "within X" / "under N mins" — never show anything past it.
            merged = within
        elif within:
            merged = within
        elif merged:
            merged = sorted(merged, key=lambda s: s.get("distance_km", 9999))[:3]
            nearest = merged[0].get("distance_km") if merged else None
            radius_note = (
                f"NOTE: nothing matched within {max_distance_km} km. These are the NEAREST "
                f"matches (closest is {nearest} km away) — tell the user the real distances honestly."
            )

    # Exclusions — applied AFTER cache so "show me others" works.
    excluded = {n.strip().lower() for n in (exclude_names or []) if n}
    if excluded:
        merged = [s for s in merged if s.get("name", "").lower() not in excluded]

    final = merged[:8]

    if not final:
        coverage = "" if has_yelp else " Buco's curated data currently covers Toronto only."
        exclusion_hint = " All matches were already shown to the user." if excluded else ""
        return {
            "spots": [],
            "message": (
                f"ZERO spots available for '{query}' in {location}"
                + (" with an active happy hour right now" if happy_hour_now else "")
                + f".{coverage}{exclusion_hint} Tell the user honestly. Do NOT name, describe, or "
                "recommend any venue from your own memory — you have no data for it."
            ),
        }

    result: dict = {"spots": final}
    notes = []
    if radius_note:
        notes.append(radius_note)
    if party_size and party_size > 1:
        notes.append(
            f"Party of {party_size}: total budget ≈ ${round(price_max * party_size)}. "
            "Mention the group total and that larger groups should call ahead."
        )
    if notes:
        result["note"] = " ".join(notes)
    return result


@tool
async def search_spots(
    query: str,
    location: str = "Toronto, ON",
    price_max: float = 15.0,
    open_now: bool = False,
    happy_hour_now: bool = False,
    party_size: int = 1,
    max_distance_km: float = 0,
    exclude_names: list[str] | None = None,
) -> str:
    """Search for budget-friendly restaurants, cafes, salons, or other local spots.
    Always use this when the user asks to find a place to eat, drink, or get a service.

    Args:
        query: What the user wants (e.g. "ramen", "nail salon", "sushi under $15")
        location: A real city/neighbourhood name (default: Toronto, ON). Never "near me" or "within X km".
        price_max: Maximum spend PER PERSON in dollars (default: 15.0)
        open_now: If True, only return currently open spots
        happy_hour_now: If True, only return spots whose happy hour is active right now
        party_size: Number of people (use for group requests, e.g. "we're 5 people")
        max_distance_km: Radius limit from the user's location. Use when they say "within 1 km", "walking distance" (≈1.5), etc. 0 = no limit.
        exclude_names: Names of spots ALREADY SHOWN that the user wants alternatives to. When they say "any other options" / "not these", pass every name you've shown so far.
    """
    result = await perform_search(
        query=query,
        location=location,
        price_max=price_max,
        open_now=open_now,
        happy_hour_now=happy_hour_now,
        party_size=party_size,
        max_distance_km=max_distance_km,
        exclude_names=exclude_names,
    )
    return json.dumps(result)


@tool
async def save_bookmark(user_id: str, spot_id: str, note: str = "") -> str:
    """Save a spot to the user's Wishlist.
    Use when the user says 'save this', 'bookmark this', or 'add to my list'.

    Args:
        user_id: The authenticated user's ID
        spot_id: The spot ID to bookmark
        note: Optional personal note from the user
    """
    if not user_id or user_id == "anonymous":
        return json.dumps({"error": "Please sign in to save spots to your Wishlist."})
    result = await db_save_bookmark(user_id=user_id, spot_id=spot_id, note=note)
    if result:
        return json.dumps({"success": True, "message": "Saved to your Wishlist."})
    return json.dumps({"error": "Could not save spot. Try again."})


@tool
async def get_user_bookmarks(user_id: str) -> str:
    """Retrieve all spots saved in the user's Wishlist.
    Use when the user asks 'what did I save?', 'show my list', or 'my wishlist'.

    Args:
        user_id: The authenticated user's ID
    """
    if not user_id or user_id == "anonymous":
        return json.dumps({"error": "Please sign in to view your Wishlist."})
    bookmarks = await db_get_bookmarks(user_id=user_id)
    if not bookmarks:
        return json.dumps({"spots": [], "message": "The Wishlist is empty. Tell the user to save spots they like."})
    spots = []
    for b in bookmarks:
        spot = b.get("spots", {})
        if spot:
            spots.append({
                "id":          spot.get("id", ""),
                "name":        spot.get("name", ""),
                "address":     spot.get("address", ""),
                "price_label": f"${spot.get('price_min', '?')}–{spot.get('price_max', '?')}",
                "image_url":   (spot.get("photos") or [""])[0],
                "note":        b.get("note", ""),
                "visited":     b.get("visited", False),
                "source":      "curated",
                "buco_pick":   spot.get("buco_pick", False),
            })
    return json.dumps({"spots": spots, "total": len(spots)})


BUCO_TOOLS = [search_spots, save_bookmark, get_user_bookmarks]
