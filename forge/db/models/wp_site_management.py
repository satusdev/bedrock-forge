"""
WordPress site state and update management models.

Tracks WordPress versions, plugins, themes, and update history.
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Integer, ForeignKey, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .project_server import ProjectServer
    from .backup import Backup


class UpdateType(str, PyEnum):
    """Type of WordPress update."""
    CORE = "core"
    PLUGIN = "plugin"
    THEME = "theme"


class UpdateStatus(str, PyEnum):
    """Status of an update operation."""
    PENDING = "pending"
    APPLIED = "applied"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"
    SKIPPED = "skipped"


def _enum_values(enum_cls: type[PyEnum]) -> list[str]:
    return [member.value for member in enum_cls]


class WPSiteState(Base, TimestampMixin):
    """
    Cached WordPress site state per project-server.
    
    Stores versions, plugins/themes, and available updates.
    Refreshed by periodic scan task.
    """
    
    __tablename__ = "wp_site_states"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Project-Server link
    project_server_id: Mapped[int] = mapped_column(
        ForeignKey("project_servers.id", ondelete="CASCADE"), 
        nullable=False, 
        unique=True
    )
    
    # WordPress versions
    wp_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    wp_version_available: Mapped[str | None] = mapped_column(String(20), nullable=True)
    php_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    
    # Plugins/themes (JSON stored as text)
    # Format: [{"name": "acf", "version": "6.0", "update": "6.1", "active": true}]
    plugins: Mapped[str | None] = mapped_column(Text, nullable=True)
    themes: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Counts
    plugins_count: Mapped[int] = mapped_column(Integer, default=0)
    plugins_update_count: Mapped[int] = mapped_column(Integer, default=0)
    themes_count: Mapped[int] = mapped_column(Integer, default=0)
    themes_update_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Users
    users_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Site health
    site_health_score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0-100
    
    # Last scan
    last_scanned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scan_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Relationships
    project_server: Mapped["ProjectServer"] = relationship(
        "ProjectServer", back_populates="wp_site_state"
    )
    
    def __repr__(self) -> str:
        return f"<WPSiteState(id={self.id}, wp={self.wp_version}, plugins={self.plugins_count})>"


class WPUpdate(Base, TimestampMixin):
    """
    WordPress update history with rollback support.
    
    Tracks each update applied and allows rollback via backup reference.
    """
    
    __tablename__ = "wp_updates"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Project-Server link
    project_server_id: Mapped[int] = mapped_column(
        ForeignKey("project_servers.id", ondelete="CASCADE"), nullable=False
    )
    
    # Update details
    update_type: Mapped[UpdateType] = mapped_column(
        Enum(
            UpdateType,
            values_callable=_enum_values,
            name="updatetype",
        ),
        nullable=False,
    )
    package_name: Mapped[str] = mapped_column(String(255), nullable=False)
    from_version: Mapped[str] = mapped_column(String(50), nullable=False)
    to_version: Mapped[str] = mapped_column(String(50), nullable=False)
    
    # Status
    status: Mapped[UpdateStatus] = mapped_column(
        Enum(
            UpdateStatus,
            values_callable=_enum_values,
            name="updatestatus",
        ),
        default=UpdateStatus.PENDING,
    )
    
    # Backup for rollback
    backup_id: Mapped[int | None] = mapped_column(
        ForeignKey("backups.id"), nullable=True
    )
    
    # Timing
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    
    # Notes
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Relationships
    project_server: Mapped["ProjectServer"] = relationship("ProjectServer")
    backup: Mapped["Backup | None"] = relationship("Backup")
    
    def __repr__(self) -> str:
        return f"<WPUpdate(id={self.id}, {self.update_type}:{self.package_name} {self.from_version}->{self.to_version})>"
