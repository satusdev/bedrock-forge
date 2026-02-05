"""Add plugin policy tables

Revision ID: t1u2v3w4x5y6
Revises: s1t2u3v4w5x6
Create Date: 2026-02-04 12:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "t1u2v3w4x5y6"
down_revision: Union[str, Sequence[str], None] = "s1t2u3v4w5x6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "plugin_policies",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("owner_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=True),
        sa.Column("allowed_plugins", sa.Text(), nullable=True),
        sa.Column("required_plugins", sa.Text(), nullable=True),
        sa.Column("blocked_plugins", sa.Text(), nullable=True),
        sa.Column("pinned_versions", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_index("ix_plugin_policies_owner_id", "plugin_policies", ["owner_id"])

    op.create_table(
        "project_plugin_policies",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("inherit_default", sa.Boolean(), nullable=True),
        sa.Column("allowed_plugins", sa.Text(), nullable=True),
        sa.Column("required_plugins", sa.Text(), nullable=True),
        sa.Column("blocked_plugins", sa.Text(), nullable=True),
        sa.Column("pinned_versions", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", name="uq_project_plugin_policy_project")
    )
    op.create_index("ix_project_plugin_policies_project_id", "project_plugin_policies", ["project_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_project_plugin_policies_project_id", table_name="project_plugin_policies", if_exists=True)
    op.drop_table("project_plugin_policies")
    op.drop_index("ix_plugin_policies_owner_id", table_name="plugin_policies", if_exists=True)
    op.drop_table("plugin_policies")
