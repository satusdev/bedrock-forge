"""Add project_server_id to monitors

Revision ID: s1t2u3v4w5x6
Revises: b1c2d3e4f5g6
Create Date: 2026-02-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "s1t2u3v4w5x6"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5g6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "monitors",
        sa.Column("project_server_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "fk_monitors_project_server_id",
        "monitors",
        "project_servers",
        ["project_server_id"],
        ["id"],
        ondelete="SET NULL"
    )
    op.create_index(
        "ix_monitors_project_server_id",
        "monitors",
        ["project_server_id"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_monitors_project_server_id", table_name="monitors", if_exists=True)
    op.drop_constraint("fk_monitors_project_server_id", "monitors", type_="foreignkey")
    op.drop_column("monitors", "project_server_id")
