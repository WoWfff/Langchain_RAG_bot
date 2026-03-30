from fastapi import APIRouter, Request

from app.models.api import HealthResponse

router = APIRouter(prefix="/health")


@router.get("/", response_model=HealthResponse)
async def get_health():
    return HealthResponse(status="ok")


@router.get("/status")
async def status(request: Request):
    return {
        "ready": request.app.state.is_ready,
        "status": request.app.state.status,
        "progress": request.app.state.progress,
        "error": request.app.state.error,
    }
