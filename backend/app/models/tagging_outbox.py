"""Durable publication intent for one generation of AI image tagging."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TaggingOutbox(Base):
    __tablename__ = "tagging_outbox"
    __table_args__ = (
        Index("ix_tagging_outbox_pending", "completed_at", "published_at", "available_at"),
    )

    job_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    item_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("clothing_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    image_reference: Mapped[str] = mapped_column(String(1024), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(128))
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
