"""add project_server_id to backups

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-01-24 15:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'm3n4o5p6q7r8'
down_revision = 'l2m3n4o5p6q7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add project_server_id column to backups table
    op.add_column('backups', sa.Column('project_server_id', sa.Integer(), nullable=True))
    
    # Create foreign key relationship
    op.create_foreign_key(
        'fk_backups_project_server_id_project_servers',
        'backups', 'project_servers',
        ['project_server_id'], ['id']
    )


def downgrade() -> None:
    # Remove foreign key constraint first
    op.drop_constraint('fk_backups_project_server_id_project_servers', 'backups', type_='foreignkey')
    
    # Remove column
    op.drop_column('backups', 'project_server_id')
