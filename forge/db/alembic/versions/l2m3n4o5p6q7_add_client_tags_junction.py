"""add client tags junction table

Revision ID: l2m3n4o5p6q7
Revises: 408ce5b593a8
Create Date: 2026-01-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'l2m3n4o5p6q7'
down_revision: Union[str, Sequence[str], None] = '408ce5b593a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'client_tags',
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('tag_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('client_id', 'tag_id')
    )

    op.create_index('ix_client_tags_client_id', 'client_tags', ['client_id'])
    op.create_index('ix_client_tags_tag_id', 'client_tags', ['tag_id'])


def downgrade() -> None:
    op.drop_index('ix_client_tags_tag_id', 'client_tags')
    op.drop_index('ix_client_tags_client_id', 'client_tags')
    op.drop_table('client_tags')
