import logging
from uuid import uuid4

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.services.database import Database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class UserMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/chat"):
            return await call_next(request)

        db: Database = request.app.state.database
        cookies_id = request.cookies.get("user_session_id")

        if not cookies_id:
            cookies_id = str(uuid4())

        user = await db.get_user_by_cookies_id(cookies_id=cookies_id)
        if not user:
            user = await db.add_user(cookies_id=cookies_id)  # type: ignore
            logger.info(f"Created new user: {user.id}")

        thread_id = str(uuid4())
        await db.add_thread(user_id=user.id, thread_id=thread_id)
        logger.info(f"Created thread: {thread_id} for user: {user.id}")

        request.state.user_id = user.id
        request.state.thread_id = thread_id
        request.state.cookies_id = cookies_id  # type: ignore

        response = await call_next(request)
        response.set_cookie(
            key="user_session_id",
            value=cookies_id,
            httponly=True,
            samesite="lax",
            max_age=30 * 24 * 60 * 60  # 30 days
        )
        return response
