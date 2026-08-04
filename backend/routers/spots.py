from fastapi import APIRouter, Query, HTTPException
from models.schemas import SpotCard, SpotsResponse
from db.supabase import search_curated_spots, get_spot_by_id
from agent.tools import _happy_hour_status, perform_search

router = APIRouter(prefix="/spots", tags=["spots"])


def _with_happy_hour(spot: dict) -> dict:
    active, label = _happy_hour_status(spot)
    return {**spot, "happy_hour_now": active, "happy_hour_label": label}


@router.get("/", response_model=SpotsResponse)
async def get_spots(
    q: str = Query(default=""),
    city: str = Query(default="Toronto"),
    category: str | None = Query(default=None),
    price_max: float | None = Query(default=None),
    limit: int = Query(default=10, le=50),
):
    spots = await search_curated_spots(query=q, city=city, category=category, price_max=price_max, limit=limit)
    return SpotsResponse(spots=[SpotCard(**_with_happy_hour(s)) for s in spots], total=len(spots), query=q)


@router.get("/yelp", response_model=SpotsResponse)
async def yelp_search(
    q: str = Query(...),
    city: str = Query(default="Toronto, ON"),
    limit: int = Query(default=8, le=20),
):
    """Yelp-only search (no curated seed) — used for adding any restaurant to a plan."""
    result = await perform_search(query=q, location=city, price_max=999, include_curated=False)
    spots = (result.get("spots") or [])[:limit]
    return SpotsResponse(spots=[SpotCard(**_with_happy_hour(s)) for s in spots], total=len(spots), query=q)


@router.get("/{spot_id}", response_model=SpotCard)
async def get_spot(spot_id: str):
    spot = await get_spot_by_id(spot_id)
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")
    return SpotCard(**_with_happy_hour(spot))
