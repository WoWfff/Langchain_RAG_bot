import logging
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy import delete, insert, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import DATABASE_URL
from app.models.database import Base, Thread, User
from app.models.exceptions import (
    ThreadAlreadyExistsError,
    ThreadNotFoundError,
    ThreadNotFoundOrDoestBelongError,
    UserWithCookiesExists,
)

# Configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
load_dotenv()


class Database:
    def __init__(self):
        self.engine = create_async_engine(DATABASE_URL, echo=False)
        self.async_session = async_sessionmaker(self.engine, expire_on_commit=False)

    async def connect(self) -> None:
        try:
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("A database connection has been established.")
        except Exception as err:
            logger.error(f"Unable to connect to the database: {err}")
            raise RuntimeError("DB connection failed") from err

    async def close(self):
        await self.engine.dispose()
        logger.info("A database connection has been closed.")

    # ========================================================
    #                           USER
    # ========================================================

    async def add_user(self, cookies_id: str) -> User:
        try:
            async with self.async_session() as session:
                stmt = (
                    insert(User)
                    .values(
                        cookies_id=cookies_id,
                    )
                    .returning(User)
                )
                result = await session.execute(stmt)
                user = result.scalar_one()
                await session.commit()

                return user

        except IntegrityError as err:
            raise UserWithCookiesExists(user_id=user.id, cookies_id=cookies_id) from err

    async def get_user_by_cookies_id(self, cookies_id: str) -> User | None:
        async with self.async_session() as session:
            stmt = select(User).where(User.cookies_id == cookies_id)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def get_user_by_id(self, user_id: int) -> User | None:
        async with self.async_session() as session:
            stmt = select(User).where(User.id == user_id)

            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    # ========================================================
    #                        Thread_id
    # ========================================================

    async def add_thread(self, user_id: int, thread_id: str) -> Thread:
        try:
            async with self.async_session() as session:
                stmt = insert(Thread).values(thread_id=thread_id, user_id=user_id).returning(Thread)
                result = await session.execute(stmt)
                thread = result.scalar_one()
                await session.commit()
                return thread
        except IntegrityError as err:
            raise ThreadAlreadyExistsError(thread_id=thread_id) from err

    async def get_thread_by_id(self, thread_id: str) -> Thread | None:
        async with self.async_session() as session:
            stmt = select(Thread).where(Thread.thread_id == thread_id)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def get_user_threads(self, user_id: int) -> list[Thread]:
        async with self.async_session() as session:
            stmt = select(Thread).where(Thread.user_id == user_id)
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def set_thread_name(self, user_id: int, thread_id: str, name: str) -> None:
        """
        Set thread name.

        Args:
            user_id: User ID
            thread_id: Thread ID
            name: New thread name

        Raises:
            ThreadNotFoundOrDoestBelongError: If thread not found or doesn't belong to user
        """
        async with self.async_session() as session:
            # First check if thread exists and belongs to user
            stmt = select(Thread).where(Thread.user_id == user_id, Thread.thread_id == thread_id)
            result = await session.execute(stmt)
            thread = result.scalar_one_or_none()

            if thread is None:
                raise ThreadNotFoundOrDoestBelongError(user_id=user_id, thread_id=thread_id)

            # Update the thread name
            thread.name = name
            await session.commit()

    async def set_active_thread(self, user_id: int, thread_id: str) -> None:
        """
        Set active thread for user.

        Args:
            user_id: User ID
            thread_id: Thread ID to set as active

        Raises:
            ThreadNotFoundOrDoestBelongError: If thread not found or doesn't belong to user
        """
        async with self.async_session() as session:
            # Verify thread exists and belongs to user
            select_stmt = select(Thread).where(Thread.thread_id == thread_id, Thread.user_id == user_id)
            result = await session.execute(select_stmt)
            thread = result.scalar_one_or_none()

            if thread is None:
                raise ThreadNotFoundOrDoestBelongError(user_id=user_id, thread_id=thread_id)

            # Update user's active thread
            update_stmt = update(User).where(User.id == user_id).values(active_thread_id=thread_id)
            await session.execute(update_stmt)
            await session.commit()

    async def create_and_set_active_thread(self, user_id: int) -> Thread:
        thread_id = str(uuid4())
        thread = await self.add_thread(user_id=user_id, thread_id=thread_id)
        await self.set_active_thread(user_id=user_id, thread_id=thread_id)
        return thread

    async def delete_thread(self, thread_id: str) -> None:
        async with self.async_session() as session:
            # 1. Delete blobs
            await session.execute(
                text("DELETE FROM checkpoint_blobs WHERE thread_id = :thread_id"), {"thread_id": thread_id}
            )

            # 2. Delete writes
            await session.execute(
                text("DELETE FROM checkpoint_writes WHERE thread_id = :thread_id"), {"thread_id": thread_id}
            )

            # 3. Delete checkpoints
            await session.execute(
                text("DELETE FROM checkpoints WHERE thread_id = :thread_id"), {"thread_id": thread_id}
            )
            stmt_delete = delete(Thread).where(Thread.thread_id == thread_id)
            await session.execute(stmt_delete)
            await session.commit()

    async def remove_user_thread(self, user_id: int, thread_id: str) -> str | None:
        active_thread: str | None = thread_id
        thread = await self.get_thread_by_id(thread_id=thread_id)

        if not thread or thread.user_id != user_id:
            raise ThreadNotFoundError(thread_id=thread_id)

        async with self.async_session() as session:
            # 1. Delete blobs
            await session.execute(
                text("DELETE FROM checkpoint_blobs WHERE thread_id = :thread_id"), {"thread_id": thread_id}
            )

            # 2. Delete writes
            await session.execute(
                text("DELETE FROM checkpoint_writes WHERE thread_id = :thread_id"), {"thread_id": thread_id}
            )

            # 3. Delete checkpoints
            await session.execute(
                text("DELETE FROM checkpoints WHERE thread_id = :thread_id"), {"thread_id": thread_id}
            )
            stmt_user = select(User).where(User.id == user_id)
            result = await session.execute(stmt_user)
            user = result.scalar_one_or_none()

            if user and user.active_thread_id == thread_id:
                stmt_update = update(User).where(User.id == user_id).values(active_thread_id=None)
                active_thread = None
                await session.execute(stmt_update)

            stmt_delete = delete(Thread).where(Thread.thread_id == thread_id)
            await session.execute(stmt_delete)

            await session.commit()
            return active_thread
