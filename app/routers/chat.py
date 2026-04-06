from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.models.agent import AgentResult
from app.models.api import ChatRequest, ThreadResponse
from app.services.agent import Agent
from app.services.database import Database

router = APIRouter(prefix="/chat")


def get_agent(request: Request) -> Agent:
    return request.app.state.agent


def get_db(request: Request) -> Database:
    return request.app.state.database


@router.get("/")
async def main_page(request: Request):
    db: Database = request.app.state.database
    threads = await db.get_user_threads(user_id=request.state.user_id)
    return [thread.thread_id for thread in threads]


@router.post("/process_message", response_model=AgentResult)
async def process_message(
    request: Request,
    request_data: ChatRequest,
    agent: Annotated[Agent, Depends(get_agent)],
):
    result = await agent.process_message(message=request_data.message, thread_id=request.state.thread_id)

    if not isinstance(result, AgentResult):
        raise HTTPException(500, detail="Invalid agent response")

    return result


# @router.post("/stream_message")
# async def stream_message(
#     request_data: ChatRequest,
#     agent: Annotated[Agent, Depends(get_agent)],
# ):
#     chunks = []

#     async for chunk, tool_state in agent.stream_message(message=request_data.message, thread_id=request_data.thread_id):
#         chunks.append(chunk)
#         tool_state = tool_state

#     return ChatResponse(message="".join(chunks), tool_usage=tool_state)


@router.post("/threads/new")
async def create_new_thread(request: Request, db: Annotated[Database, Depends(get_db)]):
    thread = await db.create_and_set_active_thread(user_id=request.state.user_id)
    return {"thread_id": thread.thread_id, "message": "New thread created and set as active"}


@router.post("/threads/{thread_id}/activate")
async def activate_thread(thread_id: str, request: Request, db: Annotated[Database, Depends(get_db)]):
    thread = await db.get_thread_by_id(thread_id=thread_id)

    if not thread or thread.user_id != request.state.user_id:
        raise HTTPException(404, "Thread not found")

    await db.set_active_thread(user_id=request.state.user_id, thread_id=thread_id)
    return {"message": "Thread activated", "thread_id": thread_id}


@router.get("/threads", response_model=list[ThreadResponse])
async def get_threads(request: Request, db: Annotated[Database, Depends(get_db)]):
    threads = await db.get_user_threads(user_id=request.state.user_id)
    return [ThreadResponse(thread_id=t.thread_id, created_at=t.created_at) for t in threads]
