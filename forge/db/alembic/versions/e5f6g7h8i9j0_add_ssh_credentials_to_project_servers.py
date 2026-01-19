"""
Add SSH credentials to project_servers table.

Revision ID: e5f6g7h8i9j0
Revises: a1b2c3d4e5f6
Create Date: 2026-01-10 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5f6g7h8i9j0'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add per-site SSH credentials to project_servers table."""
    # Add ssh_user column for CyberPanel site-specific SSH user
    op.add_column(
        'project_servers',
        sa.Column('ssh_user', sa.String(length=100), nullable=True)
    )
    
    # Add ssh_key_path column for site-specific SSH key
    op.add_column(
        'project_servers',
        sa.Column('ssh_key_path', sa.String(length=500), nullable=True)
    )


def downgrade() -> None:
    """Remove per-site SSH credentials from project_servers table."""
    op.drop_column('project_servers', 'ssh_key_path')
    op.drop_column('project_servers', 'ssh_user')
