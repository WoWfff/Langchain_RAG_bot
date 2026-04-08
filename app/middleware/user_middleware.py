import logging
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.services.database import Database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class UserMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        protected_paths = ["/chat", "/threads"]

        if not any(request.url.path.startswith(path) for path in protected_paths):
            return await call_next(request)

        db: Database = request.app.state.database
        cookies_id = request.cookies.get("user_session_id")

        if not cookies_id:
            cookies_id = str(uuid4())

        user = await db.get_user_by_cookies_id(cookies_id=cookies_id)
        if not user:
            user = await db.add_user(cookies_id=cookies_id)  # type: ignore
            logger.info(f"Created new user: {user.id}")

        # Set user info in request state
        request.state.user_id = user.id
        request.state.thread_id = user.active_thread_id  # Can be None
        request.state.cookies_id = cookies_id  # type: ignore

        if user.active_thread_id:
            logger.info(f"Using active thread: {user.active_thread_id}")
        else:
            logger.info(f"No active thread for user: {user.id}")

        response = await call_next(request)
        response.set_cookie(
            key="user_session_id",
            value=cookies_id,
            httponly=True,
            samesite="lax",
            max_age=30 * 24 * 60 * 60,  # 30 days
        )
        return response
