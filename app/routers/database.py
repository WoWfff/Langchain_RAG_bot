from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.models.api import AddUserRequest
from app.services.database import Database

router = APIRouter(prefix="/database")


def get_session(request: Request) -> Database:
    return request.app.state.database


@router.post("/add_user")
async def add_user(request: AddUserRequest, database: Annotated[Database, Depends(get_session)]):
    try:
        await database.add_user(
            cookies_id=request.cookies_id,
            thread_id=request.thread_id,
        )
        return {"status": "ok"}
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err)) from err
