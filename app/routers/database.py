from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.models.api import AddUserRequest, DeleteThreadRequest
from app.services.database import Database

router = APIRouter(prefix="/database", tags=["DEBUG"])


def get_db(request: Request) -> Database:
    return request.app.state.database


@router.post("/add_user")
async def add_user(request: AddUserRequest, db: Annotated[Database, Depends(get_db)]):
    await db.add_user(
        cookies_id=request.cookies_id,
    )
    return {"message": "ONLY FOR DEBUG"}


@router.post("/delete_thread")
async def delete_thread(request: DeleteThreadRequest, db: Annotated[Database, Depends(get_db)]):
    try:
        await db.delete_thread(thread_id=request.thread_id)
        return {"message": "ONLY FOR DEBUG"}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err)) from err
