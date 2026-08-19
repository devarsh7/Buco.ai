import os

from fastapi import APIRouter, Query, Header, HTTPException

from models.schemas import (
    ManagerSpotCard, ManagerSpotsResponse, ClaimBody, GenClaimBody,
    DashboardResponse, VisitStats, ReviewStats, MomentumStat, RedemptionStats,
    RewardCard, ManagerRewardCreate, DeactivateBody, ActionResponse,
    VenueProfile, ProfileUpdateBody, PhotoBody,
)
from db.manager import (
    claim_spot, get_managed_spots, get_dashboard, is_manager,
    generate_claim_code, deactivate_reward, update_profile, change_photo,
)
from db.rewards import create_reward

router = APIRouter(prefix="/manager", tags=["manager"])


@router.get("/spots", response_model=ManagerSpotsResponse)
async def managed_spots(user_id: str = Query(...)):
    rows = await get_managed_spots(user_id)
    return ManagerSpotsResponse(spots=[ManagerSpotCard(**r) for r in rows])


@router.post("/claim", response_model=ActionResponse)
async def claim(body: ClaimBody):
    r = await claim_spot(body.user_id, body.claim_code)
    return ActionResponse(ok=r["ok"], message=r["message"])


@router.get("/{spot_id}/dashboard", response_model=DashboardResponse)
async def dashboard(spot_id: str, user_id: str = Query(...)):
    d = await get_dashboard(user_id, spot_id)
    if d is None:
        raise HTTPException(status_code=403, detail="Not a manager of this venue")
    return DashboardResponse(
        spot_id=d["spot_id"], spot_name=d["spot_name"],
        visits=VisitStats(**d["visits"]),
        reviews=ReviewStats(**d["reviews"]),
        momentum=MomentumStat(**d["momentum"]),
        redemptions=RedemptionStats(**d["redemptions"]),
        rewards=[RewardCard(**r) for r in d["rewards"]],
        profile=VenueProfile(**d.get("profile", {})),
    )


@router.patch("/{spot_id}/profile", response_model=ActionResponse)
async def edit_profile(spot_id: str, body: ProfileUpdateBody):
    fields = body.model_dump(exclude={"user_id"}, exclude_none=True)
    return ActionResponse(**await update_profile(body.user_id, spot_id, fields))


@router.post("/{spot_id}/photos", response_model=ActionResponse)
async def add_photo(spot_id: str, body: PhotoBody):
    return ActionResponse(**await change_photo(body.user_id, spot_id, body.kind, body.url, add=True))


@router.post("/{spot_id}/photos/remove", response_model=ActionResponse)
async def remove_photo(spot_id: str, body: PhotoBody):
    return ActionResponse(**await change_photo(body.user_id, spot_id, body.kind, body.url, add=False))


@router.post("/{spot_id}/rewards", response_model=dict)
async def create_manager_reward(spot_id: str, body: ManagerRewardCreate):
    if not await is_manager(body.user_id, spot_id):
        raise HTTPException(status_code=403, detail="Not a manager of this venue")
    r = await create_reward(
        spot_id=spot_id, title=body.title, cost_points=body.cost_points,
        description=body.description, stock=body.stock, created_by=body.user_id,
    )
    if not r.get("ok"):
        raise HTTPException(status_code=400, detail=r.get("message", "Failed"))
    return r


@router.post("/rewards/{reward_id}/deactivate", response_model=ActionResponse)
async def pause_reward(reward_id: str, body: DeactivateBody):
    r = await deactivate_reward(body.user_id, reward_id)
    return ActionResponse(ok=r["ok"], message=r["message"])


@router.post("/gen-claim-code", response_model=dict)
async def gen_claim_code(body: GenClaimBody, x_admin_key: str | None = Header(default=None)):
    """Admin-only: mint a claim code for a venue. Protect with ADMIN_KEY."""
    expected = os.getenv("ADMIN_KEY")
    if not expected or x_admin_key != expected:
        raise HTTPException(status_code=401, detail="admin only")
    return await generate_claim_code(body.spot_id)
