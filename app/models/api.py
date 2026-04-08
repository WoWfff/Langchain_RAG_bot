from datetime import datetime

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class ChatRequest(BaseModel):
    message: str


class ProgressResponse(BaseModel):
    progress: int
    status: str
    is_ready: bool
    error: str | None


class AddUserRequest(BaseModel):
    cookies_id: str
    thread_id: str | None


class DeleteThreadRequest(BaseModel):
    thread_id: str


class ThreadResponse(BaseModel):
    thread_id: str
    thread_name: str | None = None
    created_at: datetime


class ActiveThreadResponse(BaseModel):
    thread_id: str | None


class RenameThreadRequest(BaseModel):
    name: str
