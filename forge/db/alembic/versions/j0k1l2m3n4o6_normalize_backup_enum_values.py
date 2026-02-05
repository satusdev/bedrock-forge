"""Normalize backup enum values to lowercase.

Revision ID: j0k1l2m3n4o6
Revises: h8i9j0k1l2m3
Create Date: 2026-02-05 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'j0k1l2m3n4o6'
down_revision: Union[str, Sequence[str], None] = 'h8i9j0k1l2m3'
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

    _rename_enum_value(bind, "backuptype", "FULL", "full")
    _rename_enum_value(bind, "backuptype", "DATABASE", "database")
    _rename_enum_value(bind, "backuptype", "FILES", "files")

    _rename_enum_value(bind, "backupstoragetype", "LOCAL", "local")
    _rename_enum_value(bind, "backupstoragetype", "GOOGLE_DRIVE", "google_drive")
    _rename_enum_value(bind, "backupstoragetype", "S3", "s3")


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    _rename_enum_value(bind, "backuptype", "full", "FULL")
    _rename_enum_value(bind, "backuptype", "database", "DATABASE")
    _rename_enum_value(bind, "backuptype", "files", "FILES")

    _rename_enum_value(bind, "backupstoragetype", "local", "LOCAL")
    _rename_enum_value(bind, "backupstoragetype", "google_drive", "GOOGLE_DRIVE")
    _rename_enum_value(bind, "backupstoragetype", "s3", "S3")
