import os

from fastapi import APIRouter, Query, Header, HTTPException

from models.schemas import TowerCard, TowersResponse, RecomputeResponse
from db.heat import recompute_heat, get_towers

router = APIRouter(prefix="/heat", tags=["heat"])


@router.get("/towers", response_model=TowersResponse)
async def towers(
    min_lng: float | None = Query(default=None),
    min_lat: float | None = Query(default=None),
    max_lng: float | None = Query(default=None),
    max_lat: float | None = Query(default=None),
):
    rows = await get_towers(min_lng, min_lat, max_lng, max_lat)
    return TowersResponse(towers=[TowerCard(**t) for t in rows])


@router.post("/recompute", response_model=RecomputeResponse)
async def recompute(x_cron_key: str | None = Header(default=None)):
    """Recompute area heat + tiers. Call on a schedule (~15 min).
    Protect with HEAT_CRON_KEY in production so only your cron can trigger it."""
    expected = os.getenv("HEAT_CRON_KEY")
    if expected and x_cron_key != expected:
        raise HTTPException(status_code=401, detail="bad cron key")
    result = await recompute_heat()
    return RecomputeResponse(**result)
