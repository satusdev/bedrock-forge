"""Normalize remaining enum labels to match model enum values.

Revision ID: z9a0b1c2d3e4
Revises: y8z9a0b1c2d3
Create Date: 2026-02-14 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "z9a0b1c2d3e4"
down_revision: Union[str, Sequence[str], None] = "y8z9a0b1c2d3"
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


def _rename_pairs(conn, enum_name: str, pairs: list[tuple[str, str]]) -> None:
    for old_value, new_value in pairs:
        _rename_enum_value(conn, enum_name, old_value, new_value)


def _mappings() -> dict[str, list[tuple[str, str]]]:
    return {
        "oauthprovider": [
            ("GOOGLE_DRIVE", "google_drive"),
            ("GITHUB", "github"),
        ],
        "auditaction": [
            ("CREATE", "create"),
            ("UPDATE", "update"),
            ("DELETE", "delete"),
            ("LOGIN", "login"),
            ("LOGOUT", "logout"),
            ("DEPLOY", "deploy"),
            ("BACKUP", "backup"),
            ("RESTORE", "restore"),
            ("SYNC", "sync"),
            ("PROVISION", "provision"),
            ("COMMAND", "command"),
            ("OTHER", "other"),
        ],
        "billingstatus": [
            ("ACTIVE", "active"),
            ("INACTIVE", "inactive"),
            ("TRIAL", "trial"),
            ("OVERDUE", "overdue"),
            ("CANCELLED", "cancelled"),
        ],
        "invoicestatus": [
            ("DRAFT", "draft"),
            ("PENDING", "pending"),
            ("PAID", "paid"),
            ("OVERDUE", "overdue"),
            ("CANCELLED", "cancelled"),
            ("REFUNDED", "refunded"),
        ],
        "registrar": [
            ("NAMECHEAP", "namecheap"),
            ("GODADDY", "godaddy"),
            ("CLOUDFLARE", "cloudflare"),
            ("GOOGLE_DOMAINS", "google_domains"),
            ("NAME_COM", "name_com"),
            ("PORKBUN", "porkbun"),
            ("HOVER", "hover"),
            ("DYNADOT", "dynadot"),
            ("OTHER", "other"),
        ],
        "domainstatus": [
            ("ACTIVE", "active"),
            ("EXPIRED", "expired"),
            ("PENDING_TRANSFER", "pending_transfer"),
            ("LOCKED", "locked"),
            ("REDEMPTION", "redemption"),
            ("PENDING_DELETE", "pending_delete"),
        ],
        "sslprovider": [
            ("LETS_ENCRYPT", "letsencrypt"),
            ("CLOUDFLARE", "cloudflare"),
            ("CYBERPANEL", "cyberpanel"),
            ("COMODO", "comodo"),
            ("DIGICERT", "digicert"),
            ("GLOBALSIGN", "globalsign"),
            ("SECTIGO", "sectigo"),
            ("GODADDY", "godaddy"),
            ("NAMECHEAP", "namecheap"),
            ("OTHER", "other"),
        ],
        "certificatetype": [
            ("DV", "dv"),
            ("OV", "ov"),
            ("EV", "ev"),
            ("WILDCARD", "wildcard"),
            ("MULTI_DOMAIN", "multi_domain"),
        ],
        "subscriptiontype": [
            ("HOSTING", "hosting"),
            ("DOMAIN", "domain"),
            ("SSL", "ssl"),
            ("MAINTENANCE", "maintenance"),
            ("SUPPORT", "support"),
            ("BACKUP", "backup"),
            ("CDN", "cdn"),
            ("EMAIL", "email"),
            ("OTHER", "other"),
        ],
        "billingcycle": [
            ("MONTHLY", "monthly"),
            ("QUARTERLY", "quarterly"),
            ("BIANNUAL", "biannual"),
            ("YEARLY", "yearly"),
            ("BIENNIAL", "biennial"),
            ("TRIENNIAL", "triennial"),
        ],
        "subscriptionstatus": [
            ("ACTIVE", "active"),
            ("PENDING", "pending"),
            ("CANCELLED", "cancelled"),
            ("EXPIRED", "expired"),
            ("SUSPENDED", "suspended"),
        ],
        "projectstatus": [
            ("ACTIVE", "active"),
            ("PAUSED", "paused"),
            ("ARCHIVED", "archived"),
        ],
        "environmenttype": [
            ("DEVELOPMENT", "development"),
            ("STAGING", "staging"),
            ("PRODUCTION", "production"),
        ],
        "monitortype": [
            ("UPTIME", "uptime"),
            ("PERFORMANCE", "performance"),
            ("SSL", "ssl"),
            ("SECURITY", "security"),
            ("TCP", "tcp"),
            ("PING", "ping"),
            ("DNS", "dns"),
            ("KEYWORD", "keyword"),
            ("JSON_QUERY", "json_query"),
        ],
        "monitorstatus": [
            ("UP", "up"),
            ("DOWN", "down"),
            ("DEGRADED", "degraded"),
            ("PENDING", "pending"),
            ("MAINTENANCE", "maintenance"),
        ],
    }


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for enum_name, pairs in _mappings().items():
        _rename_pairs(bind, enum_name, pairs)


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for enum_name, pairs in _mappings().items():
        _rename_pairs(bind, enum_name, [(new, old) for old, new in pairs])
