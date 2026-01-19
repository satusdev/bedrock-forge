"""Add subscription, domain, ssl, and hosting_package tables

Revision ID: d8e9f0a1b2c3
Revises: c7f8a9b0d1e2
Create Date: 2026-01-08 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd8e9f0a1b2c3'
down_revision: Union[str, None] = 'c7f8a9b0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create hosting_packages table
    op.create_table(
        'hosting_packages',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('disk_space_gb', sa.Integer(), nullable=True),
        sa.Column('bandwidth_gb', sa.Integer(), nullable=True),
        sa.Column('domains_limit', sa.Integer(), nullable=True),
        sa.Column('subdomains_limit', sa.Integer(), nullable=True),
        sa.Column('databases_limit', sa.Integer(), nullable=True),
        sa.Column('email_accounts_limit', sa.Integer(), nullable=True),
        sa.Column('ftp_accounts_limit', sa.Integer(), nullable=True),
        sa.Column('php_workers', sa.Integer(), nullable=True),
        sa.Column('ram_mb', sa.Integer(), nullable=True),
        sa.Column('cpu_cores', sa.Float(), nullable=True),
        sa.Column('monthly_price', sa.Float(), nullable=True),
        sa.Column('quarterly_price', sa.Float(), nullable=True),
        sa.Column('yearly_price', sa.Float(), nullable=True),
        sa.Column('biennial_price', sa.Float(), nullable=True),
        sa.Column('setup_fee', sa.Float(), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('features', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_featured', sa.Boolean(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
        sa.UniqueConstraint('slug')
    )
    op.create_index(op.f('ix_hosting_packages_slug'), 'hosting_packages', ['slug'], unique=True)
    
    # Create subscriptions table
    op.create_table(
        'subscriptions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('subscription_type', sa.Enum('HOSTING', 'DOMAIN', 'SSL', 'MAINTENANCE', 'SUPPORT', 'BACKUP', 'CDN', 'EMAIL', 'OTHER', name='subscriptiontype'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('provider', sa.String(length=100), nullable=True),
        sa.Column('billing_cycle', sa.Enum('MONTHLY', 'QUARTERLY', 'BIANNUAL', 'YEARLY', 'BIENNIAL', 'TRIENNIAL', name='billingcycle'), nullable=True),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('next_billing_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.Enum('ACTIVE', 'PENDING', 'CANCELLED', 'EXPIRED', 'SUSPENDED', name='subscriptionstatus'), nullable=True),
        sa.Column('auto_renew', sa.Boolean(), nullable=True),
        sa.Column('reminder_days', sa.Integer(), nullable=True),
        sa.Column('last_reminder_sent', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reminder_count', sa.Integer(), nullable=True),
        sa.Column('last_invoice_id', sa.Integer(), nullable=True),
        sa.Column('total_invoiced', sa.Float(), nullable=True),
        sa.Column('total_paid', sa.Float(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.ForeignKeyConstraint(['last_invoice_id'], ['invoices.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create domains table
    op.create_table(
        'domains',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('domain_name', sa.String(length=255), nullable=False),
        sa.Column('tld', sa.String(length=50), nullable=False),
        sa.Column('registrar', sa.Enum('NAMECHEAP', 'GODADDY', 'CLOUDFLARE', 'GOOGLE_DOMAINS', 'NAME_COM', 'PORKBUN', 'HOVER', 'DYNADOT', 'OTHER', name='registrar'), nullable=True),
        sa.Column('registrar_name', sa.String(length=100), nullable=True),
        sa.Column('registrar_url', sa.String(length=500), nullable=True),
        sa.Column('registration_date', sa.Date(), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=False),
        sa.Column('last_renewed', sa.Date(), nullable=True),
        sa.Column('nameservers', sa.Text(), nullable=True),
        sa.Column('dns_provider', sa.String(length=100), nullable=True),
        sa.Column('dns_zone_id', sa.String(length=255), nullable=True),
        sa.Column('status', sa.Enum('ACTIVE', 'EXPIRED', 'PENDING_TRANSFER', 'LOCKED', 'REDEMPTION', 'PENDING_DELETE', name='domainstatus'), nullable=True),
        sa.Column('auto_renew', sa.Boolean(), nullable=True),
        sa.Column('privacy_protection', sa.Boolean(), nullable=True),
        sa.Column('transfer_lock', sa.Boolean(), nullable=True),
        sa.Column('annual_cost', sa.Float(), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('whois_data', sa.Text(), nullable=True),
        sa.Column('last_whois_check', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reminder_days', sa.Integer(), nullable=True),
        sa.Column('last_reminder_sent', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('client_id', sa.Integer(), nullable=False),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('subscription_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('domain_name')
    )
    op.create_index(op.f('ix_domains_domain_name'), 'domains', ['domain_name'], unique=True)
    
    # Create ssl_certificates table
    op.create_table(
        'ssl_certificates',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('common_name', sa.String(length=255), nullable=False),
        sa.Column('san_domains', sa.Text(), nullable=True),
        sa.Column('provider', sa.Enum('LETS_ENCRYPT', 'CLOUDFLARE', 'CYBERPANEL', 'COMODO', 'DIGICERT', 'GLOBALSIGN', 'SECTIGO', 'GODADDY', 'NAMECHEAP', 'OTHER', name='sslprovider'), nullable=True),
        sa.Column('certificate_type', sa.Enum('DV', 'OV', 'EV', 'WILDCARD', 'MULTI_DOMAIN', name='certificatetype'), nullable=True),
        sa.Column('issue_date', sa.Date(), nullable=False),
        sa.Column('expiry_date', sa.Date(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('auto_renew', sa.Boolean(), nullable=True),
        sa.Column('is_wildcard', sa.Boolean(), nullable=True),
        sa.Column('serial_number', sa.String(length=100), nullable=True),
        sa.Column('issuer', sa.String(length=255), nullable=True),
        sa.Column('fingerprint_sha256', sa.String(length=100), nullable=True),
        sa.Column('annual_cost', sa.Float(), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('last_renewal_attempt', sa.DateTime(timezone=True), nullable=True),
        sa.Column('renewal_failure_count', sa.Integer(), nullable=True),
        sa.Column('last_renewal_error', sa.Text(), nullable=True),
        sa.Column('reminder_days', sa.Integer(), nullable=True),
        sa.Column('last_reminder_sent', sa.DateTime(timezone=True), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('domain_id', sa.Integer(), nullable=True),
        sa.Column('project_id', sa.Integer(), nullable=True),
        sa.Column('subscription_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['domain_id'], ['domains.id'], ),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ),
        sa.ForeignKeyConstraint(['subscription_id'], ['subscriptions.id'], ),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('ssl_certificates')
    op.drop_index(op.f('ix_domains_domain_name'), table_name='domains')
    op.drop_table('domains')
    op.drop_table('subscriptions')
    op.drop_index(op.f('ix_hosting_packages_slug'), table_name='hosting_packages')
    op.drop_table('hosting_packages')
