"""Normalize server enum values to lowercase.

Revision ID: c1d2e3f4g5h6
Revises: w1x2y3z4a5b6
Create Date: 2026-02-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4g5h6"
down_revision: Union[str, Sequence[str], None] = "w1x2y3z4a5b6"
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

    _rename_enum_value(bind, "serverstatus", "ONLINE", "online")
    _rename_enum_value(bind, "serverstatus", "OFFLINE", "offline")
    _rename_enum_value(bind, "serverstatus", "PROVISIONING", "provisioning")
    _rename_enum_value(bind, "serverstatus", "MAINTENANCE", "maintenance")

    _rename_enum_value(bind, "serverprovider", "HETZNER", "hetzner")
    _rename_enum_value(bind, "serverprovider", "CYBERPANEL", "cyberpanel")
    _rename_enum_value(bind, "serverprovider", "CPANEL", "cpanel")
    _rename_enum_value(bind, "serverprovider", "DIGITALOCEAN", "digitalocean")
    _rename_enum_value(bind, "serverprovider", "VULTR", "vultr")
    _rename_enum_value(bind, "serverprovider", "LINODE", "linode")
    _rename_enum_value(bind, "serverprovider", "CUSTOM", "custom")

    _rename_enum_value(bind, "paneltype", "CYBERPANEL", "cyberpanel")
    _rename_enum_value(bind, "paneltype", "CPANEL", "cpanel")
    _rename_enum_value(bind, "paneltype", "PLESK", "plesk")
    _rename_enum_value(bind, "paneltype", "DIRECTADMIN", "directadmin")
    _rename_enum_value(bind, "paneltype", "NONE", "none")


def downgrade() -> None:
    """Downgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    _rename_enum_value(bind, "serverstatus", "online", "ONLINE")
    _rename_enum_value(bind, "serverstatus", "offline", "OFFLINE")
    _rename_enum_value(bind, "serverstatus", "provisioning", "PROVISIONING")
    _rename_enum_value(bind, "serverstatus", "maintenance", "MAINTENANCE")

    _rename_enum_value(bind, "serverprovider", "hetzner", "HETZNER")
    _rename_enum_value(bind, "serverprovider", "cyberpanel", "CYBERPANEL")
    _rename_enum_value(bind, "serverprovider", "cpanel", "CPANEL")
    _rename_enum_value(bind, "serverprovider", "digitalocean", "DIGITALOCEAN")
    _rename_enum_value(bind, "serverprovider", "vultr", "VULTR")
    _rename_enum_value(bind, "serverprovider", "linode", "LINODE")
    _rename_enum_value(bind, "serverprovider", "custom", "CUSTOM")

    _rename_enum_value(bind, "paneltype", "cyberpanel", "CYBERPANEL")
    _rename_enum_value(bind, "paneltype", "cpanel", "CPANEL")
    _rename_enum_value(bind, "paneltype", "plesk", "PLESK")
    _rename_enum_value(bind, "paneltype", "directadmin", "DIRECTADMIN")
    _rename_enum_value(bind, "paneltype", "none", "NONE")
