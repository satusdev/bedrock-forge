"""Add client and invoice tables with project relationships

Revision ID: c7f8a9b0d1e2
Revises: a1b2c3d4e5f6
Create Date: 2026-01-08 10:35:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7f8a9b0d1e2'
down_revision: Union[str, None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create clients table
    op.create_table(
        'clients',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('company', sa.String(length=255), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('phone', sa.String(length=50), nullable=True),
        sa.Column('billing_email', sa.String(length=255), nullable=True),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('website', sa.String(length=500), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('billing_status', sa.Enum('ACTIVE', 'INACTIVE', 'TRIAL', 'OVERDUE', name='billingstatus'), nullable=True),
        sa.Column('payment_terms', sa.Integer(), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('tax_rate', sa.Float(), nullable=True),
        sa.Column('auto_billing', sa.Boolean(), nullable=True),
        sa.Column('contract_start', sa.Date(), nullable=True),
        sa.Column('contract_end', sa.Date(), nullable=True),
        sa.Column('contract_terms', sa.Text(), nullable=True),
        sa.Column('monthly_retainer', sa.Float(), nullable=True),
        sa.Column('invoice_prefix', sa.String(length=20), nullable=True),
        sa.Column('next_invoice_number', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )
    op.create_index(op.f('ix_clients_email'), 'clients', ['email'], unique=True)
    
    # Create invoices table
    op.create_table(
        'invoices',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('invoice_number', sa.String(length=50), nullable=False),
        sa.Column('status', sa.Enum('DRAFT', 'PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED', name='invoicestatus'), nullable=True),
        sa.Column('issue_date', sa.Date(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('paid_date', sa.Date(), nullable=True),
        sa.Column('subtotal', sa.Float(), nullable=True),
        sa.Column('tax_rate', sa.Float(), nullable=True),
        sa.Column('tax_amount', sa.Float(), nullable=True),
        sa.Column('discount_amount', sa.Float(), nullable=True),
        sa.Column('total', sa.Float(), nullable=True),
        sa.Column('amount_paid', sa.Float(), nullable=True),
        sa.Column('payment_method', sa.String(length=50), nullable=True),
        sa.Column('payment_reference', sa.String(length=255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('terms', sa.Text(), nullable=True),
        sa.Column('period_start', sa.Date(), nullable=True),
        sa.Column('period_end', sa.Date(), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('invoice_number')
    )
    op.create_index(op.f('ix_invoices_invoice_number'), 'invoices', ['invoice_number'], unique=True)
    
    # Create invoice_items table
    op.create_table(
        'invoice_items',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('quantity', sa.Float(), nullable=True),
        sa.Column('unit_price', sa.Float(), nullable=True),
        sa.Column('total', sa.Float(), nullable=True),
        sa.Column('item_type', sa.String(length=50), nullable=True),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('invoice_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Add client_id and gdrive columns to projects table
    with op.batch_alter_table('projects', schema=None) as batch_op:
        batch_op.add_column(sa.Column('client_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('gdrive_assets_folder_id', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('gdrive_docs_folder_id', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('gdrive_backups_folder_id', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('gdrive_connected', sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column('gdrive_last_sync', sa.DateTime(timezone=True), nullable=True))
        batch_op.create_foreign_key('fk_projects_client_id', 'clients', ['client_id'], ['id'])
    
    # Add CyberPanel fields to servers table
    with op.batch_alter_table('servers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('panel_port', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('panel_api_user', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('panel_api_token', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('panel_verified', sa.Boolean(), nullable=True))


def downgrade() -> None:
    # Remove CyberPanel fields from servers
    with op.batch_alter_table('servers', schema=None) as batch_op:
        batch_op.drop_column('panel_verified')
        batch_op.drop_column('panel_api_token')
        batch_op.drop_column('panel_api_user')
        batch_op.drop_column('panel_port')
    
    # Remove new columns from projects
    with op.batch_alter_table('projects', schema=None) as batch_op:
        batch_op.drop_constraint('fk_projects_client_id', type_='foreignkey')
        batch_op.drop_column('gdrive_last_sync')
        batch_op.drop_column('gdrive_connected')
        batch_op.drop_column('gdrive_backups_folder_id')
        batch_op.drop_column('gdrive_docs_folder_id')
        batch_op.drop_column('gdrive_assets_folder_id')
        batch_op.drop_column('client_id')
    
    # Drop tables in reverse order
    op.drop_table('invoice_items')
    op.drop_index(op.f('ix_invoices_invoice_number'), table_name='invoices', if_exists=True)
    op.drop_table('invoices')
    op.drop_index(op.f('ix_clients_email'), table_name='clients', if_exists=True)
    op.drop_table('clients')
