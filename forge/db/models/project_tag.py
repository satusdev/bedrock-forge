"""
Project-Tag junction table for many-to-many relationship.

Links projects and servers to tags for organization.
"""
from sqlalchemy import Table, Column, Integer, ForeignKey

from ..base import Base


# Junction table for Project-Tag many-to-many
project_tags = Table(
    "project_tags",
    Base.metadata,
    Column("project_id", Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

# Junction table for Server-Tag many-to-many
server_tags = Table(
    "server_tags",
    Base.metadata,
    Column("server_id", Integer, ForeignKey("servers.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)
