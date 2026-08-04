from fastapi import APIRouter, Query, HTTPException

from models.schemas import (
    ListCreate, ListCard, ListsResponse, ListMemberBody, ListItemBody,
    ListDetail, ListMemberCard, ListItemCard, ActionResponse,
)
from db.lists import (
    create_list, get_lists, get_list_detail, add_member, add_item, remove_item,
    rename_list, delete_list,
)

router = APIRouter(prefix="/lists", tags=["lists"])


@router.get("/", response_model=ListsResponse)
async def list_plans(user_id: str = Query(...)):
    rows = await get_lists(user_id)
    return ListsResponse(lists=[ListCard(**r) for r in rows])


@router.post("/", response_model=ListCard)
async def new_plan(body: ListCreate):
    r = await create_list(body.user_id, body.name)
    if not r.get("ok"):
        raise HTTPException(status_code=400, detail=r.get("message", "Failed"))
    return ListCard(**{k: r[k] for k in ("id", "name", "owner_id", "item_count", "member_count")})


@router.patch("/{list_id}", response_model=ActionResponse)
async def rename_plan(list_id: str, body: ListCreate):
    return ActionResponse(**await rename_list(body.user_id, list_id, body.name))


@router.delete("/{list_id}", response_model=ActionResponse)
async def remove_plan(list_id: str, user_id: str = Query(...)):
    return ActionResponse(**await delete_list(user_id, list_id))


@router.get("/{list_id}", response_model=ListDetail)
async def plan_detail(list_id: str, user_id: str = Query(...)):
    d = await get_list_detail(user_id, list_id)
    if d is None:
        raise HTTPException(status_code=404, detail="Not found or not a member")
    return ListDetail(
        id=d["id"], name=d["name"], owner_id=d["owner_id"],
        members=[ListMemberCard(**m) for m in d["members"]],
        items=[ListItemCard(**i) for i in d["items"]],
    )


@router.post("/{list_id}/members", response_model=ActionResponse)
async def add_plan_member(list_id: str, body: ListMemberBody):
    return ActionResponse(**await add_member(body.user_id, list_id, body.friend_id))


@router.post("/{list_id}/items", response_model=ActionResponse)
async def add_plan_item(list_id: str, body: ListItemBody):
    return ActionResponse(**await add_item(body.user_id, list_id, body.spot_id, body.note, body.spot))


@router.delete("/{list_id}/items/{spot_id}", response_model=ActionResponse)
async def remove_plan_item(list_id: str, spot_id: str, user_id: str = Query(...)):
    return ActionResponse(**await remove_item(user_id, list_id, spot_id))
