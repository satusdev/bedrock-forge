"""Add notes to backups

Revision ID: 180d810f8579
Revises: dc19e1dc957d
Create Date: 2026-01-25 10:42:57.037940

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "180d810f8579"
down_revision: Union[str, Sequence[str], None] = "dc19e1dc957d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Only add the notes column to backups
    op.add_column("backups", sa.Column("notes", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove the notes column from backups
    op.drop_column("backups", "notes")
