import logging

from fastapi import Request, status
from fastapi.responses import JSONResponse

from app.models.exceptions import (
    AgentHistoryError,
    AgentProcessingError,
    InvalidAgentResponseError,
    ThreadAlreadyExistsError,
    ThreadNotFoundError,
    ThreadNotFoundOrDoestBelongError,
    UserNotFoundError,
    UserWithCookiesExists,
)

logger = logging.getLogger(__name__)


def register_exception_handlers(app):
    """Register all exception handlers for the application"""

    @app.exception_handler(UserNotFoundError)
    async def user_not_found_handler(request: Request, exc: UserNotFoundError):  # noqa: RUF029
        logger.warning(f"User not found: {exc}")
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)})

    @app.exception_handler(UserWithCookiesExists)
    async def user_exists_handler(request: Request, exc: UserWithCookiesExists):  # noqa: RUF029
        logger.warning(f"User already exists: {exc}")
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc)})

    @app.exception_handler(ThreadNotFoundError)
    async def thread_not_found_handler(request: Request, exc: ThreadNotFoundError):  # noqa: RUF029
        logger.warning(f"Thread not found: {exc}")
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)})

    @app.exception_handler(ThreadNotFoundOrDoestBelongError)
    async def thread_not_belong_handler(request: Request, exc: ThreadNotFoundOrDoestBelongError):  # noqa: RUF029
        logger.warning(f"Thread not found or doesn't belong to user: {exc}")
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": str(exc)})

    @app.exception_handler(ThreadAlreadyExistsError)
    async def thread_exists_handler(request: Request, exc: ThreadAlreadyExistsError):  # noqa: RUF029
        logger.warning(f"Thread already exists: {exc}")
        return JSONResponse(status_code=status.HTTP_409_CONFLICT, content={"detail": str(exc)})

    @app.exception_handler(AgentHistoryError)
    async def agent_history_error_handler(request: Request, exc: AgentHistoryError):  # noqa: RUF029
        logger.error(f"Failed to get agent history: {exc}", exc_info=exc.original_error)
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": str(exc)})

    @app.exception_handler(AgentProcessingError)
    async def agent_processing_error_handler(request: Request, exc: AgentProcessingError):  # noqa: RUF029
        logger.error(f"Agent processing error: {exc}", exc_info=exc.original_error)
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": str(exc)})

    @app.exception_handler(InvalidAgentResponseError)
    async def invalid_agent_response_handler(request: Request, exc: InvalidAgentResponseError):  # noqa: RUF029
        logger.error(f"Invalid agent response: {exc}")
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": str(exc)})

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):  # noqa: RUF029
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": "Internal server error"}
        )
