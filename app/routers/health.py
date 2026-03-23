from fastapi import APIRouter

from app.models.api import HealthResponse

router = APIRouter(prefix="/health")


@router.get("/", response_model=HealthResponse)
async def get_health():
    return HealthResponse(status="ok")
