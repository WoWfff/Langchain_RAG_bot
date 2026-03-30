from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.models.agent import AgentResult
from app.models.api import ChatRequest
from app.services.agent import Agent

router = APIRouter(prefix="/chat")


def get_agent(request: Request) -> Agent:
    return request.app.state.agent


@router.post("/process_message", response_model=AgentResult)
async def process_message(
    request_data: ChatRequest,
    agent: Annotated[Agent, Depends(get_agent)],
):
    result = await agent.process_message(message=request_data.message, thread_id=request_data.thread_id)

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
