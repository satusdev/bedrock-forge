"""
Add WordPress site management tables: wp_site_states, wp_updates.

Revision ID: g7h8i9j0k1l2
Revises: f6g7h8i9j0k1
Create Date: 2026-01-10 10:20:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'g7h8i9j0k1l2'
down_revision = 'f6g7h8i9j0k1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add WordPress management tables."""
    
    # WP Site State table (version cache)
    op.create_table(
        'wp_site_states',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('project_server_id', sa.Integer(), nullable=False),
        sa.Column('wp_version', sa.String(length=20), nullable=True),
        sa.Column('wp_version_available', sa.String(length=20), nullable=True),
        sa.Column('php_version', sa.String(length=20), nullable=True),
        sa.Column('plugins', sa.Text(), nullable=True),
        sa.Column('themes', sa.Text(), nullable=True),
        sa.Column('plugins_count', sa.Integer(), nullable=True),
        sa.Column('plugins_update_count', sa.Integer(), nullable=True),
        sa.Column('themes_count', sa.Integer(), nullable=True),
        sa.Column('themes_update_count', sa.Integer(), nullable=True),
        sa.Column('users_count', sa.Integer(), nullable=True),
        sa.Column('site_health_score', sa.Integer(), nullable=True),
        sa.Column('last_scanned_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('scan_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['project_server_id'], ['project_servers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_server_id')
    )
    
    # WP Updates table (update history)
    op.create_table(
        'wp_updates',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('project_server_id', sa.Integer(), nullable=False),
        sa.Column('update_type', sa.Enum('core', 'plugin', 'theme', name='updatetype'), nullable=False),
        sa.Column('package_name', sa.String(length=255), nullable=False),
        sa.Column('from_version', sa.String(length=50), nullable=False),
        sa.Column('to_version', sa.String(length=50), nullable=False),
        sa.Column('status', sa.Enum('pending', 'applied', 'failed', 'rolled_back', 'skipped', name='updatestatus'), nullable=True),
        sa.Column('backup_id', sa.Integer(), nullable=True),
        sa.Column('applied_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['project_server_id'], ['project_servers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['backup_id'], ['backups.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_wp_updates_project_server_id', 'wp_updates', ['project_server_id'])


def downgrade() -> None:
    """Remove WordPress management tables."""
    op.drop_index('ix_wp_updates_project_server_id', 'wp_updates', if_exists=True)
    op.drop_table('wp_updates')
    op.drop_table('wp_site_states')
    
    # Drop enums
    op.execute('DROP TYPE IF EXISTS updatestatus')
    op.execute('DROP TYPE IF EXISTS updatetype')
