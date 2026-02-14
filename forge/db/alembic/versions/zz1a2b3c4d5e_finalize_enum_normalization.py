"""Finalize enum normalization after multi-head convergence.

Revision ID: zz1a2b3c4d5e
Revises: z9a0b1c2d3e4, d2e3f4g5h6i7
Create Date: 2026-02-14 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "zz1a2b3c4d5e"
down_revision: Union[str, Sequence[str], None] = (
    "z9a0b1c2d3e4",
    "d2e3f4g5h6i7",
)
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
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    _rename_enum_value(bind, "oauthprovider", "GOOGLE_DRIVE", "google_drive")
    _rename_enum_value(bind, "oauthprovider", "GITHUB", "github")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    _rename_enum_value(bind, "oauthprovider", "google_drive", "GOOGLE_DRIVE")
    _rename_enum_value(bind, "oauthprovider", "github", "GITHUB")
