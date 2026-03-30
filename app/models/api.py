from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class ChatRequest(BaseModel):
    message: str
    thread_id: str
