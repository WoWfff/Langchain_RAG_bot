from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class User(Base):
    __tablename__ = "users"

    cookies_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    active_thread_id: Mapped[str | None] = mapped_column(String, nullable=True)

    threads: Mapped[list["Thread"]] = relationship("Thread", back_populates="user")


class Thread(Base):
    __tablename__ = "threads"

    name: Mapped[str] = mapped_column(String(255), nullable=True)
    thread_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="threads")
