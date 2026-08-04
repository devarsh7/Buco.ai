from fastapi import APIRouter, Query

from models.schemas import (
    ReviewCreate, ReviewCreateResponse, ReviewCard, ReviewsResponse,
)
from db.reviews import create_review, get_spot_reviews, get_review_feed

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.post("/", response_model=ReviewCreateResponse)
async def post_review(payload: ReviewCreate):
    """Post a review — only allowed if the user has a verified visit here."""
    result = await create_review(
        user_id=payload.user_id,
        spot_id=payload.spot_id,
        worth_it=payload.worth_it,
        actual_spend=payload.actual_spend,
        comment=payload.comment,
    )
    return ReviewCreateResponse(**result)


@router.get("/feed", response_model=ReviewsResponse)
async def review_feed(limit: int = Query(default=30, le=100)):
    """Recent verified reviews across the city — social proof."""
    rows = await get_review_feed(limit=limit)
    return ReviewsResponse(reviews=[ReviewCard(**r) for r in rows])


@router.get("/spot/{spot_id}", response_model=ReviewsResponse)
async def spot_reviews(spot_id: str, limit: int = Query(default=20, le=100)):
    rows = await get_spot_reviews(spot_id, limit=limit)
    return ReviewsResponse(reviews=[ReviewCard(**r) for r in rows])
