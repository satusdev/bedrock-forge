"""
Add backup_schedules table for automated backup configuration.

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-01-17 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'i9j0k1l2m3n4'
down_revision = 'h8i9j0k1l2m3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add backup_schedules table."""
    
    # Create schedule enums
    schedule_frequency_enum = sa.Enum(
        'hourly', 'daily', 'weekly', 'monthly', 'custom',
        name='schedulefrequency'
    )
    schedule_status_enum = sa.Enum(
        'active', 'paused', 'disabled',
        name='schedulestatus'
    )
    
    # BackupSchedule table
    op.create_table(
        'backup_schedules',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        
        # Schedule configuration
        sa.Column('frequency', schedule_frequency_enum, nullable=False, server_default='daily'),
        sa.Column('cron_expression', sa.String(length=100), nullable=True),
        sa.Column('hour', sa.Integer(), nullable=False, server_default='2'),
        sa.Column('minute', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('day_of_week', sa.Integer(), nullable=True),
        sa.Column('day_of_month', sa.Integer(), nullable=True),
        sa.Column('timezone', sa.String(length=50), nullable=False, server_default='UTC'),
        
        # Backup configuration (reuse existing enums from backups table)
        sa.Column('backup_type', sa.Enum('full', 'database', 'files', name='backuptype', create_type=False), nullable=False, server_default='full'),
        sa.Column('storage_type', sa.Enum('local', 'google_drive', 's3', name='backupstoragetype', create_type=False), nullable=False, server_default='google_drive'),
        
        # Retention policy
        sa.Column('retention_count', sa.Integer(), nullable=False, server_default='7'),
        sa.Column('retention_days', sa.Integer(), nullable=True),
        
        # Status and tracking
        sa.Column('status', schedule_status_enum, nullable=False, server_default='active'),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('next_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_run_success', sa.Boolean(), nullable=True),
        sa.Column('last_run_error', sa.Text(), nullable=True),
        sa.Column('run_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failure_count', sa.Integer(), nullable=False, server_default='0'),
        
        # Celery Beat integration
        sa.Column('celery_task_id', sa.String(length=255), nullable=True, unique=True),
        
        # Additional configuration (JSON)
        sa.Column('config', sa.JSON(), nullable=True),
        
        # Foreign keys
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('created_by_id', sa.Integer(), nullable=False),
        
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for common queries
    op.create_index('ix_backup_schedules_project_id', 'backup_schedules', ['project_id'])
    op.create_index('ix_backup_schedules_status', 'backup_schedules', ['status'])
    op.create_index('ix_backup_schedules_next_run_at', 'backup_schedules', ['next_run_at'])


def downgrade() -> None:
    """Remove backup_schedules table."""
    op.drop_index('ix_backup_schedules_next_run_at', table_name='backup_schedules')
    op.drop_index('ix_backup_schedules_status', table_name='backup_schedules')
    op.drop_index('ix_backup_schedules_project_id', table_name='backup_schedules')
    op.drop_table('backup_schedules')
    
    # Drop custom enums
    op.execute('DROP TYPE IF EXISTS schedulestatus')
    op.execute('DROP TYPE IF EXISTS schedulefrequency')
