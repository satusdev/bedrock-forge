"""Add db credentials to project_servers

Revision ID: q2r3s4t5u6v7
Revises: p7q8r9s0t1u2
Create Date: 2026-02-01 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "q2r3s4t5u6v7"
down_revision: Union[str, Sequence[str], None] = "p7q8r9s0t1u2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("project_servers", sa.Column("database_name", sa.String(length=255), nullable=True))
    op.add_column("project_servers", sa.Column("database_user", sa.String(length=255), nullable=True))
    op.add_column("project_servers", sa.Column("database_password", sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("project_servers", "database_password")
    op.drop_column("project_servers", "database_user")
    op.drop_column("project_servers", "database_name")
