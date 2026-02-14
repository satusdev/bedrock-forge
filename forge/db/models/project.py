"""
Project database model.
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Integer, Boolean, ForeignKey, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, List

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User
    from .server import Server
    from .backup import Backup
    from .backup_schedule import BackupSchedule
    from .monitor import Monitor
    from .project_server import ProjectServer
    from .client import Client
    from .subscription import Subscription
    from .domain import Domain
    from .ssl_certificate import SSLCertificate
    from .tag import Tag


class ProjectStatus(str, PyEnum):
    """Project status states."""
    ACTIVE = "active"
    PAUSED = "paused"
    ARCHIVED = "archived"


class EnvironmentType(str, PyEnum):
    """Deployment environment types."""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


def _enum_values(enum_cls: type[PyEnum]) -> list[str]:
    return [member.value for member in enum_cls]


class Project(Base, TimestampMixin):
    """WordPress project model."""
    
    __tablename__ = "projects"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    path: Mapped[str] = mapped_column(String(500), nullable=False)
    
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(
            ProjectStatus,
            values_callable=_enum_values,
            name="projectstatus",
        ),
        default=ProjectStatus.ACTIVE,
    )
    environment: Mapped[EnvironmentType] = mapped_column(
        Enum(
            EnvironmentType,
            values_callable=_enum_values,
            name="environmenttype",
        ),
        default=EnvironmentType.DEVELOPMENT,
    )
    
    # WordPress info
    wp_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    php_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    wp_home: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Deployment tracking
    last_deployed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    
    # GitHub integration
    github_repo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    github_branch: Mapped[str | None] = mapped_column(String(100), nullable=True)
    
    # Google Drive integration
    gdrive_folder_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gdrive_assets_folder_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gdrive_docs_folder_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gdrive_backups_folder_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    gdrive_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    gdrive_last_sync: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    
    # Local development (DDEV)
    local_path: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )  # e.g., ~/Work/Wordpress/{project_name}
    ddev_configured: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Tags for filtering and organization (JSON array stored as text)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Foreign keys
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    server_id: Mapped[int | None] = mapped_column(
        ForeignKey("servers.id"), nullable=True
    )
    client_id: Mapped[int | None] = mapped_column(
        ForeignKey("clients.id"), nullable=True
    )
    
    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="projects")
    server: Mapped["Server | None"] = relationship(
        "Server", back_populates="projects"
    )
    backups: Mapped[list["Backup"]] = relationship(
        "Backup", back_populates="project", cascade="all, delete-orphan"
    )
    backup_schedules: Mapped[list["BackupSchedule"]] = relationship(
        "BackupSchedule", back_populates="project", cascade="all, delete-orphan"
    )
    monitors: Mapped[list["Monitor"]] = relationship(
        "Monitor", back_populates="project"
    )
    project_servers: Mapped[list["ProjectServer"]] = relationship(
        "ProjectServer", back_populates="project", cascade="all, delete-orphan"
    )
    client: Mapped["Client | None"] = relationship(
        "Client", back_populates="projects"
    )
    subscriptions: Mapped[list["Subscription"]] = relationship(
        "Subscription", back_populates="project"
    )
    domains: Mapped[list["Domain"]] = relationship(
        "Domain", back_populates="project"
    )
    ssl_certificates: Mapped[list["SSLCertificate"]] = relationship(
        "SSLCertificate", back_populates="project"
    )
    
    # Tag relationships (many-to-many)
    tag_objects: Mapped[List["Tag"]] = relationship(
        "Tag", secondary="project_tags", back_populates="projects"
    )
    
    def __repr__(self) -> str:
        return f"<Project(id={self.id}, name='{self.name}')>"
