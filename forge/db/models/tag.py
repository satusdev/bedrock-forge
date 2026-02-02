"""
Tag model for project organization.

Provides color-coded tags with usage tracking.
"""
from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, List

from ..base import Base, TimestampMixin
from .project_tag import project_tags, server_tags, client_tags

if TYPE_CHECKING:
    from .project import Project
    from .server import Server
    from .client import Client


class Tag(Base, TimestampMixin):
    """Tag model for organizing projects and other resources."""
    
    __tablename__ = "tags"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    
    # Tag identification
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    
    # Display
    color: Mapped[str] = mapped_column(String(7), default="#6366f1")  # Hex color
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Lucide icon name
    
    # Description
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Usage stats (updated via trigger or sync task)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Relationships
    projects: Mapped[List["Project"]] = relationship(
        "Project", secondary=project_tags, back_populates="tag_objects"
    )
    servers: Mapped[List["Server"]] = relationship(
        "Server", secondary=server_tags, back_populates="tag_objects"
    )
    clients: Mapped[List["Client"]] = relationship(
        "Client", secondary=client_tags, back_populates="tag_objects"
    )
    
    def __repr__(self) -> str:
        return f"<Tag(name='{self.name}')>"


# Default tags to seed
DEFAULT_TAGS = [
    {"name": "WordPress", "slug": "wordpress", "color": "#21759b", "icon": "Globe", "description": "WordPress-based projects"},
    {"name": "E-commerce", "slug": "ecommerce", "color": "#7c3aed", "icon": "ShoppingCart", "description": "Online store projects"},
    {"name": "Client Site", "slug": "client-site", "color": "#059669", "icon": "Users", "description": "External client projects"},
    {"name": "Internal", "slug": "internal", "color": "#6366f1", "icon": "Building", "description": "Internal company projects"},
    {"name": "Customers", "slug": "customers", "color": "#0ea5e9", "icon": "Briefcase", "description": "Customer-facing projects"},
    {"name": "Staging", "slug": "staging", "color": "#f59e0b", "icon": "FlaskConical", "description": "Testing and staging environments"},
    {"name": "Development", "slug": "development", "color": "#8b5cf6", "icon": "Code", "description": "Active development projects"},
    {"name": "Production", "slug": "production", "color": "#10b981", "icon": "Rocket", "description": "Live production sites"},
    {"name": "In Progress", "slug": "in-progress", "color": "#f97316", "icon": "Clock", "description": "Projects currently being worked on"},
    {"name": "Archive", "slug": "archive", "color": "#6b7280", "icon": "Archive", "description": "Archived or inactive projects"},
    {"name": "High Priority", "slug": "high-priority", "color": "#ef4444", "icon": "AlertTriangle", "description": "Urgent priority projects"},
    {"name": "Maintenance", "slug": "maintenance", "color": "#14b8a6", "icon": "Zap", "description": "Projects under maintenance"},
]
