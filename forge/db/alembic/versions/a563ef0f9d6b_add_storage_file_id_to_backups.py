"""add storage_file_id to backups

Revision ID: a563ef0f9d6b
Revises: 180d810f8579
Create Date: 2026-01-25 11:59:08.671515

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a563ef0f9d6b'
down_revision: Union[str, Sequence[str], None] = '180d810f8579'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('backups', sa.Column('storage_file_id', sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('backups', 'storage_file_id')
