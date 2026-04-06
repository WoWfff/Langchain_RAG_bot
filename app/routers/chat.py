from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.models.agent import AgentResult
from app.models.api import ChatRequest
from app.services.agent import Agent
from app.services.database import Database

router = APIRouter(prefix="/chat", tags=["Chat"])


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
