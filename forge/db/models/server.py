"""
Server database model.
"""
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Text, Integer, ForeignKey, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, List

from ..base import Base, TimestampMixin
from ..custom_types import EncryptedString

if TYPE_CHECKING:
    from .user import User
    from .project import Project
    from .project_server import ProjectServer
    from .cyberpanel_user import CyberPanelUser
    from .tag import Tag


class ServerProvider(str, PyEnum):
    """Server provider types."""
    HETZNER = "hetzner"
    CYBERPANEL = "cyberpanel"
    CPANEL = "cpanel"
    DIGITALOCEAN = "digitalocean"
    VULTR = "vultr"
    LINODE = "linode"
    CUSTOM = "custom"


class ServerStatus(str, PyEnum):
    """Server status states."""
    ONLINE = "online"
    OFFLINE = "offline"
    PROVISIONING = "provisioning"
    MAINTENANCE = "maintenance"


class PanelType(str, PyEnum):
    """Control panel types."""
    CYBERPANEL = "cyberpanel"
    CPANEL = "cpanel"
    PLESK = "plesk"
    DIRECTADMIN = "directadmin"
    NONE = "none"


class Server(Base, TimestampMixin):
    """Server/host model for deployments."""
    
    __tablename__ = "servers"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hostname: Mapped[str] = mapped_column(String(255), nullable=False)
    
    provider: Mapped[ServerProvider] = mapped_column(
        Enum(ServerProvider, values_callable=lambda obj: [e.value for e in obj]),
        default=ServerProvider.CUSTOM,
    )
    status: Mapped[ServerStatus] = mapped_column(
        Enum(ServerStatus, values_callable=lambda obj: [e.value for e in obj]),
        default=ServerStatus.OFFLINE,
    )
    
    # SSH connection
    ssh_user: Mapped[str] = mapped_column(String(100), default="root")
    ssh_port: Mapped[int] = mapped_column(Integer, default=22)
    ssh_key_path: Mapped[str | None] = mapped_column(EncryptedString, nullable=True)
    ssh_password: Mapped[str | None] = mapped_column(EncryptedString, nullable=True)
    ssh_private_key: Mapped[str | None] = mapped_column(EncryptedString, nullable=True) # Pasted content
    
    # Control panel (Legacy / Informational)
    panel_type: Mapped[PanelType] = mapped_column(
        Enum(PanelType, values_callable=lambda obj: [e.value for e in obj]),
        default=PanelType.NONE,
    )
    panel_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    panel_port: Mapped[int] = mapped_column(Integer, default=8090)
    panel_verified: Mapped[bool] = mapped_column(default=False)
    
    # Panel credentials for auto-login (encrypted)
    panel_username: Mapped[str | None] = mapped_column(EncryptedString, nullable=True)
    panel_password: Mapped[str | None] = mapped_column(EncryptedString, nullable=True)
    
    # Health tracking
    last_health_check: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    
    # Directory management (JSON arrays stored as text)
    wp_root_paths: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # JSON: discovered WordPress installation paths
    uploads_path: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )  # Default uploads path on this server
    
    # Tags for filtering and organization (JSON array stored as text)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Foreign keys
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="servers")
    projects: Mapped[list["Project"]] = relationship(
        "Project", back_populates="server"
    )
    project_servers: Mapped[list["ProjectServer"]] = relationship(
        "ProjectServer", back_populates="server", cascade="all, delete-orphan"
    )
    cyberpanel_users: Mapped[list["CyberPanelUser"]] = relationship(
        "CyberPanelUser", back_populates="server", cascade="all, delete-orphan"
    )
    
    # Tag relationships (many-to-many)
    tag_objects: Mapped[List["Tag"]] = relationship(
        "Tag", secondary="server_tags", back_populates="servers"
    )
    
    def __repr__(self) -> str:
        return f"<Server(id={self.id}, name='{self.name}')>"
