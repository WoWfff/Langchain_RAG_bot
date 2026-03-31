from fastapi import APIRouter, Request

from app.models.api import HealthResponse, ProgressResponse

router = APIRouter(prefix="/health")


@router.get("/", response_model=HealthResponse)
async def get_health():
    return HealthResponse(status="ok")


@router.get("/status")
async def status(request: Request):
    return ProgressResponse(
        progress=request.app.state.progress,
        status=request.app.state.status,
        is_ready=request.app.state.is_ready,
        error=request.app.state.error,
    )
