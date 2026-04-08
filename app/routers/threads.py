from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.models.api import ActiveThreadResponse, ThreadResponse
from app.services.database import Database

router = APIRouter(prefix="/threads", tags=["Threads_id"])


def get_db(request: Request) -> Database:
    return request.app.state.database


@router.get("/", response_model=list[ThreadResponse])
async def get_threads(request: Request, db: Annotated[Database, Depends(get_db)]):
    threads = await db.get_user_threads(user_id=request.state.user_id)
    return [ThreadResponse(thread_id=t.thread_id, thread_name=t.name, created_at=t.created_at) for t in threads]


@router.post("/new")
async def create_new_thread(request: Request, db: Annotated[Database, Depends(get_db)]):
    thread = await db.create_and_set_active_thread(user_id=request.state.user_id)
    return {"thread_id": thread.thread_id, "message": "New thread created and set as active"}


@router.post("/{thread_id}/activate")
async def activate_thread(thread_id: str, request: Request, db: Annotated[Database, Depends(get_db)]):
    """
    Set active thread for user.

    Args:
        thread_id: Thread ID to set as active

    Raises:
        ThreadNotFoundOrDoestBelongError: If thread not found or doesn't belong to user
    """
    await db.set_active_thread(user_id=request.state.user_id, thread_id=thread_id)
    return {"message": "Thread activated", "thread_id": thread_id}


@router.put("/{thread_id}/{name}")
async def set_thread_name(thread_id: str, name: str, request: Request, db: Annotated[Database, Depends(get_db)]):
    await db.set_thread_name(user_id=request.state.user_id, thread_id=thread_id, name=name)
    return {"message": f"Thread name '{name}' successfully set to thread '{thread_id}'."}


@router.delete("/{thread_id}", response_model=ThreadResponse)
async def delete_thread(thread_id: str, request: Request, db: Annotated[Database, Depends(get_db)]):
    """
    Delete user`s thread.
    """
    active_thread = await db.remove_user_thread(user_id=request.state.user_id, thread_id=thread_id)

    return ActiveThreadResponse(thread_id=active_thread)
