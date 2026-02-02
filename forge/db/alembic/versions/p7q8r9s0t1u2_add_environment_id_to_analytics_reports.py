"""Add environment_id to analytics_reports

Revision ID: p7q8r9s0t1u2
Revises: o1p2q3r4s5t6
Create Date: 2026-02-01 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "p7q8r9s0t1u2"
down_revision: Union[str, Sequence[str], None] = "o1p2q3r4s5t6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("analytics_reports") as batch_op:
        batch_op.add_column(sa.Column("environment_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_analytics_reports_environment_id",
            "project_servers",
            ["environment_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(
            "ix_analytics_reports_environment_id",
            ["environment_id"],
            unique=False,
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("analytics_reports") as batch_op:
        batch_op.drop_index("ix_analytics_reports_environment_id")
        batch_op.drop_constraint("fk_analytics_reports_environment_id", type_="foreignkey")
        batch_op.drop_column("environment_id")
