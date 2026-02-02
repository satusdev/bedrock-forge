"""
Backup schedule database model.

Defines scheduled backup configurations that integrate with Celery Beat
for automated backup execution.
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, Enum, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, Any

from ..base import Base, TimestampMixin
from .backup import BackupStorageType
from forge.core.backup_types import BackupType

if TYPE_CHECKING:
    from .user import User
    from .project import Project
    from .project_server import ProjectServer



class ScheduleFrequency(str, PyEnum):
    """Backup schedule frequency options."""
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    CUSTOM = "custom"  # Uses cron_expression


class ScheduleStatus(str, PyEnum):
    """Backup schedule status."""
    ACTIVE = "active"
    PAUSED = "paused"
    DISABLED = "disabled"


class BackupSchedule(Base, TimestampMixin):
    """
    Backup schedule configuration model.
    
    Stores automated backup schedules that are synced with Celery Beat
    for periodic execution. Supports various frequencies and retention policies.
    """
    
    __tablename__ = "backup_schedules"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Schedule configuration
    frequency: Mapped[ScheduleFrequency] = mapped_column(
        Enum(ScheduleFrequency), default=ScheduleFrequency.DAILY
    )
    cron_expression: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # For CUSTOM frequency: "0 2 * * *" (2 AM daily)
    
    # Time configuration for non-cron schedules
    hour: Mapped[int] = mapped_column(Integer, default=2)  # Default 2 AM
    minute: Mapped[int] = mapped_column(Integer, default=0)
    day_of_week: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 0=Monday, 6=Sunday (for WEEKLY)
    day_of_month: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # 1-31 (for MONTHLY)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
    
    # Backup configuration
    backup_type: Mapped[BackupType] = mapped_column(
        Enum(BackupType), default=BackupType.FULL
    )
    storage_type: Mapped[BackupStorageType] = mapped_column(
        Enum(BackupStorageType), default=BackupStorageType.GOOGLE_DRIVE
    )
    
    # Retention policy
    retention_count: Mapped[int] = mapped_column(
        Integer, default=7
    )  # Number of backups to keep
    retention_days: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )  # Alternative: delete backups older than X days
    
    # Status and tracking
    status: Mapped[ScheduleStatus] = mapped_column(
        Enum(ScheduleStatus), default=ScheduleStatus.ACTIVE
    )
    last_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_run_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_run_success: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    last_run_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Celery Beat integration
    celery_task_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True
    )  # Reference to celery beat periodic task
    
    # Additional configuration (JSON for flexibility)
    config: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True
    )  # Extra options: compression, encryption, exclude patterns, etc.
    
    # Foreign keys
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    environment_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_servers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )

    
    # Relationships
    project: Mapped["Project"] = relationship(
        "Project", back_populates="backup_schedules"
    )
    environment: Mapped["ProjectServer"] = relationship("ProjectServer")
    created_by: Mapped["User"] = relationship(
        "User", back_populates="backup_schedules"
    )

    
    def __repr__(self) -> str:
        return f"<BackupSchedule(id={self.id}, name='{self.name}', frequency={self.frequency}, status={self.status})>"
    
    def get_cron_schedule(self) -> str:
        """
        Generate cron expression based on frequency settings.
        
        Returns:
            Cron expression string (minute hour day_of_month month day_of_week)
        """
        if self.frequency == ScheduleFrequency.CUSTOM and self.cron_expression:
            return self.cron_expression
        
        minute = self.minute
        hour = self.hour
        
        if self.frequency == ScheduleFrequency.HOURLY:
            return f"{minute} * * * *"
        elif self.frequency == ScheduleFrequency.DAILY:
            return f"{minute} {hour} * * *"
        elif self.frequency == ScheduleFrequency.WEEKLY:
            dow = self.day_of_week if self.day_of_week is not None else 0
            return f"{minute} {hour} * * {dow}"
        elif self.frequency == ScheduleFrequency.MONTHLY:
            dom = self.day_of_month if self.day_of_month is not None else 1
            return f"{minute} {hour} {dom} * *"
        else:
            # Default to daily at configured time
            return f"{minute} {hour} * * *"
    
    @property
    def is_active(self) -> bool:
        """Check if the schedule is currently active."""
        return self.status == ScheduleStatus.ACTIVE
