import logging

from dotenv import load_dotenv
from fastapi import HTTPException
from sqlalchemy import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import DATABASE_URL
from app.models.database import Base, User

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

    async def add_user(self, cookies_id: str, thread_id: str) -> bool:
        try:
            async with self.async_session() as session:
                stmt = insert(User).values(
                    cookies_id=cookies_id,
                    thread_id=thread_id,
                )
                await session.execute(stmt)
                await session.commit()
                return True
        except IntegrityError as err:
            raise HTTPException(
                status_code=409, detail="User with this thread_id or cookies_id already exists"
            ) from err
