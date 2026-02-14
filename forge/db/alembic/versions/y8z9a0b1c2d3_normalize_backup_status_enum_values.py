"""Normalize backup status enum values to lowercase.

Revision ID: y8z9a0b1c2d3
Revises: j0k1l2m3n4o5
Create Date: 2026-02-14 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "y8z9a0b1c2d3"
down_revision: Union[str, Sequence[str], None] = "j0k1l2m3n4o5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _get_enum_labels(conn, enum_name: str) -> set[str]:
    rows = conn.execute(
        sa.text(
            """
            SELECT e.enumlabel
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = :enum_name
            """
        ),
        {"enum_name": enum_name},
    ).fetchall()
    return {row[0] for row in rows}


def _rename_enum_value(conn, enum_name: str, old_value: str, new_value: str) -> None:
    labels = _get_enum_labels(conn, enum_name)
    if old_value not in labels:
        return
    if new_value in labels:
        return

    old_escaped = old_value.replace("'", "''")
    new_escaped = new_value.replace("'", "''")
    conn.exec_driver_sql(
        f"ALTER TYPE {enum_name} RENAME VALUE '{old_escaped}' TO '{new_escaped}'"
    )


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    _rename_enum_value(bind, "backupstatus", "PENDING", "pending")
    _rename_enum_value(bind, "backupstatus", "RUNNING", "running")
    _rename_enum_value(bind, "backupstatus", "COMPLETED", "completed")
    _rename_enum_value(bind, "backupstatus", "FAILED", "failed")


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    _rename_enum_value(bind, "backupstatus", "pending", "PENDING")
    _rename_enum_value(bind, "backupstatus", "running", "RUNNING")
    _rename_enum_value(bind, "backupstatus", "completed", "COMPLETED")
    _rename_enum_value(bind, "backupstatus", "failed", "FAILED")
