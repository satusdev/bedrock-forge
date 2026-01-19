"""
Starter repository model for Bedrock project templates.

Allows users to configure starter repos for new project creation.
"""
from sqlalchemy import String, Text, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User


class StarterRepo(Base, TimestampMixin):
    """
    Starter repository for new project creation.
    
    Stores Git repository URLs that can be cloned as new projects.
    Typically Bedrock-based WordPress starter templates.
    """
    
    __tablename__ = "starter_repos"
    
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Git configuration
    git_url: Mapped[str] = mapped_column(String(500), nullable=False)
    branch: Mapped[str] = mapped_column(String(100), default="main")
    
    # Repository type
    is_bedrock: Mapped[bool] = mapped_column(Boolean, default=True)
    has_sage: Mapped[bool] = mapped_column(Boolean, default=False)  # Includes Sage theme
    
    # Default repo flag
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Ordering for display
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    
    # Configuration template (JSON)
    # Stores default .env values, composer.json overrides, etc.
    config_template: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Foreign keys
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    
    # Relationships
    created_by: Mapped["User"] = relationship("User")
    
    def __repr__(self) -> str:
        return f"<StarterRepo(id={self.id}, name='{self.name}')>"
