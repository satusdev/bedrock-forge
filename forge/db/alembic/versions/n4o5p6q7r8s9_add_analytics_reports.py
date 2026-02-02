"""Add analytics_reports table

Revision ID: n4o5p6q7r8s9
Revises: 2ac2bda6090b
Create Date: 2026-01-29 11:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "n4o5p6q7r8s9"
down_revision: Union[str, Sequence[str], None] = "2ac2bda6090b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "analytics_reports" in inspector.get_table_names():
        return

    enum_type = postgresql.ENUM(
        "ga4",
        "lighthouse",
        name="analyticsreporttype",
        create_type=False,
    )
    enum_type.create(bind, checkfirst=True)

    op.create_table(
        "analytics_reports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("report_type", enum_type, nullable=False),
        sa.Column("url", sa.String(length=500), nullable=True),
        sa.Column("property_id", sa.String(length=120), nullable=True),
        sa.Column("device", sa.String(length=20), nullable=True),
        sa.Column("start_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.JSON(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_analytics_reports_project_id", "analytics_reports", ["project_id"], unique=False)
    op.create_index("ix_analytics_reports_report_type", "analytics_reports", ["report_type"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_analytics_reports_report_type", table_name="analytics_reports")
    op.drop_index("ix_analytics_reports_project_id", table_name="analytics_reports")
    op.drop_table("analytics_reports")
