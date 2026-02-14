"""Add app_settings table.

Revision ID: d2e3f4g5h6i7
Revises: c1d2e3f4g5h6
Create Date: 2026-02-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import forge.db.custom_types


# revision identifiers, used by Alembic.
revision: str = "d2e3f4g5h6i7"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4g5h6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "app_settings" in inspector.get_table_names():
        return

    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("encrypted_value", forge.db.custom_types.EncryptedString(), nullable=True),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("is_sensitive", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.PrimaryKeyConstraint("id")
    )
    op.create_index(op.f("ix_app_settings_key"), "app_settings", ["key"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_app_settings_key"), table_name="app_settings", if_exists=True)
    op.drop_table("app_settings")
