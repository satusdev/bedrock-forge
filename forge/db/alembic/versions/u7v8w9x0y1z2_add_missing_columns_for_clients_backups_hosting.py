"""Add missing columns for clients, backups, hosting packages

Revision ID: u7v8w9x0y1z2
Revises: t1u2v3w4x5y6
Create Date: 2026-02-05 12:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "u7v8w9x0y1z2"
down_revision: Union[str, Sequence[str], None] = "t1u2v3w4x5y6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _get_inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_exists(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _add_column_if_missing(
    inspector: sa.Inspector,
    table_name: str,
    column: sa.Column,
) -> bool:
    if not _column_exists(inspector, table_name, column.name):
        op.add_column(table_name, column)
        return True
    return False


def _drop_column_if_exists(inspector: sa.Inspector, table_name: str, column_name: str) -> None:
    if _column_exists(inspector, table_name, column_name):
        op.drop_column(table_name, column_name)


def upgrade() -> None:
    """Upgrade schema."""
    inspector = _get_inspector()

    # clients.website
    _add_column_if_missing(
        inspector,
        "clients",
        sa.Column("website", sa.String(length=255), nullable=True),
    )

    # backups.notes
    _add_column_if_missing(
        inspector,
        "backups",
        sa.Column("notes", sa.Text(), nullable=True),
    )

    # hosting_packages pricing splits
    hosting_yearly_added = _add_column_if_missing(
        inspector,
        "hosting_packages",
        sa.Column(
            "hosting_yearly_price",
            sa.Float(),
            nullable=False,
            server_default="0",
        ),
    )
    support_monthly_added = _add_column_if_missing(
        inspector,
        "hosting_packages",
        sa.Column(
            "support_monthly_price",
            sa.Float(),
            nullable=False,
            server_default="0",
        ),
    )

    if hosting_yearly_added:
        op.alter_column("hosting_packages", "hosting_yearly_price", server_default=None)
    if support_monthly_added:
        op.alter_column("hosting_packages", "support_monthly_price", server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    inspector = _get_inspector()
    _drop_column_if_exists(inspector, "hosting_packages", "support_monthly_price")
    _drop_column_if_exists(inspector, "hosting_packages", "hosting_yearly_price")
    _drop_column_if_exists(inspector, "backups", "notes")
    _drop_column_if_exists(inspector, "clients", "website")
