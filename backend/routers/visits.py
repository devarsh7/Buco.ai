from fastapi import APIRouter, Query

from models.schemas import VisitCreate, VisitResponse, MapPin, MapResponse, PointsResponse
from db.visits import (
    create_visit,
    get_user_map,
    spots_in_bounds,
    get_points_balance,
)

router = APIRouter(prefix="/visits", tags=["visits"])


@router.post("/", response_model=VisitResponse)
async def check_in(payload: VisitCreate):
    """Record a check-in. Verification (GPS radius + freshness + dedupe) is
    decided server-side; the response says whether it counted.

    Note: the 6-hour dedupe already blocks check-in spam per spot. For global
    per-IP rate limiting at scale, point the shared slowapi Limiter at Upstash
    Redis (storage_uri=UPSTASH_REDIS_URL) so limits hold across workers.
    """
    result = await create_visit(
        user_id=payload.user_id,
        spot_id=payload.spot_id,
        lat=payload.lat,
        lng=payload.lng,
        photo_url=payload.photo_url,
    )
    return VisitResponse(**result)


@router.get("/map", response_model=MapResponse)
async def get_map(
    user_id: str = Query(...),
    min_lng: float | None = Query(default=None),
    min_lat: float | None = Query(default=None),
    max_lng: float | None = Query(default=None),
    max_lat: float | None = Query(default=None),
):
    """Layered map for a user: their visited buildings + wishlist, plus the
    discovery layer bounded to the current viewport when bounds are given."""
    layers = await get_user_map(user_id)
    visited = [MapPin(**p) for p in layers["visited"]]
    wishlist = [MapPin(**p) for p in layers["wishlist"]]

    discovery: list[MapPin] = []
    if None not in (min_lng, min_lat, max_lng, max_lat):
        seen = {p.spot_id for p in visited} | {p.spot_id for p in wishlist}
        for s in await spots_in_bounds(min_lng, min_lat, max_lng, max_lat):
            if s["id"] in seen:
                continue
            discovery.append(MapPin(
                spot_id=s["id"], name=s.get("name", ""),
                lat=s.get("lat"), lng=s.get("lng"),
                category=s.get("category", ""), layer="discovery",
            ))

    points = await get_points_balance(user_id)
    return MapResponse(
        visited=visited, wishlist=wishlist, discovery=discovery, points=points
    )


@router.get("/points", response_model=PointsResponse)
async def get_points(user_id: str = Query(...)):
    return PointsResponse(points=await get_points_balance(user_id))
