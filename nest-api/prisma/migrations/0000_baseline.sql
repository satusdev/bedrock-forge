-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "analyticsreporttype" AS ENUM ('ga4', 'lighthouse');

-- CreateEnum
CREATE TYPE "auditaction" AS ENUM ('create', 'update', 'delete', 'login', 'logout', 'deploy', 'backup', 'restore', 'sync', 'provision', 'command', 'other');

-- CreateEnum
CREATE TYPE "backupstatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "backupstoragetype" AS ENUM ('local', 'google_drive', 's3');

-- CreateEnum
CREATE TYPE "backuptype" AS ENUM ('full', 'database', 'files');

-- CreateEnum
CREATE TYPE "billingcycle" AS ENUM ('monthly', 'quarterly', 'biannual', 'yearly', 'biennial', 'triennial');

-- CreateEnum
CREATE TYPE "billingstatus" AS ENUM ('active', 'inactive', 'trial', 'overdue');

-- CreateEnum
CREATE TYPE "certificatetype" AS ENUM ('dv', 'ov', 'ev', 'wildcard', 'multi_domain');

-- CreateEnum
CREATE TYPE "channeltype" AS ENUM ('email', 'slack', 'telegram', 'webhook', 'discord');

-- CreateEnum
CREATE TYPE "clientrole" AS ENUM ('admin', 'member', 'viewer');

-- CreateEnum
CREATE TYPE "credentialstatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "cyberpaneluserstatus" AS ENUM ('active', 'suspended', 'pending_sync', 'sync_error', 'deleted');

-- CreateEnum
CREATE TYPE "cyberpanelusertype" AS ENUM ('admin', 'reseller', 'user');

-- CreateEnum
CREATE TYPE "domainstatus" AS ENUM ('active', 'expired', 'pending_transfer', 'locked', 'redemption', 'pending_delete');

-- CreateEnum
CREATE TYPE "environmenttype" AS ENUM ('development', 'staging', 'production');

-- CreateEnum
CREATE TYPE "heartbeatstatus" AS ENUM ('up', 'down', 'degraded', 'pending');

-- CreateEnum
CREATE TYPE "incidentstatus" AS ENUM ('ongoing', 'resolved', 'investigating');

-- CreateEnum
CREATE TYPE "invoicestatus" AS ENUM ('draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "monitorstatus" AS ENUM ('up', 'down', 'degraded');

-- CreateEnum
CREATE TYPE "monitortype" AS ENUM ('uptime', 'performance', 'ssl', 'security');

-- CreateEnum
CREATE TYPE "oauthprovider" AS ENUM ('google_drive', 'github');

-- CreateEnum
CREATE TYPE "paneltype" AS ENUM ('cyberpanel', 'cpanel', 'plesk', 'none');

-- CreateEnum
CREATE TYPE "projectstatus" AS ENUM ('active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "registrar" AS ENUM ('namecheap', 'godaddy', 'cloudflare', 'google_domains', 'name_com', 'porkbun', 'hover', 'dynadot', 'other');

-- CreateEnum
CREATE TYPE "schedulefrequency" AS ENUM ('hourly', 'daily', 'weekly', 'monthly', 'custom');

-- CreateEnum
CREATE TYPE "schedulestatus" AS ENUM ('active', 'paused', 'disabled');

-- CreateEnum
CREATE TYPE "sendertype" AS ENUM ('client', 'admin');

-- CreateEnum
CREATE TYPE "serverenvironment" AS ENUM ('staging', 'production', 'development');

-- CreateEnum
CREATE TYPE "serverprovider" AS ENUM ('hetzner', 'cyberpanel', 'cpanel', 'digitalocean', 'custom');

-- CreateEnum
CREATE TYPE "serverstatus" AS ENUM ('online', 'offline', 'provisioning', 'maintenance');

-- CreateEnum
CREATE TYPE "sslprovider" AS ENUM ('letsencrypt', 'cloudflare', 'cyberpanel', 'comodo', 'digicert', 'globalsign', 'sectigo', 'godaddy', 'namecheap', 'other');

-- CreateEnum
CREATE TYPE "subscriptionstatus" AS ENUM ('active', 'pending', 'cancelled', 'expired', 'suspended');

-- CreateEnum
CREATE TYPE "subscriptiontype" AS ENUM ('hosting', 'domain', 'ssl', 'maintenance', 'support', 'backup', 'cdn', 'email', 'other');

-- CreateEnum
CREATE TYPE "ticketpriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "ticketstatus" AS ENUM ('open', 'in_progress', 'waiting_reply', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "updatestatus" AS ENUM ('pending', 'applied', 'failed', 'rolled_back', 'skipped');

-- CreateEnum
CREATE TYPE "updatetype" AS ENUM ('core', 'plugin', 'theme');

-- CreateTable
CREATE TABLE "alembic_version" (
    "version_num" VARCHAR(32) NOT NULL,

    CONSTRAINT "alembic_version_pkc" PRIMARY KEY ("version_num")
);

-- CreateTable
CREATE TABLE "analytics_reports" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "report_type" "analyticsreporttype" NOT NULL,
    "url" VARCHAR(500),
    "property_id" VARCHAR(120),
    "device" VARCHAR(20),
    "start_date" TIMESTAMPTZ(6),
    "end_date" TIMESTAMPTZ(6),
    "summary" JSON,
    "payload" JSON,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "environment_id" INTEGER,

    CONSTRAINT "analytics_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" TEXT,
    "encrypted_value" VARCHAR,
    "description" VARCHAR(500),
    "is_sensitive" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" "auditaction" NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" VARCHAR(50),
    "details" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_schedules" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "frequency" "schedulefrequency" NOT NULL DEFAULT 'daily',
    "cron_expression" VARCHAR(100),
    "hour" INTEGER NOT NULL DEFAULT 2,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "backup_type" "backuptype" NOT NULL DEFAULT 'full',
    "storage_type" "backupstoragetype" NOT NULL DEFAULT 'google_drive',
    "retention_count" INTEGER NOT NULL DEFAULT 7,
    "retention_days" INTEGER,
    "status" "schedulestatus" NOT NULL DEFAULT 'active',
    "last_run_at" TIMESTAMPTZ(6),
    "next_run_at" TIMESTAMPTZ(6),
    "last_run_success" BOOLEAN,
    "last_run_error" TEXT,
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "celery_task_id" VARCHAR(255),
    "config" JSON,
    "project_id" INTEGER NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "environment_id" INTEGER,

    CONSTRAINT "backup_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backups" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "backup_type" "backuptype" NOT NULL,
    "storage_type" "backupstoragetype" NOT NULL,
    "storage_path" VARCHAR(500) NOT NULL,
    "size_bytes" BIGINT,
    "status" "backupstatus" NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "project_id" INTEGER NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_server_id" INTEGER,
    "notes" TEXT,
    "storage_file_id" VARCHAR(255),
    "logs" TEXT,
    "drive_folder_id" VARCHAR(255),

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_tags" (
    "client_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "client_tags_pkey" PRIMARY KEY ("client_id","tag_id")
);

-- CreateTable
CREATE TABLE "client_users" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "role" "clientrole" NOT NULL,

    CONSTRAINT "client_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "company" VARCHAR(255),
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "billing_email" VARCHAR(255),
    "address" TEXT,
    "notes" TEXT,
    "billing_status" "billingstatus" NOT NULL,
    "payment_terms" VARCHAR(50) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "tax_rate" DOUBLE PRECISION NOT NULL,
    "auto_billing" BOOLEAN NOT NULL,
    "contract_start" DATE,
    "contract_end" DATE,
    "invoice_prefix" VARCHAR(20) NOT NULL,
    "next_invoice_number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "billing_name" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "postal_code" VARCHAR(20),
    "country" VARCHAR(100) NOT NULL,
    "monthly_rate" DOUBLE PRECISION NOT NULL,
    "total_revenue" DOUBLE PRECISION NOT NULL,
    "outstanding_balance" DOUBLE PRECISION NOT NULL,
    "last_invoice_date" DATE,
    "last_payment_date" DATE,
    "tags" TEXT,
    "owner_id" INTEGER NOT NULL,
    "website" VARCHAR(255),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cyberpanel_users" (
    "id" SERIAL NOT NULL,
    "server_id" INTEGER NOT NULL,
    "created_by_id" INTEGER,
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "user_type" "cyberpanelusertype" NOT NULL DEFAULT 'user',
    "acl_name" VARCHAR(100),
    "password_encrypted" TEXT,
    "password_set_at" TIMESTAMPTZ(6),
    "password_last_changed_at" TIMESTAMPTZ(6),
    "password_out_of_sync" BOOLEAN NOT NULL DEFAULT false,
    "status" "cyberpaneluserstatus" NOT NULL DEFAULT 'active',
    "last_synced_at" TIMESTAMPTZ(6),
    "synced_from_panel" BOOLEAN NOT NULL DEFAULT false,
    "sync_error_message" TEXT,
    "websites_limit" INTEGER NOT NULL DEFAULT 0,
    "websites_count" INTEGER NOT NULL DEFAULT 0,
    "disk_limit" INTEGER NOT NULL DEFAULT 0,
    "disk_used" INTEGER NOT NULL DEFAULT 0,
    "bandwidth_limit" INTEGER NOT NULL DEFAULT 0,
    "bandwidth_used" INTEGER NOT NULL DEFAULT 0,
    "databases_limit" INTEGER NOT NULL DEFAULT 0,
    "databases_count" INTEGER NOT NULL DEFAULT 0,
    "email_accounts_limit" INTEGER NOT NULL DEFAULT 0,
    "email_accounts_count" INTEGER NOT NULL DEFAULT 0,
    "ftp_accounts_limit" INTEGER NOT NULL DEFAULT 0,
    "ftp_accounts_count" INTEGER NOT NULL DEFAULT 0,
    "package_name" VARCHAR(100),
    "notes" TEXT,
    "last_login_at" TIMESTAMPTZ(6),
    "last_login_ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cyberpanel_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" SERIAL NOT NULL,
    "domain_name" VARCHAR(255) NOT NULL,
    "tld" VARCHAR(50) NOT NULL,
    "registrar" "registrar" NOT NULL,
    "registrar_name" VARCHAR(100),
    "registrar_url" VARCHAR(500),
    "registration_date" DATE,
    "expiry_date" DATE NOT NULL,
    "last_renewed" DATE,
    "nameservers" TEXT,
    "dns_provider" VARCHAR(100),
    "dns_zone_id" VARCHAR(255),
    "status" "domainstatus" NOT NULL,
    "auto_renew" BOOLEAN NOT NULL,
    "privacy_protection" BOOLEAN NOT NULL,
    "transfer_lock" BOOLEAN NOT NULL,
    "annual_cost" DOUBLE PRECISION NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "whois_data" TEXT,
    "last_whois_check" TIMESTAMPTZ(6),
    "reminder_days" INTEGER NOT NULL,
    "last_reminder_sent" TIMESTAMPTZ(6),
    "notes" TEXT,
    "client_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "subscription_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heartbeats" (
    "id" SERIAL NOT NULL,
    "monitor_id" INTEGER NOT NULL,
    "status" "heartbeatstatus" NOT NULL,
    "response_time_ms" INTEGER,
    "status_code" INTEGER,
    "message" TEXT,
    "checked_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hosting_packages" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "disk_space_gb" INTEGER NOT NULL,
    "bandwidth_gb" INTEGER NOT NULL,
    "domains_limit" INTEGER NOT NULL,
    "subdomains_limit" INTEGER NOT NULL,
    "databases_limit" INTEGER NOT NULL,
    "email_accounts_limit" INTEGER NOT NULL,
    "ftp_accounts_limit" INTEGER NOT NULL,
    "php_workers" INTEGER NOT NULL,
    "ram_mb" INTEGER NOT NULL,
    "cpu_cores" DOUBLE PRECISION NOT NULL,
    "monthly_price" DOUBLE PRECISION NOT NULL,
    "quarterly_price" DOUBLE PRECISION NOT NULL,
    "yearly_price" DOUBLE PRECISION NOT NULL,
    "biennial_price" DOUBLE PRECISION NOT NULL,
    "setup_fee" DOUBLE PRECISION NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "features" TEXT,
    "is_active" BOOLEAN NOT NULL,
    "is_featured" BOOLEAN NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "hosting_yearly_price" DOUBLE PRECISION NOT NULL,
    "support_monthly_price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "hosting_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" SERIAL NOT NULL,
    "monitor_id" INTEGER NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "status" "incidentstatus" NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "duration_seconds" INTEGER,
    "root_cause" TEXT,
    "resolution" TEXT,
    "notification_sent" BOOLEAN NOT NULL,
    "recovery_notification_sent" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" SERIAL NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit_price" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "item_type" VARCHAR(50),
    "project_id" INTEGER,
    "invoice_id" INTEGER NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_number" VARCHAR(50) NOT NULL,
    "status" "invoicestatus" NOT NULL,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "paid_date" DATE,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax_rate" DOUBLE PRECISION NOT NULL,
    "tax_amount" DOUBLE PRECISION NOT NULL,
    "discount_amount" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "amount_paid" DOUBLE PRECISION NOT NULL,
    "payment_method" VARCHAR(50),
    "payment_reference" VARCHAR(255),
    "notes" TEXT,
    "terms" TEXT,
    "period_start" DATE,
    "period_end" DATE,
    "currency" VARCHAR(3) NOT NULL,
    "client_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitors" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "monitor_type" "monitortype" NOT NULL,
    "url" VARCHAR(500) NOT NULL,
    "interval_seconds" INTEGER NOT NULL,
    "timeout_seconds" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "last_check_at" TIMESTAMPTZ(6),
    "last_status" "monitorstatus",
    "last_response_time_ms" INTEGER,
    "uptime_percentage" DOUBLE PRECISION,
    "alert_on_down" BOOLEAN NOT NULL,
    "consecutive_failures" INTEGER NOT NULL,
    "project_id" INTEGER,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "port" INTEGER,
    "expected_keyword" VARCHAR(500),
    "dns_record_type" VARCHAR(10),
    "json_query_path" VARCHAR(500),
    "json_expected_value" VARCHAR(500),
    "last_error_message" TEXT,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "maintenance_start" TIMESTAMPTZ(6),
    "maintenance_end" TIMESTAMPTZ(6),
    "maintenance_reason" VARCHAR(500),
    "notification_channels" TEXT,
    "project_server_id" INTEGER,

    CONSTRAINT "monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channels" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "channel_type" "channeltype" NOT NULL,
    "config" TEXT,
    "is_active" BOOLEAN NOT NULL,
    "last_sent_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "owner_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "provider" "oauthprovider" NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "token_type" VARCHAR(50) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "scope" TEXT,
    "account_email" VARCHAR(255),
    "account_name" VARCHAR(255),
    "account_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_policies" (
    "id" SERIAL NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "is_default" BOOLEAN,
    "allowed_plugins" TEXT,
    "required_plugins" TEXT,
    "blocked_plugins" TEXT,
    "pinned_versions" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "plugin_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_plugin_policies" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "inherit_default" BOOLEAN,
    "allowed_plugins" TEXT,
    "required_plugins" TEXT,
    "blocked_plugins" TEXT,
    "pinned_versions" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "project_plugin_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_servers" (
    "id" SERIAL NOT NULL,
    "project_id" INTEGER NOT NULL,
    "server_id" INTEGER NOT NULL,
    "environment" "serverenvironment" NOT NULL,
    "wp_path" VARCHAR(500) NOT NULL,
    "wp_url" VARCHAR(500) NOT NULL,
    "notes" VARCHAR(1000),
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ssh_user" VARCHAR(100),
    "ssh_key_path" VARCHAR(500),
    "gdrive_backups_folder_id" VARCHAR(255),
    "database_name" VARCHAR(255),
    "database_user" VARCHAR(255),
    "database_password" VARCHAR(255),

    CONSTRAINT "project_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_tags" (
    "project_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "project_tags_pkey" PRIMARY KEY ("project_id","tag_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "path" VARCHAR(500) NOT NULL,
    "status" "projectstatus" NOT NULL,
    "environment" "environmenttype" NOT NULL,
    "wp_version" VARCHAR(20),
    "php_version" VARCHAR(20),
    "wp_home" VARCHAR(500),
    "last_deployed_at" TIMESTAMPTZ(6),
    "github_repo_url" VARCHAR(500),
    "github_branch" VARCHAR(100),
    "gdrive_folder_id" VARCHAR(255),
    "owner_id" INTEGER NOT NULL,
    "server_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "local_path" VARCHAR(500),
    "ddev_configured" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT,
    "client_id" INTEGER,
    "gdrive_assets_folder_id" VARCHAR(255),
    "gdrive_docs_folder_id" VARCHAR(255),
    "gdrive_backups_folder_id" VARCHAR(255),
    "gdrive_connected" BOOLEAN NOT NULL,
    "gdrive_last_sync" TIMESTAMPTZ(6),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" INTEGER NOT NULL,
    "permission_id" INTEGER NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "color" VARCHAR(7) NOT NULL DEFAULT '#6366f1',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_tags" (
    "server_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "server_tags_pkey" PRIMARY KEY ("server_id","tag_id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "hostname" VARCHAR(255) NOT NULL,
    "provider" "serverprovider" NOT NULL,
    "status" "serverstatus" NOT NULL,
    "ssh_user" VARCHAR(100) NOT NULL,
    "ssh_port" INTEGER NOT NULL,
    "ssh_key_path" VARCHAR(500),
    "panel_type" "paneltype" NOT NULL,
    "panel_url" VARCHAR(500),
    "last_health_check" TIMESTAMPTZ(6),
    "owner_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wp_root_paths" TEXT,
    "uploads_path" VARCHAR(500),
    "tags" TEXT,
    "panel_port" INTEGER NOT NULL,
    "panel_verified" BOOLEAN NOT NULL,
    "ssh_password" VARCHAR,
    "ssh_private_key" VARCHAR,
    "panel_username" VARCHAR,
    "panel_password" VARCHAR,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ssl_certificates" (
    "id" SERIAL NOT NULL,
    "common_name" VARCHAR(255) NOT NULL,
    "san_domains" TEXT,
    "provider" "sslprovider" NOT NULL,
    "certificate_type" "certificatetype" NOT NULL,
    "issue_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "auto_renew" BOOLEAN NOT NULL,
    "is_wildcard" BOOLEAN NOT NULL,
    "serial_number" VARCHAR(100),
    "issuer" VARCHAR(255),
    "fingerprint_sha256" VARCHAR(100),
    "annual_cost" DOUBLE PRECISION NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "last_renewal_attempt" TIMESTAMPTZ(6),
    "renewal_failure_count" INTEGER NOT NULL,
    "last_renewal_error" TEXT,
    "reminder_days" INTEGER NOT NULL,
    "last_reminder_sent" TIMESTAMPTZ(6),
    "notes" TEXT,
    "domain_id" INTEGER,
    "project_id" INTEGER,
    "subscription_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ssl_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "subscription_type" "subscriptiontype" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "external_id" VARCHAR(255),
    "provider" VARCHAR(100),
    "billing_cycle" "billingcycle" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "start_date" DATE NOT NULL,
    "next_billing_date" DATE NOT NULL,
    "end_date" DATE,
    "cancelled_at" TIMESTAMPTZ(6),
    "status" "subscriptionstatus" NOT NULL,
    "auto_renew" BOOLEAN NOT NULL,
    "reminder_days" INTEGER NOT NULL,
    "last_reminder_sent" TIMESTAMPTZ(6),
    "reminder_count" INTEGER NOT NULL,
    "last_invoice_id" INTEGER,
    "total_invoiced" DOUBLE PRECISION NOT NULL,
    "total_paid" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "client_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "color" VARCHAR(7) NOT NULL DEFAULT '#6366f1',
    "icon" VARCHAR(50),
    "description" VARCHAR(500),
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "sender_type" "sendertype" NOT NULL,
    "sender_id" INTEGER,
    "sender_name" VARCHAR(255),
    "message" TEXT NOT NULL,
    "attachments" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" SERIAL NOT NULL,
    "client_id" INTEGER NOT NULL,
    "project_id" INTEGER,
    "subject" VARCHAR(255) NOT NULL,
    "status" "ticketstatus" NOT NULL,
    "priority" "ticketpriority" NOT NULL,
    "last_reply_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "hashed_password" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL,
    "is_superuser" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avatar_url" VARCHAR(500),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wp_credentials" (
    "id" SERIAL NOT NULL,
    "project_server_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "label" VARCHAR(100) NOT NULL DEFAULT 'Admin',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username_encrypted" TEXT NOT NULL,
    "username_salt" VARCHAR(100) NOT NULL,
    "password_encrypted" TEXT NOT NULL,
    "password_salt" VARCHAR(100) NOT NULL,
    "status" "credentialstatus" NOT NULL,

    CONSTRAINT "wp_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wp_site_states" (
    "id" SERIAL NOT NULL,
    "project_server_id" INTEGER NOT NULL,
    "wp_version" VARCHAR(20),
    "wp_version_available" VARCHAR(20),
    "php_version" VARCHAR(20),
    "plugins" TEXT,
    "themes" TEXT,
    "plugins_count" INTEGER NOT NULL,
    "plugins_update_count" INTEGER NOT NULL,
    "themes_count" INTEGER NOT NULL,
    "themes_update_count" INTEGER NOT NULL,
    "users_count" INTEGER NOT NULL,
    "site_health_score" INTEGER,
    "last_scanned_at" TIMESTAMPTZ(6),
    "scan_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wp_site_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wp_updates" (
    "id" SERIAL NOT NULL,
    "project_server_id" INTEGER NOT NULL,
    "update_type" "updatetype" NOT NULL,
    "package_name" VARCHAR(255) NOT NULL,
    "from_version" VARCHAR(50) NOT NULL,
    "to_version" VARCHAR(50) NOT NULL,
    "status" "updatestatus" NOT NULL,
    "backup_id" INTEGER,
    "applied_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wp_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_analytics_reports_environment_id" ON "analytics_reports"("environment_id");

-- CreateIndex
CREATE INDEX "ix_analytics_reports_project_id" ON "analytics_reports"("project_id");

-- CreateIndex
CREATE INDEX "ix_analytics_reports_report_type" ON "analytics_reports"("report_type");

-- CreateIndex
CREATE UNIQUE INDEX "ix_app_settings_key" ON "app_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "backup_schedules_celery_task_id_key" ON "backup_schedules"("celery_task_id");

-- CreateIndex
CREATE INDEX "ix_backup_schedules_environment_id" ON "backup_schedules"("environment_id");

-- CreateIndex
CREATE INDEX "ix_backup_schedules_next_run_at" ON "backup_schedules"("next_run_at");

-- CreateIndex
CREATE INDEX "ix_backup_schedules_project_id" ON "backup_schedules"("project_id");

-- CreateIndex
CREATE INDEX "ix_backup_schedules_status" ON "backup_schedules"("status");

-- CreateIndex
CREATE INDEX "ix_client_tags_client_id" ON "client_tags"("client_id");

-- CreateIndex
CREATE INDEX "ix_client_tags_tag_id" ON "client_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "ix_client_users_email" ON "client_users"("email");

-- CreateIndex
CREATE INDEX "ix_clients_email" ON "clients"("email");

-- CreateIndex
CREATE INDEX "ix_cyberpanel_users_server_id" ON "cyberpanel_users"("server_id");

-- CreateIndex
CREATE INDEX "ix_cyberpanel_users_status" ON "cyberpanel_users"("status");

-- CreateIndex
CREATE INDEX "ix_cyberpanel_users_username" ON "cyberpanel_users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "uq_server_username" ON "cyberpanel_users"("server_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "ix_domains_domain_name" ON "domains"("domain_name");

-- CreateIndex
CREATE INDEX "ix_heartbeats_checked_at" ON "heartbeats"("checked_at");

-- CreateIndex
CREATE INDEX "ix_heartbeats_monitor_id" ON "heartbeats"("monitor_id");

-- CreateIndex
CREATE UNIQUE INDEX "hosting_packages_name_key" ON "hosting_packages"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ix_hosting_packages_slug" ON "hosting_packages"("slug");

-- CreateIndex
CREATE INDEX "ix_incidents_monitor_id" ON "incidents"("monitor_id");

-- CreateIndex
CREATE UNIQUE INDEX "ix_invoices_invoice_number" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "ix_monitors_project_server_id" ON "monitors"("project_server_id");

-- CreateIndex
CREATE UNIQUE INDEX "ix_oauth_tokens_user_provider" ON "oauth_tokens"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ix_permissions_code" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "ix_plugin_policies_owner_id" ON "plugin_policies"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_project_plugin_policy_project" ON "project_plugin_policies"("project_id");

-- CreateIndex
CREATE INDEX "ix_project_plugin_policies_project_id" ON "project_plugin_policies"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_project_server_env" ON "project_servers"("project_id", "server_id", "environment");

-- CreateIndex
CREATE INDEX "ix_project_tags_project_id" ON "project_tags"("project_id");

-- CreateIndex
CREATE INDEX "ix_project_tags_tag_id" ON "project_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "ix_projects_slug" ON "projects"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ix_roles_name" ON "roles"("name");

-- CreateIndex
CREATE INDEX "ix_server_tags_server_id" ON "server_tags"("server_id");

-- CreateIndex
CREATE INDEX "ix_server_tags_tag_id" ON "server_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "ix_tags_name" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ix_tags_slug" ON "tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ix_users_email" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ix_users_username" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "wp_site_states_project_server_id_key" ON "wp_site_states"("project_server_id");

-- AddForeignKey
ALTER TABLE "analytics_reports" ADD CONSTRAINT "analytics_reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "analytics_reports" ADD CONSTRAINT "fk_analytics_reports_environment_id" FOREIGN KEY ("environment_id") REFERENCES "project_servers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "project_servers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "backup_schedules" ADD CONSTRAINT "backup_schedules_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "fk_backups_project_server_id_project_servers" FOREIGN KEY ("project_server_id") REFERENCES "project_servers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cyberpanel_users" ADD CONSTRAINT "cyberpanel_users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cyberpanel_users" ADD CONSTRAINT "cyberpanel_users_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "heartbeats" ADD CONSTRAINT "heartbeats_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "fk_monitors_project_server_id" FOREIGN KEY ("project_server_id") REFERENCES "project_servers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "plugin_policies" ADD CONSTRAINT "plugin_policies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_plugin_policies" ADD CONSTRAINT "project_plugin_policies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_servers" ADD CONSTRAINT "project_servers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_servers" ADD CONSTRAINT "project_servers_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_tags" ADD CONSTRAINT "project_tags_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "project_tags" ADD CONSTRAINT "project_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "fk_projects_client_id" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "server_tags" ADD CONSTRAINT "server_tags_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "server_tags" ADD CONSTRAINT "server_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ssl_certificates" ADD CONSTRAINT "ssl_certificates_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_last_invoice_id_fkey" FOREIGN KEY ("last_invoice_id") REFERENCES "invoices"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wp_credentials" ADD CONSTRAINT "wp_credentials_project_server_id_fkey" FOREIGN KEY ("project_server_id") REFERENCES "project_servers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wp_credentials" ADD CONSTRAINT "wp_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wp_site_states" ADD CONSTRAINT "wp_site_states_project_server_id_fkey" FOREIGN KEY ("project_server_id") REFERENCES "project_servers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wp_updates" ADD CONSTRAINT "wp_updates_backup_id_fkey" FOREIGN KEY ("backup_id") REFERENCES "backups"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "wp_updates" ADD CONSTRAINT "wp_updates_project_server_id_fkey" FOREIGN KEY ("project_server_id") REFERENCES "project_servers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

