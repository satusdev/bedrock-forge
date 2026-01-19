"""
Add client portal tables: client_users, tickets, ticket_messages.

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-01-10 11:56:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'h8i9j0k1l2m3'
down_revision = 'd8e9f0a1b2c3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add client portal tables."""
    
    # ClientUser table
    op.create_table(
        'client_users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True, default=True),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_client_users_email', 'client_users', ['email'], unique=True)
    
    # Tickets table
    op.create_table(
        'tickets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('subject', sa.String(length=255), nullable=False),
        sa.Column('status', sa.Enum('open', 'in_progress', 'waiting_reply', 'resolved', 'closed', name='ticketstatus'), nullable=True),
        sa.Column('priority', sa.Enum('low', 'medium', 'high', 'urgent', name='ticketpriority'), nullable=True),
        sa.Column('last_reply_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_tickets_client_id', 'tickets', ['client_id'])
    op.create_index('ix_tickets_status', 'tickets', ['status'])
    
    # TicketMessage table
    op.create_table(
        'ticket_messages',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('ticket_id', sa.Integer(), nullable=False),
        sa.Column('sender_type', sa.Enum('client', 'admin', name='sendertype'), nullable=False),
        sa.Column('sender_id', sa.Integer(), nullable=True),
        sa.Column('sender_name', sa.String(length=255), nullable=True),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('attachments', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_ticket_messages_ticket_id', 'ticket_messages', ['ticket_id'])


def downgrade() -> None:
    """Remove client portal tables."""
    op.drop_index('ix_ticket_messages_ticket_id', 'ticket_messages')
    op.drop_table('ticket_messages')
    op.drop_index('ix_tickets_status', 'tickets')
    op.drop_index('ix_tickets_client_id', 'tickets')
    op.drop_table('tickets')
    op.drop_index('ix_client_users_email', 'client_users')
    op.drop_table('client_users')
    
    # Drop enums
    op.execute('DROP TYPE IF EXISTS sendertype')
    op.execute('DROP TYPE IF EXISTS ticketpriority')
    op.execute('DROP TYPE IF EXISTS ticketstatus')
