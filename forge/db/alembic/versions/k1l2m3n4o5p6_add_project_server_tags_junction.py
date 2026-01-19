"""add project and server tags junction tables

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-01-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'k1l2m3n4o5p6'
down_revision: Union[str, None] = 'j0k1l2m3n4o5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create project_tags junction table
    op.create_table(
        'project_tags',
        sa.Column('project_id', sa.Integer(), nullable=False),
        sa.Column('tag_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('project_id', 'tag_id')
    )
    
    # Create server_tags junction table
    op.create_table(
        'server_tags',
        sa.Column('server_id', sa.Integer(), nullable=False),
        sa.Column('tag_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['server_id'], ['servers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('server_id', 'tag_id')
    )
    
    # Create indexes for better query performance
    op.create_index('ix_project_tags_project_id', 'project_tags', ['project_id'])
    op.create_index('ix_project_tags_tag_id', 'project_tags', ['tag_id'])
    op.create_index('ix_server_tags_server_id', 'server_tags', ['server_id'])
    op.create_index('ix_server_tags_tag_id', 'server_tags', ['tag_id'])


def downgrade() -> None:
    op.drop_index('ix_server_tags_tag_id', 'server_tags')
    op.drop_index('ix_server_tags_server_id', 'server_tags')
    op.drop_index('ix_project_tags_tag_id', 'project_tags')
    op.drop_index('ix_project_tags_project_id', 'project_tags')
    op.drop_table('server_tags')
    op.drop_table('project_tags')
