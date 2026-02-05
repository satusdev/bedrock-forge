"""Add backup storage identifier columns

Revision ID: v1w2x3y4z5a6
Revises: u7v8w9x0y1z2
Create Date: 2026-02-05 13:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "v1w2x3y4z5a6"
down_revision: Union[str, Sequence[str], None] = "u7v8w9x0y1z2"
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

    _add_column_if_missing(
        inspector,
        "backups",
        sa.Column("storage_file_id", sa.String(length=255), nullable=True),
    )
    _add_column_if_missing(
        inspector,
        "backups",
        sa.Column("drive_folder_id", sa.String(length=255), nullable=True),
    )
    _add_column_if_missing(
        inspector,
        "backups",
        sa.Column("logs", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    inspector = _get_inspector()
    _drop_column_if_exists(inspector, "backups", "logs")
    _drop_column_if_exists(inspector, "backups", "drive_folder_id")
    _drop_column_if_exists(inspector, "backups", "storage_file_id")
