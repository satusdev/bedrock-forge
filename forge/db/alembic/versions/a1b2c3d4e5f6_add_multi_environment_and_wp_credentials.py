"""add_multi_environment_and_wp_credentials

Revision ID: a1b2c3d4e5f6
Revises: dbe90fcb9778
Create Date: 2026-01-07 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'dbe90fcb9778'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ### Project enhancements ###
    # Add local development fields
    op.add_column('projects', sa.Column('local_path', sa.String(500), nullable=True))
    op.add_column('projects', sa.Column('ddev_configured', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('projects', sa.Column('tags', sa.Text(), nullable=True))
    
    # ### Server enhancements ###
    # Add directory management and tags
    op.add_column('servers', sa.Column('wp_root_paths', sa.Text(), nullable=True))
    op.add_column('servers', sa.Column('uploads_path', sa.String(500), nullable=True))
    op.add_column('servers', sa.Column('tags', sa.Text(), nullable=True))
    
    # ### Monitor enhancements ###
    # Add advanced monitor type fields
    op.add_column('monitors', sa.Column('port', sa.Integer(), nullable=True))
    op.add_column('monitors', sa.Column('expected_keyword', sa.String(500), nullable=True))
    op.add_column('monitors', sa.Column('dns_record_type', sa.String(10), nullable=True))
    op.add_column('monitors', sa.Column('json_query_path', sa.String(500), nullable=True))
    op.add_column('monitors', sa.Column('json_expected_value', sa.String(500), nullable=True))
    op.add_column('monitors', sa.Column('last_error_message', sa.Text(), nullable=True))
    op.add_column('monitors', sa.Column('max_retries', sa.Integer(), nullable=False, server_default='3'))
    op.add_column('monitors', sa.Column('maintenance_start', sa.DateTime(timezone=True), nullable=True))
    op.add_column('monitors', sa.Column('maintenance_end', sa.DateTime(timezone=True), nullable=True))
    op.add_column('monitors', sa.Column('maintenance_reason', sa.String(500), nullable=True))
    op.add_column('monitors', sa.Column('notification_channels', sa.Text(), nullable=True))
    
    # ### Create project_servers table ###
    op.create_table(
        'project_servers',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('server_id', sa.Integer(), sa.ForeignKey('servers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('environment', sa.Enum('staging', 'production', 'development', name='serverenvironment'), nullable=False),
        sa.Column('wp_path', sa.String(500), nullable=False),
        sa.Column('wp_url', sa.String(500), nullable=False),
        sa.Column('notes', sa.String(1000), nullable=True),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('project_id', 'server_id', 'environment', name='uq_project_server_env')
    )
    op.create_index('ix_project_servers_project_id', 'project_servers', ['project_id'])
    op.create_index('ix_project_servers_server_id', 'project_servers', ['server_id'])
    
    # ### Create wp_credentials table ###
    op.create_table(
        'wp_credentials',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('project_server_id', sa.Integer(), sa.ForeignKey('project_servers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('label', sa.String(100), nullable=False, server_default='Admin'),
        sa.Column('wp_username_encrypted', sa.Text(), nullable=False),
        sa.Column('wp_password_encrypted', sa.Text(), nullable=False),
        sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('notes', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('ix_wp_credentials_project_server_id', 'wp_credentials', ['project_server_id'])
    op.create_index('ix_wp_credentials_user_id', 'wp_credentials', ['user_id'])


def downgrade() -> None:
    # ### Drop wp_credentials table ###
    op.drop_index('ix_wp_credentials_user_id', 'wp_credentials', if_exists=True)
    op.drop_index('ix_wp_credentials_project_server_id', 'wp_credentials', if_exists=True)
    op.drop_table('wp_credentials')
    
    # ### Drop project_servers table ###
    op.drop_index('ix_project_servers_server_id', 'project_servers', if_exists=True)
    op.drop_index('ix_project_servers_project_id', 'project_servers', if_exists=True)
    op.drop_table('project_servers')
    op.execute("DROP TYPE IF EXISTS serverenvironment")
    
    # ### Remove monitor enhancements ###
    op.drop_column('monitors', 'notification_channels')
    op.drop_column('monitors', 'maintenance_reason')
    op.drop_column('monitors', 'maintenance_end')
    op.drop_column('monitors', 'maintenance_start')
    op.drop_column('monitors', 'max_retries')
    op.drop_column('monitors', 'last_error_message')
    op.drop_column('monitors', 'json_expected_value')
    op.drop_column('monitors', 'json_query_path')
    op.drop_column('monitors', 'dns_record_type')
    op.drop_column('monitors', 'expected_keyword')
    op.drop_column('monitors', 'port')
    
    # ### Remove server enhancements ###
    op.drop_column('servers', 'tags')
    op.drop_column('servers', 'uploads_path')
    op.drop_column('servers', 'wp_root_paths')
    
    # ### Remove project enhancements ###
    op.drop_column('projects', 'tags')
    op.drop_column('projects', 'ddev_configured')
    op.drop_column('projects', 'local_path')
