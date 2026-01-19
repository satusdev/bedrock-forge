"""
Project-Server junction model for environment linking.

Allows projects to be linked to multiple servers with staging/production context.
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..base import Base, TimestampMixin
from ..custom_types import EncryptedString

if TYPE_CHECKING:
    from .user import User
    from .project import Project
    from .server import Server


class ServerEnvironment(str, PyEnum):
    """Server environment type for project context."""
    STAGING = "staging"
    PRODUCTION = "production"
    DEVELOPMENT = "development"


class ProjectServer(Base, TimestampMixin):
    """
    Junction table linking projects to servers with environment context.
    
    This allows a project to have:
    - One or more staging servers
    - One or more production servers
    - Different WordPress paths per environment
    """
    
    __tablename__ = "project_servers"
    __table_args__ = (
        UniqueConstraint('project_id', 'server_id', 'environment', name='uq_project_server_env'),
    )
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Foreign keys
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    server_id: Mapped[int] = mapped_column(
        ForeignKey("servers.id", ondelete="CASCADE"), nullable=False
    )
    
    # Environment context
    environment: Mapped[ServerEnvironment] = mapped_column(
        Enum(ServerEnvironment), default=ServerEnvironment.STAGING
    )
    
    # WordPress paths on this server
    wp_path: Mapped[str] = mapped_column(
        String(500), nullable=False
    )  # e.g., /home/user/public_html/mysite
    
    wp_url: Mapped[str] = mapped_column(
        String(500), nullable=False
    )  # e.g., https://staging.example.com
    
    # Optional notes
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    
    # Per-site SSH credentials (override server defaults for CyberPanel sites)
    ssh_user: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ssh_key_path: Mapped[str | None] = mapped_column(EncryptedString, nullable=True)
    
    # Is this the primary server for this environment?
    is_primary: Mapped[bool] = mapped_column(default=True)
    
    # Relationships
    project: Mapped["Project"] = relationship(
        "Project", back_populates="project_servers"
    )
    server: Mapped["Server"] = relationship(
        "Server", back_populates="project_servers"
    )
    wp_credentials: Mapped[list["WPCredential"]] = relationship(
        "WPCredential", back_populates="project_server", cascade="all, delete-orphan"
    )
    wp_site_state: Mapped["WPSiteState | None"] = relationship(
        "WPSiteState", back_populates="project_server", uselist=False, cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<ProjectServer(project_id={self.project_id}, server_id={self.server_id}, env={self.environment})>"


# Import at end to avoid circular imports
if TYPE_CHECKING:
    from .wp_credential import WPCredential
    from .wp_site_management import WPSiteState

