"""Add role to client_users

Revision ID: b1c2d3e4f5g6
Revises: r3s4t5u6v7w8
Create Date: 2026-02-03 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5g6"
down_revision: Union[str, Sequence[str], None] = "r3s4t5u6v7w8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    role_enum = sa.Enum("admin", "member", "viewer", name="clientrole")
    role_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "client_users",
        sa.Column("role", role_enum, nullable=False, server_default="member"),
    )
    op.alter_column("client_users", "role", server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    role_enum = sa.Enum("admin", "member", "viewer", name="clientrole")
    op.drop_column("client_users", "role")
    role_enum.drop(op.get_bind(), checkfirst=True)
