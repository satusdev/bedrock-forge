"""
Incident database model for tracking downtime periods.
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Integer, ForeignKey, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .monitor import Monitor


class IncidentStatus(str, PyEnum):
    """Incident status states."""
    ONGOING = "ongoing"
    RESOLVED = "resolved"
    INVESTIGATING = "investigating"


class Incident(Base, TimestampMixin):
    """Incident model for tracking downtime periods (Uptime Kuma style)."""
    
    __tablename__ = "incidents"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Monitor reference
    monitor_id: Mapped[int] = mapped_column(
        ForeignKey("monitors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    
    # Incident details
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus, values_callable=lambda obj: [e.value for e in obj]), default=IncidentStatus.ONGOING
    )
    
    # Timing
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    # Details
    root_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Notification tracking
    notification_sent: Mapped[bool] = mapped_column(default=False)
    recovery_notification_sent: Mapped[bool] = mapped_column(default=False)
    
    # Relationship
    monitor: Mapped["Monitor"] = relationship("Monitor", back_populates="incidents")
    
    def resolve(self) -> None:
        """Mark incident as resolved and calculate duration."""
        self.resolved_at = datetime.utcnow()
        self.status = IncidentStatus.RESOLVED
        if self.started_at and self.resolved_at:
            delta = self.resolved_at - self.started_at
            self.duration_seconds = int(delta.total_seconds())
    
    def __repr__(self) -> str:
        return f"<Incident(id={self.id}, monitor={self.monitor_id}, status={self.status})>"
