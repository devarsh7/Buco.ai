from fastapi import APIRouter, HTTPException
from models.schemas import BookmarkCreate
from db.supabase import save_bookmark, get_user_bookmarks, delete_bookmark

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])


@router.post("/")
async def create_bookmark(payload: BookmarkCreate):
    result = await save_bookmark(
        user_id=payload.user_id,
        spot_id=payload.spot_id,
        note=payload.note or "",
        spot=payload.spot,
    )
    if not result:
        raise HTTPException(status_code=500, detail="Could not save to Wishlist")
    return {"success": True, "message": "Saved to your Wishlist", "bookmark": result}


@router.get("/{user_id}")
async def list_bookmarks(user_id: str):
    bookmarks = await get_user_bookmarks(user_id)
    return {"bookmarks": bookmarks, "total": len(bookmarks)}


@router.delete("/{user_id}/{bookmark_id}")
async def remove_bookmark(user_id: str, bookmark_id: str):
    ok = await delete_bookmark(user_id=user_id, bookmark_id=bookmark_id)
    if not ok:
        raise HTTPException(status_code=500, detail="Could not remove from Wishlist")
    return {"success": True}
