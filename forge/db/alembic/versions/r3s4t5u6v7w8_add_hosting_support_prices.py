"""Add hosting/support pricing fields to hosting_packages

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-02-01 12:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "r3s4t5u6v7w8"
down_revision: Union[str, Sequence[str], None] = "q2r3s4t5u6v7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("hosting_packages", sa.Column("hosting_yearly_price", sa.Float(), nullable=False, server_default="0"))
    op.add_column("hosting_packages", sa.Column("support_monthly_price", sa.Float(), nullable=False, server_default="0"))
    op.alter_column("hosting_packages", "hosting_yearly_price", server_default=None)
    op.alter_column("hosting_packages", "support_monthly_price", server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("hosting_packages", "support_monthly_price")
    op.drop_column("hosting_packages", "hosting_yearly_price")
