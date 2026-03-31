from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class ChatRequest(BaseModel):
    message: str
    thread_id: str


class ProgressResponse(BaseModel):
    progress: int
    status: str
    is_ready: bool
    error: str | None
