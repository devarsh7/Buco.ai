from pydantic import BaseModel, Field
from typing import Optional
from uuid import UUID
from datetime import datetime


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    timestamp: Optional[datetime] = None


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    city: str = "Toronto, ON"
    user_lat: Optional[float] = None
    user_lng: Optional[float] = None


class ChatResponse(BaseModel):
    session_id: str
    message: str
    spots: Optional[list["SpotCard"]] = None


# ── Spots ─────────────────────────────────────────────────────────────────────

class SpotCard(BaseModel):
    id: str
    name: str
    category: str = ""
    cuisine_tags: list[str] = []
    address: str = ""
    city: str = ""
    postal_code: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    price_min: Optional[float] = None
    price_max: Optional[float] = None
    price_label: str = ""
    distance_km: Optional[float] = None
    phone: str = ""
    website: str = ""
    image_url: str = ""
    rating: Optional[float] = None
    buco_pick: bool = False
    buco_score: Optional[float] = None
    is_open: Optional[bool] = None
    happy_hour_now: bool = False
    happy_hour_label: str = ""
    source: str = "yelp"


class SpotDetail(SpotCard):
    hours: Optional[dict] = None
    happy_hour: Optional[dict] = None
    menu_url: str = ""
    photos: list[str] = []


class SpotsResponse(BaseModel):
    spots: list[SpotCard]
    total: int
    query: str


# ── Bookmarks ─────────────────────────────────────────────────────────────────

class BookmarkCreate(BaseModel):
    spot_id: str
    user_id: str
    note: Optional[str] = ""
    # Full spot payload — required when bookmarking an external (Yelp) spot
    # that isn't in the spots table yet.
    spot: Optional[dict] = None


class BookmarkResponse(BaseModel):
    id: UUID
    spot_id: str
    user_id: str
    note: str
    visited: bool
    created_at: datetime
    spot: Optional[SpotCard] = None


# ── Living map: visits & buildings ────────────────────────────────────────────

class VisitCreate(BaseModel):
    user_id: str
    spot_id: str
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    photo_url: str = ""


class VisitResponse(BaseModel):
    ok: bool
    id: Optional[str] = None
    spot_id: str = ""
    verified: bool = False
    distance_m: Optional[float] = None
    visit_count: int = 0
    building_tier: int = 0          # 0 none · 1 small · 2 bigger · 3 landmark
    building_label: str = ""
    leveled_up: bool = False
    previous_tier: int = 0
    points_awarded: int = 0
    message: str = ""
    error: Optional[str] = None


class ReviewCreate(BaseModel):
    user_id: str
    spot_id: str
    worth_it: bool
    actual_spend: Optional[float] = None
    comment: str = Field(default="", max_length=600)


class ReviewCreateResponse(BaseModel):
    ok: bool
    points_awarded: int = 0
    message: str = ""
    error: Optional[str] = None


class ReviewCard(BaseModel):
    id: str
    spot_id: str = ""
    user_id: str = ""
    worth_it: bool = True
    actual_spend: Optional[float] = None
    comment: str = ""
    created_at: Optional[datetime] = None
    user_name: str = ""
    spot_name: str = ""
    spot_category: str = ""


class ReviewsResponse(BaseModel):
    reviews: list[ReviewCard] = []


class PointsResponse(BaseModel):
    points: int = 0


# ── Friends ───────────────────────────────────────────────────────────────────

class FriendCard(BaseModel):
    friendship_id: str
    user_id: str
    name: str = ""
    share_visits: bool = False


class FriendsResponse(BaseModel):
    code: str = ""
    share_visits: bool = False
    friends: list[FriendCard] = []
    incoming: list[FriendCard] = []
    outgoing: list[FriendCard] = []


class FriendRequestBody(BaseModel):
    user_id: str
    code: str


class FriendRespondBody(BaseModel):
    user_id: str
    friendship_id: str
    accept: bool


class SharingBody(BaseModel):
    user_id: str
    share_visits: bool


class ActionResponse(BaseModel):
    ok: bool
    message: str = ""


class FriendPin(BaseModel):
    spot_id: str
    name: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    category: str = ""
    friend_names: list[str] = []
    friend_count: int = 0


class FriendsMapResponse(BaseModel):
    pins: list[FriendPin] = []


# ── Collaborative plans (shared lists) ────────────────────────────────────────

class ListCreate(BaseModel):
    user_id: str
    name: str = Field(default="", max_length=80)


class ListCard(BaseModel):
    id: str
    name: str = ""
    owner_id: str = ""
    item_count: int = 0
    member_count: int = 0


class ListsResponse(BaseModel):
    lists: list[ListCard] = []


class ListMemberBody(BaseModel):
    user_id: str
    friend_id: str


class ListItemBody(BaseModel):
    user_id: str
    spot_id: str
    note: str = Field(default="", max_length=200)
    # Full spot payload — required when adding an external (Yelp) spot not yet in the DB.
    spot: Optional[dict] = None


class ListMemberCard(BaseModel):
    user_id: str
    name: str = ""


class ListItemCard(BaseModel):
    id: str
    spot_id: str
    name: str = ""
    category: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    note: str = ""
    added_by_name: str = ""


class ListDetail(BaseModel):
    id: str
    name: str = ""
    owner_id: str = ""
    members: list[ListMemberCard] = []
    items: list[ListItemCard] = []


# ── Area heat / towers ────────────────────────────────────────────────────────

class TowerCard(BaseModel):
    geohash7: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    tier: int = 0                 # 1 small · 2 tall · 3 blazing
    visitor_count: int = 0
    spot_names: list[str] = []


class TowersResponse(BaseModel):
    towers: list[TowerCard] = []


class RecomputeResponse(BaseModel):
    ok: bool
    areas_scored: int = 0
    towers: int = 0
    message: str = ""


# ── Rewards & redemption ──────────────────────────────────────────────────────

class RewardCard(BaseModel):
    id: str
    spot_id: str
    title: str = ""
    description: str = ""
    cost_points: int = 0
    stock: Optional[int] = None
    terms: str = ""


class RewardsResponse(BaseModel):
    rewards: list[RewardCard] = []


class RewardCreate(BaseModel):
    spot_id: str
    title: str = Field(..., max_length=120)
    cost_points: int = Field(..., gt=0)
    description: str = Field(default="", max_length=400)
    stock: Optional[int] = None
    created_by: Optional[str] = None


class RedeemBody(BaseModel):
    user_id: str
    reward_id: str


class RedeemResult(BaseModel):
    ok: bool
    code: str = ""
    title: str = ""
    expires_at: Optional[str] = None
    message: str = ""


class RedemptionCard(BaseModel):
    id: str
    code: str
    status: str = "issued"
    expires_at: Optional[str] = None
    title: str = ""
    spot_name: str = ""


class RedemptionsResponse(BaseModel):
    redemptions: list[RedemptionCard] = []


class RedeemCodeBody(BaseModel):
    code: str
    spot_id: Optional[str] = None


class RedeemCodeResult(BaseModel):
    ok: bool
    reward_title: str = ""
    spot_name: str = ""
    message: str = ""


# ── Restaurant manager / dashboard ────────────────────────────────────────────

class ManagerSpotCard(BaseModel):
    spot_id: str
    name: str = ""
    city: str = ""


class ManagerSpotsResponse(BaseModel):
    spots: list[ManagerSpotCard] = []


class ClaimBody(BaseModel):
    user_id: str
    claim_code: str


class GenClaimBody(BaseModel):
    spot_id: str


class DayCount(BaseModel):
    date: str
    count: int = 0


class VisitStats(BaseModel):
    total: int = 0
    unique_visitors: int = 0
    repeat_visitors: int = 0
    last_7d: int = 0
    last_30d: int = 0
    daily: list[DayCount] = []


class DashReview(BaseModel):
    user_name: str = ""
    worth_it: bool = True
    actual_spend: Optional[float] = None
    comment: str = ""
    created_at: Optional[datetime] = None


class ReviewStats(BaseModel):
    count: int = 0
    worth_it_pct: int = 0
    avg_spend: Optional[float] = None
    recent: list[DashReview] = []


class MomentumStat(BaseModel):
    tier: int = 0
    visitor_count: int = 0


class RedemptionStats(BaseModel):
    issued: int = 0
    redeemed: int = 0
    points_spent: int = 0


class DashboardResponse(BaseModel):
    spot_id: str
    spot_name: str = ""
    visits: VisitStats
    reviews: ReviewStats
    momentum: MomentumStat
    redemptions: RedemptionStats
    rewards: list[RewardCard] = []


class ManagerRewardCreate(BaseModel):
    user_id: str
    title: str = Field(..., max_length=120)
    cost_points: int = Field(..., gt=0)
    description: str = Field(default="", max_length=400)
    stock: Optional[int] = None


class DeactivateBody(BaseModel):
    user_id: str


class MapPin(BaseModel):
    spot_id: str
    name: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    category: str = ""
    layer: str = "discovery"        # "discovery" | "wishlist" | "visited"
    visit_count: int = 0
    building_tier: int = 0
    building_label: str = ""


class MapResponse(BaseModel):
    visited: list[MapPin] = []
    wishlist: list[MapPin] = []
    discovery: list[MapPin] = []
    points: int = 0


# ── SSE Event types streamed to frontend ──────────────────────────────────────

class SSETextEvent(BaseModel):
    type: str = "text"
    content: str


class SSESpotsEvent(BaseModel):
    type: str = "spots"
    spots: list[SpotCard]


class SSEDoneEvent(BaseModel):
    type: str = "done"


class SSEErrorEvent(BaseModel):
    type: str = "error"
    message: str
