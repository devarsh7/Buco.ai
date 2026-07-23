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
