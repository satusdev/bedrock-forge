"""merge_heads

Revision ID: 11aa36235140
Revises: j0k1l2m3n4o5, f85c2dde1d9b
Create Date: 2026-01-18 11:17:13.125260

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '11aa36235140'
down_revision: Union[str, Sequence[str], None] = ('j0k1l2m3n4o5', 'f85c2dde1d9b')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
