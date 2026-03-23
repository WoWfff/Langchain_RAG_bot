from fastapi import APIRouter, Depends, Request

from app.models.api import ChatRequest, ChatResponse
from app.services.agent import Agent

router = APIRouter(prefix="/chat")


def get_agent(request: Request):
    return request.app.state.agent


@router.post("/")
async def chat(
    request_data: ChatRequest,
    agent: Agent = Depends(get_agent),
):
    chunks = []

    async for chunk, tool_state in agent.stream_message(message=request_data.message, thread_id=request_data.thread_id):
        chunks.append(chunk)
        tool_state = tool_state

    return ChatResponse(message="".join(chunks), tool_usage=tool_state)
