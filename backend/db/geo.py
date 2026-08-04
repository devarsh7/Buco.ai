"""Geo + game-mechanic helpers for the living map.

Pure functions, no I/O — cheap to call on every check-in and easy to unit test.
"""
from math import radians, sin, cos, asin, sqrt


EARTH_RADIUS_M = 6_371_000


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres between two lat/lng points."""
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_M * asin(sqrt(a))


# ── Personal buildings ────────────────────────────────────────────────────────
# Verified-visit counts at which a spot levels up, per category.
# A café you hit weekly should take more visits than a dinner spot to "max out".
BUILDING_THRESHOLDS: dict[str, tuple[int, int, int]] = {
    "cafe":       (1, 4, 10),
    "restaurant": (1, 3, 7),
    "bar":        (1, 3, 6),
    "salon":      (1, 2, 4),
    "spa":        (1, 2, 4),
    "other":      (1, 3, 7),
}

BUILDING_LABELS = {0: "", 1: "Small house", 2: "Bigger house", 3: "Landmark"}


def building_tier(visit_count: int, category: str | None) -> int:
    """0 = none, 1 = small house, 2 = bigger house, 3 = landmark."""
    t1, t2, t3 = BUILDING_THRESHOLDS.get(category or "other", BUILDING_THRESHOLDS["other"])
    if visit_count >= t3:
        return 3
    if visit_count >= t2:
        return 2
    if visit_count >= t1:
        return 1
    return 0


def building_label(tier: int) -> str:
    return BUILDING_LABELS.get(tier, "")
