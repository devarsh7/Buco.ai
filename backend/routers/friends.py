from fastapi import APIRouter, Query

from models.schemas import (
    FriendsResponse, FriendCard, FriendRequestBody, FriendRespondBody,
    SharingBody, ActionResponse, FriendPin, FriendsMapResponse,
)
from db.friends import (
    list_friends, send_request, respond_request, set_sharing, friends_map,
)

router = APIRouter(prefix="/friends", tags=["friends"])


@router.get("/", response_model=FriendsResponse)
async def get_friends(user_id: str = Query(...)):
    data = await list_friends(user_id)
    return FriendsResponse(
        code=data["code"],
        share_visits=data["share_visits"],
        friends=[FriendCard(**f) for f in data["friends"]],
        incoming=[FriendCard(**f) for f in data["incoming"]],
        outgoing=[FriendCard(**f) for f in data["outgoing"]],
    )


@router.post("/request", response_model=ActionResponse)
async def request_friend(body: FriendRequestBody):
    return ActionResponse(**await send_request(body.user_id, body.code))


@router.post("/respond", response_model=ActionResponse)
async def respond_friend(body: FriendRespondBody):
    return ActionResponse(**await respond_request(body.user_id, body.friendship_id, body.accept))


@router.patch("/sharing", response_model=ActionResponse)
async def update_sharing(body: SharingBody):
    ok = await set_sharing(body.user_id, body.share_visits)
    return ActionResponse(ok=ok, message="Sharing updated." if ok else "Couldn't update sharing.")


@router.get("/map", response_model=FriendsMapResponse)
async def get_friends_map(user_id: str = Query(...)):
    pins = await friends_map(user_id)
    return FriendsMapResponse(pins=[FriendPin(**p) for p in pins])
