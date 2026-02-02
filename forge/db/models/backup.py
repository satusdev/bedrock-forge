"""
Backup database model.
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Integer, BigInteger, ForeignKey, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User
    from .project import Project


class BackupType(str, PyEnum):
    """Backup type."""
    FULL = "full"
    DATABASE = "database"
    FILES = "files"


class BackupStorageType(str, PyEnum):
    """Backup storage location."""
    LOCAL = "local"
    GOOGLE_DRIVE = "google_drive"
    S3 = "s3"


class BackupStatus(str, PyEnum):
    """Backup operation status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Backup(Base, TimestampMixin):
    """Backup record model."""
    
    __tablename__ = "backups"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    backup_type: Mapped[BackupType] = mapped_column(
        Enum(BackupType), default=BackupType.FULL
    )
    storage_type: Mapped[BackupStorageType] = mapped_column(
        Enum(BackupStorageType), default=BackupStorageType.LOCAL
    )
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    
    status: Mapped[BackupStatus] = mapped_column(
        Enum(BackupStatus), default=BackupStatus.PENDING
    )
    
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage_file_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    drive_folder_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logs: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Foreign keys
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id"), nullable=False
    )
    created_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="backups")
    created_by: Mapped["User"] = relationship("User", back_populates="backups")
    
    # Optional link to specific environment (project_server)
    project_server_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_servers.id"), nullable=True
    )
    # Note: Circular import prevention might be needed if ProjectServer imports Backup
    # but typically for relationship definitions using string class names is fine.
    project_server = relationship("ProjectServer", foreign_keys=[project_server_id])
    
    def __repr__(self) -> str:
        return f"<Backup(id={self.id}, name='{self.name}', status={self.status})>"
