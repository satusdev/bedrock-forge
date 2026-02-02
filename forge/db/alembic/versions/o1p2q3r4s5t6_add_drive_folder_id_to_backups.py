"""Add drive_folder_id to backups

Revision ID: o1p2q3r4s5t6
Revises: n4o5p6q7r8s9
Create Date: 2026-01-31 10:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "o1p2q3r4s5t6"
down_revision: Union[str, Sequence[str], None] = "n4o5p6q7r8s9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("backups", sa.Column("drive_folder_id", sa.String(length=255), nullable=True))
    op.execute(
        "UPDATE backups SET drive_folder_id = storage_file_id "
        "WHERE drive_folder_id IS NULL AND storage_file_id IS NOT NULL"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("backups", "drive_folder_id")
