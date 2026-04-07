import json
from collections.abc import AsyncIterable
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

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


@router.get("/history/{thread_id}")
async def get_history(
    thread_id: str,
    request: Request,
    agent: Annotated[Agent, Depends(get_agent)],
):
    try:
        history = await agent.get_thread_history(thread_id=thread_id)
        return {"messages": history}
    except Exception as err:
        raise HTTPException(500, detail=f"Failed to get history: {err}") from err


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


@router.post("/stream_message", response_class=EventSourceResponse)
async def stream_message(
    request: Request,
    request_data: ChatRequest,
    agent: Annotated[Agent, Depends(get_agent)],
) -> AsyncIterable[ServerSentEvent]:
    try:
        async for chunk in agent.stream_message(
            message=request_data.message,
            thread_id=request.state.thread_id,
            debug=False,
        ):
            if isinstance(chunk, AgentResult):
                if chunk.response_text or chunk.tool_response:
                    yield ServerSentEvent(raw_data=json.dumps(chunk.model_dump(), ensure_ascii=False), event="chunk")
    except Exception as err:  # noqa: BLE001
        yield ServerSentEvent(
            raw_data=json.dumps({"error": str(err)}, ensure_ascii=False),
            event="error",
        )
