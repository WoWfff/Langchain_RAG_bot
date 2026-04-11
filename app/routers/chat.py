import json
import logging
from collections.abc import AsyncIterable
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent

from app.models.agent import AgentResult, StreamError
from app.models.api import ChatRequest
from app.models.exceptions import InvalidAgentResponseError
from app.services.agent import Agent
from app.services.database import Database

logger = logging.getLogger(__name__)


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
    """
    Get chat history for a specific thread.

    Raises:
        AgentHistoryError: If failed to retrieve history
    """
    history = await agent.get_thread_history(thread_id=thread_id)
    return {"messages": history}


@router.post("/process_message", response_model=AgentResult)
async def process_message(
    request: Request,
    request_data: ChatRequest,
    agent: Annotated[Agent, Depends(get_agent)],
):
    """
    Process a chat message and return the agent's response.

    Raises:
        AgentProcessingError: If agent fails to process the message
        InvalidAgentResponseError: If agent returns invalid response format
    """
    result = await agent.process_message(message=request_data.message, thread_id=request.state.thread_id)

    if not isinstance(result, AgentResult):
        raise InvalidAgentResponseError("Agent returned invalid response format")

    return result


@router.post("/stream_message", response_class=EventSourceResponse)
async def stream_message(
    request: Request,
    request_data: ChatRequest,
    agent: Annotated[Agent, Depends(get_agent)],
) -> AsyncIterable[ServerSentEvent]:
    """
    Stream chat messages with Server-Sent Events.

    Raises:
        AgentProcessingError: If agent fails to process the message
    """
    try:
        async for chunk in agent.stream_message(
            message=request_data.message,
            thread_id=request.state.thread_id,
            debug=False,
        ):
            if isinstance(chunk, AgentResult):
                if chunk.response_text or chunk.tool_response:
                    yield ServerSentEvent(raw_data=json.dumps(chunk.model_dump(), ensure_ascii=False), event="chunk")
    except Exception as e:  # noqa: BLE001
        # Send error as SSE event to frontend
        error_response = StreamError(error=str(e), type=type(e).__name__, retry_after=getattr(e, "retry_after", None))

        logger.info(f"Sending error event to frontend: {error_response.type} - {error_response.error}")
        yield ServerSentEvent(raw_data=json.dumps(error_response.model_dump(), ensure_ascii=False), event="error")
