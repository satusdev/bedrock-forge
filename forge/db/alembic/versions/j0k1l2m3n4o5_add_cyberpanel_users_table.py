"""
Add cyberpanel_users table for CyberPanel user management.

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-01-17 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'j0k1l2m3n4o5'
down_revision = 'i9j0k1l2m3n4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add cyberpanel_users table."""
    
    # Create enums
    cyberpanel_user_status_enum = sa.Enum(
        'active', 'suspended', 'pending_sync', 'sync_error', 'deleted',
        name='cyberpaneluserstatus'
    )
    cyberpanel_user_type_enum = sa.Enum(
        'admin', 'reseller', 'user',
        name='cyberpanelusertype'
    )
    
    # Create cyberpanel_users table
    op.create_table(
        'cyberpanel_users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        
        # Foreign keys
        sa.Column('server_id', sa.Integer(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        
        # User info
        sa.Column('username', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('first_name', sa.String(length=100), nullable=True),
        sa.Column('last_name', sa.String(length=100), nullable=True),
        sa.Column('user_type', cyberpanel_user_type_enum, nullable=False, server_default='user'),
        sa.Column('acl_name', sa.String(length=100), nullable=True),
        
        # Password management (encrypted)
        sa.Column('password_encrypted', sa.Text(), nullable=True),
        sa.Column('password_set_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('password_last_changed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('password_out_of_sync', sa.Boolean(), nullable=False, server_default='false'),
        
        # Status and sync tracking
        sa.Column('status', cyberpanel_user_status_enum, nullable=False, server_default='active'),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('synced_from_panel', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('sync_error_message', sa.Text(), nullable=True),
        
        # Resource limits
        sa.Column('websites_limit', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('websites_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('disk_limit', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('disk_used', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('bandwidth_limit', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('bandwidth_used', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('databases_limit', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('databases_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('email_accounts_limit', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('email_accounts_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('ftp_accounts_limit', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('ftp_accounts_count', sa.Integer(), nullable=False, server_default='0'),
        
        # Package info
        sa.Column('package_name', sa.String(length=100), nullable=True),
        
        # Audit and notes
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_login_ip', sa.String(length=45), nullable=True),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        
        # Primary key
        sa.PrimaryKeyConstraint('id'),
        
        # Foreign keys
        sa.ForeignKeyConstraint(['server_id'], ['servers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        
        # Unique constraint: one username per server
        sa.UniqueConstraint('server_id', 'username', name='uq_server_username'),
    )
    
    # Create indexes
    op.create_index('ix_cyberpanel_users_server_id', 'cyberpanel_users', ['server_id'])
    op.create_index('ix_cyberpanel_users_username', 'cyberpanel_users', ['username'])
    op.create_index('ix_cyberpanel_users_status', 'cyberpanel_users', ['status'])


def downgrade() -> None:
    """Remove cyberpanel_users table."""
    
    # Drop indexes
    op.drop_index('ix_cyberpanel_users_status', 'cyberpanel_users')
    op.drop_index('ix_cyberpanel_users_username', 'cyberpanel_users')
    op.drop_index('ix_cyberpanel_users_server_id', 'cyberpanel_users')
    
    # Drop table
    op.drop_table('cyberpanel_users')
    
    # Drop enums
    sa.Enum(name='cyberpaneluserstatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='cyberpanelusertype').drop(op.get_bind(), checkfirst=True)
