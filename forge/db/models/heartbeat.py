"""
Heartbeat database model for monitor check history.
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Integer, ForeignKey, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..base import Base

if TYPE_CHECKING:
    from .monitor import Monitor


class HeartbeatStatus(str, PyEnum):
    """Status of a heartbeat check."""
    UP = "up"
    DOWN = "down"
    DEGRADED = "degraded"
    PENDING = "pending"


class Heartbeat(Base):
    """Heartbeat record for monitor check history (Uptime Kuma style)."""
    
    __tablename__ = "heartbeats"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Monitor reference
    monitor_id: Mapped[int] = mapped_column(
        ForeignKey("monitors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    
    # Check result
    status: Mapped[HeartbeatStatus] = mapped_column(
        Enum(HeartbeatStatus, values_callable=lambda obj: [e.value for e in obj]), default=HeartbeatStatus.PENDING
    )
    response_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    # Details
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Timestamp
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, index=True
    )
    
    # Relationship
    monitor: Mapped["Monitor"] = relationship("Monitor", back_populates="heartbeats")
    
    def __repr__(self) -> str:
        return f"<Heartbeat(id={self.id}, monitor={self.monitor_id}, status={self.status})>"
