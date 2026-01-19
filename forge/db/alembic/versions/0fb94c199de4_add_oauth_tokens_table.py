"""add_oauth_tokens_table

Revision ID: 0fb94c199de4
Revises: 11aa36235140
Create Date: 2026-01-18 11:17:25.275844

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0fb94c199de4'
down_revision: Union[str, Sequence[str], None] = '11aa36235140'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - create oauth_tokens table."""
    # Only create the oauth_tokens table, ignore schema drift
    op.create_table('oauth_tokens',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('provider', sa.Enum('GOOGLE_DRIVE', 'GITHUB', name='oauthprovider'), nullable=False),
        sa.Column('access_token', sa.Text(), nullable=False),
        sa.Column('refresh_token', sa.Text(), nullable=True),
        sa.Column('token_type', sa.String(length=50), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('scope', sa.Text(), nullable=True),
        sa.Column('account_email', sa.String(length=255), nullable=True),
        sa.Column('account_name', sa.String(length=255), nullable=True),
        sa.Column('account_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    # Create index on user_id and provider for faster lookups
    op.create_index('ix_oauth_tokens_user_provider', 'oauth_tokens', ['user_id', 'provider'], unique=True)


def downgrade() -> None:
    """Downgrade schema - drop oauth_tokens table."""
    op.drop_index('ix_oauth_tokens_user_provider', table_name='oauth_tokens')
    op.drop_table('oauth_tokens')
