"""merge oauth and tag tables

Revision ID: 408ce5b593a8
Revises: 0fb94c199de4, k1l2m3n4o5p6
Create Date: 2026-01-18 14:54:46.456750

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '408ce5b593a8'
down_revision: Union[str, Sequence[str], None] = ('0fb94c199de4', 'k1l2m3n4o5p6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
