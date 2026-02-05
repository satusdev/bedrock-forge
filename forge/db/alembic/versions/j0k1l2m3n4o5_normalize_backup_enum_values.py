"""Migration placeholder (no-op).

Revision ID: j0k1l2m3n4o7
Revises: j0k1l2m3n4o6
Create Date: 2026-02-05 00:00:00.000000
"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = 'j0k1l2m3n4o7'
down_revision: Union[str, Sequence[str], None] = 'j0k1l2m3n4o6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    return


def downgrade() -> None:
    """Downgrade schema."""
    return
