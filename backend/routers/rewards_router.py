from fastapi import APIRouter, Query, HTTPException

from models.schemas import (
    RewardCard, RewardsResponse, RewardCreate, RedeemBody, RedeemResult,
    RedemptionCard, RedemptionsResponse, RedeemCodeBody, RedeemCodeResult,
)
from db.rewards import (
    list_spot_rewards, create_reward, redeem_reward, get_my_redemptions, redeem_code,
)

router = APIRouter(prefix="/rewards", tags=["rewards"])


@router.get("/spot/{spot_id}", response_model=RewardsResponse)
async def spot_rewards(spot_id: str):
    rows = await list_spot_rewards(spot_id)
    return RewardsResponse(rewards=[RewardCard(**r) for r in rows])


@router.post("/", response_model=dict)
async def new_reward(body: RewardCreate):
    r = await create_reward(
        spot_id=body.spot_id, title=body.title, cost_points=body.cost_points,
        description=body.description, stock=body.stock, created_by=body.created_by,
    )
    if not r.get("ok"):
        raise HTTPException(status_code=400, detail=r.get("message", "Failed"))
    return r


@router.post("/redeem", response_model=RedeemResult)
async def redeem(body: RedeemBody):
    return RedeemResult(**await redeem_reward(body.user_id, body.reward_id))


@router.get("/mine", response_model=RedemptionsResponse)
async def my_redemptions(user_id: str = Query(...)):
    rows = await get_my_redemptions(user_id)
    return RedemptionsResponse(redemptions=[RedemptionCard(**r) for r in rows])


@router.post("/redeem-code", response_model=RedeemCodeResult)
async def merchant_redeem_code(body: RedeemCodeBody):
    return RedeemCodeResult(**await redeem_code(body.code, body.spot_id))
