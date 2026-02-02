"""add gdrive_backups_folder_id to project_servers

Revision ID: d380adbc04c9
Revises: a563ef0f9d6b
Create Date: 2026-01-25 12:12:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd380adbc04c9'
down_revision: Union[str, Sequence[str], None] = 'a563ef0f9d6b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('project_servers', sa.Column('gdrive_backups_folder_id', sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('project_servers', 'gdrive_backups_folder_id')
