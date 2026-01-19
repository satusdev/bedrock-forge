"""
Add monitoring enhancement tables: heartbeats, notification_channels, incidents.

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-01-10 10:17:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f6g7h8i9j0k1'
down_revision = 'e5f6g7h8i9j0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add monitoring enhancement tables."""
    
    # Heartbeat history table
    op.create_table(
        'heartbeats',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('monitor_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.Enum('up', 'down', 'degraded', 'pending', name='heartbeatstatus'), nullable=True),
        sa.Column('response_time_ms', sa.Integer(), nullable=True),
        sa.Column('status_code', sa.Integer(), nullable=True),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('checked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['monitor_id'], ['monitors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_heartbeats_monitor_id', 'heartbeats', ['monitor_id'])
    op.create_index('ix_heartbeats_checked_at', 'heartbeats', ['checked_at'])
    
    # Notification channels table
    op.create_table(
        'notification_channels',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('channel_type', sa.Enum('email', 'slack', 'telegram', 'webhook', 'discord', name='channeltype'), nullable=True),
        sa.Column('config', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('last_sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Incidents table
    op.create_table(
        'incidents',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('monitor_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('status', sa.Enum('ongoing', 'resolved', 'investigating', name='incidentstatus'), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), nullable=True),
        sa.Column('root_cause', sa.Text(), nullable=True),
        sa.Column('resolution', sa.Text(), nullable=True),
        sa.Column('notification_sent', sa.Boolean(), nullable=True),
        sa.Column('recovery_notification_sent', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['monitor_id'], ['monitors.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_incidents_monitor_id', 'incidents', ['monitor_id'])


def downgrade() -> None:
    """Remove monitoring enhancement tables."""
    op.drop_index('ix_incidents_monitor_id', 'incidents')
    op.drop_table('incidents')
    op.drop_table('notification_channels')
    op.drop_index('ix_heartbeats_checked_at', 'heartbeats')
    op.drop_index('ix_heartbeats_monitor_id', 'heartbeats')
    op.drop_table('heartbeats')
    
    # Drop enums
    op.execute('DROP TYPE IF EXISTS incidentstatus')
    op.execute('DROP TYPE IF EXISTS channeltype')
    op.execute('DROP TYPE IF EXISTS heartbeatstatus')
