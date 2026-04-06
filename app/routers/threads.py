from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.models.api import ThreadResponse
from app.services.database import Database

router = APIRouter(prefix="/threads", tags=["Threads_id"])


def get_db(request: Request) -> Database:
    return request.app.state.database


@router.get("/", response_model=list[ThreadResponse])
async def get_threads(request: Request, db: Annotated[Database, Depends(get_db)]):
    threads = await db.get_user_threads(user_id=request.state.user_id)
    return [ThreadResponse(thread_id=t.thread_id, created_at=t.created_at) for t in threads]


@router.post("/new")
async def create_new_thread(request: Request, db: Annotated[Database, Depends(get_db)]):
    thread = await db.create_and_set_active_thread(user_id=request.state.user_id)
    return {"thread_id": thread.thread_id, "message": "New thread created and set as active"}


@router.post("/{thread_id}/activate")
async def activate_thread(thread_id: str, request: Request, db: Annotated[Database, Depends(get_db)]):
    thread = await db.get_thread_by_id(thread_id=thread_id)

    if not thread or thread.user_id != request.state.user_id:
        raise HTTPException(404, "Thread not found")

    await db.set_active_thread(user_id=request.state.user_id, thread_id=thread_id)
    return {"message": "Thread activated", "thread_id": thread_id}


@router.delete("/{thread_id}")
async def delete_thread(thread_id: str, request: Request, db: Annotated[Database, Depends(get_db)]):
    if thread_id == request.state.thread_id:
        raise HTTPException(status_code=400, detail="Cannot delete active thread. Switch to another thread first.")

    await db.remove_user_thread(user_id=request.state.user_id, thread_id=thread_id)

    return {"message": "Thread deleted successfully"}
