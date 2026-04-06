import logging

from dotenv import load_dotenv
from fastapi import HTTPException
from sqlalchemy import insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import DATABASE_URL
from app.models.database import Base, Thread, User

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
        except Exception as e:
            logger.error(f"Unable to connect to the database: {e}")
            raise RuntimeError("DB connection failed") from e

    async def close(self):
        await self.engine.dispose()
        logger.info("A database connection has been closed.")

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
            raise HTTPException(status_code=409, detail="User with this cookies_id already exists") from err

    async def get_user_by_cookies_id(self, cookies_id: str) -> User | None:
        async with self.async_session() as session:
            stmt = select(User).where(User.cookies_id == cookies_id)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def add_thread(self, user_id: int, thread_id: str) -> Thread:
        try:
            async with self.async_session() as session:
                stmt = insert(Thread).values(thread_id=thread_id, user_id=user_id).returning(Thread)
                result = await session.execute(stmt)
                thread = result.scalar_one()
                await session.commit()
                return thread

        except IntegrityError as err:
            raise HTTPException(status_code=409, detail="Thread with this thread_id already exists") from err

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
