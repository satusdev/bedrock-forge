"""
Plugin policy models for allowlist/denylist and version pinning.
"""
from sqlalchemy import String, Text, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING

from ..base import Base, TimestampMixin

if TYPE_CHECKING:
    from .user import User
    from .project import Project


class PluginPolicy(Base, TimestampMixin):
    """Global plugin policy for an owner (default allowlist/denylist/pins)."""

    __tablename__ = "plugin_policies"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False, default="Default Policy")
    is_default: Mapped[bool] = mapped_column(Boolean, default=True)

    allowed_plugins: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    required_plugins: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    blocked_plugins: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    pinned_versions: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON dict

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    owner: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<PluginPolicy(id={self.id}, owner_id={self.owner_id}, default={self.is_default})>"


class ProjectPluginPolicy(Base, TimestampMixin):
    """Per-project overrides for plugin policy."""

    __tablename__ = "project_plugin_policies"
    __table_args__ = (
        UniqueConstraint("project_id", name="uq_project_plugin_policy_project"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)

    inherit_default: Mapped[bool] = mapped_column(Boolean, default=True)

    allowed_plugins: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    required_plugins: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    blocked_plugins: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list
    pinned_versions: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON dict

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship("Project")

    def __repr__(self) -> str:
        return f"<ProjectPluginPolicy(id={self.id}, project_id={self.project_id})>"
