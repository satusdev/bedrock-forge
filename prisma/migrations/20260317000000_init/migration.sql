-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('online', 'offline', 'unknown');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "EnvironmentType" AS ENUM ('production', 'staging');

-- CreateEnum
CREATE TYPE "BackupType" AS ENUM ('full', 'db_only', 'files_only');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "JobExecutionStatus" AS ENUM ('queued', 'active', 'completed', 'failed', 'dead_letter');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" BIGINT NOT NULL,
    "role_id" BIGINT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_tags" (
    "client_id" BIGINT NOT NULL,
    "tag_id" BIGINT NOT NULL,

    CONSTRAINT "client_tags_pkey" PRIMARY KEY ("client_id","tag_id")
);

-- CreateTable
CREATE TABLE "hosting_packages" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_monthly" DECIMAL(10,2) NOT NULL,
    "storage_gb" INTEGER NOT NULL,
    "bandwidth_gb" INTEGER NOT NULL,
    "max_sites" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "hosting_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_packages" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_monthly" DECIMAL(10,2) NOT NULL,
    "response_hours" INTEGER NOT NULL,
    "includes_updates" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "support_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "ssh_port" INTEGER NOT NULL DEFAULT 22,
    "ssh_user" TEXT NOT NULL DEFAULT 'root',
    "ssh_private_key_encrypted" TEXT NOT NULL,
    "provider" TEXT,
    "status" "ServerStatus" NOT NULL DEFAULT 'unknown',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" BIGINT NOT NULL,
    "hosting_package_id" BIGINT,
    "support_package_id" BIGINT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environments" (
    "id" BIGSERIAL NOT NULL,
    "project_id" BIGINT NOT NULL,
    "server_id" BIGINT NOT NULL,
    "type" "EnvironmentType" NOT NULL DEFAULT 'production',
    "url" TEXT NOT NULL,
    "root_path" TEXT NOT NULL,
    "cyberpanel_login" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cyberpanel_users" (
    "id" BIGSERIAL NOT NULL,
    "environment_id" BIGINT NOT NULL,
    "username" TEXT NOT NULL,
    "password_encrypted" TEXT NOT NULL,
    "panel_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cyberpanel_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backups" (
    "id" BIGSERIAL NOT NULL,
    "environment_id" BIGINT NOT NULL,
    "type" "BackupType" NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'pending',
    "file_path" TEXT,
    "size_bytes" BIGINT,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_scans" (
    "id" BIGSERIAL NOT NULL,
    "environment_id" BIGINT NOT NULL,
    "plugins" JSONB NOT NULL,
    "scanned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" BIGSERIAL NOT NULL,
    "project_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "whois_json" JSONB,
    "expires_at" TIMESTAMPTZ,
    "last_checked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitors" (
    "id" BIGSERIAL NOT NULL,
    "environment_id" BIGINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "uptime_pct" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "last_response_ms" INTEGER,
    "last_status" INTEGER,
    "last_checked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitor_results" (
    "id" BIGSERIAL NOT NULL,
    "monitor_id" BIGINT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_ms" INTEGER NOT NULL,
    "is_up" BOOLEAN NOT NULL,
    "checked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitor_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wp_db_credentials" (
    "id" BIGSERIAL NOT NULL,
    "environment_id" BIGINT NOT NULL,
    "db_name_encrypted" TEXT NOT NULL,
    "db_user_encrypted" TEXT NOT NULL,
    "db_password_encrypted" TEXT NOT NULL,
    "db_host_encrypted" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wp_db_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_scripts" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_executions" (
    "id" BIGSERIAL NOT NULL,
    "queue_name" TEXT NOT NULL,
    "bull_job_id" TEXT NOT NULL,
    "environment_id" BIGINT,
    "server_id" BIGINT,
    "status" "JobExecutionStatus" NOT NULL DEFAULT 'queued',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "payload" JSONB,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" BIGINT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "client_tags_client_id_idx" ON "client_tags"("client_id");

-- CreateIndex
CREATE INDEX "client_tags_tag_id_idx" ON "client_tags"("tag_id");

-- CreateIndex
CREATE INDEX "projects_client_id_idx" ON "projects"("client_id");

-- CreateIndex
CREATE INDEX "projects_hosting_package_id_idx" ON "projects"("hosting_package_id");

-- CreateIndex
CREATE INDEX "projects_support_package_id_idx" ON "projects"("support_package_id");

-- CreateIndex
CREATE INDEX "environments_project_id_idx" ON "environments"("project_id");

-- CreateIndex
CREATE INDEX "environments_server_id_idx" ON "environments"("server_id");

-- CreateIndex
CREATE INDEX "cyberpanel_users_environment_id_idx" ON "cyberpanel_users"("environment_id");

-- CreateIndex
CREATE INDEX "backups_environment_id_idx" ON "backups"("environment_id");

-- CreateIndex
CREATE INDEX "backups_status_idx" ON "backups"("status");

-- CreateIndex
CREATE INDEX "plugin_scans_environment_id_idx" ON "plugin_scans"("environment_id");

-- CreateIndex
CREATE INDEX "plugin_scans_scanned_at_idx" ON "plugin_scans"("scanned_at");

-- CreateIndex
CREATE INDEX "domains_project_id_idx" ON "domains"("project_id");

-- CreateIndex
CREATE INDEX "domains_name_idx" ON "domains"("name");

-- CreateIndex
CREATE INDEX "monitors_environment_id_idx" ON "monitors"("environment_id");

-- CreateIndex
CREATE INDEX "monitor_results_monitor_id_idx" ON "monitor_results"("monitor_id");

-- CreateIndex
CREATE INDEX "monitor_results_checked_at_idx" ON "monitor_results"("checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "wp_db_credentials_environment_id_key" ON "wp_db_credentials"("environment_id");

-- CreateIndex
CREATE UNIQUE INDEX "execution_scripts_name_key" ON "execution_scripts"("name");

-- CreateIndex
CREATE INDEX "job_executions_environment_id_idx" ON "job_executions"("environment_id");

-- CreateIndex
CREATE INDEX "job_executions_server_id_idx" ON "job_executions"("server_id");

-- CreateIndex
CREATE INDEX "job_executions_status_idx" ON "job_executions"("status");

-- CreateIndex
CREATE INDEX "job_executions_created_at_idx" ON "job_executions"("created_at");

-- CreateIndex
CREATE INDEX "job_executions_queue_name_status_idx" ON "job_executions"("queue_name", "status");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_hosting_package_id_fkey" FOREIGN KEY ("hosting_package_id") REFERENCES "hosting_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_support_package_id_fkey" FOREIGN KEY ("support_package_id") REFERENCES "support_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environments" ADD CONSTRAINT "environments_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cyberpanel_users" ADD CONSTRAINT "cyberpanel_users_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backups" ADD CONSTRAINT "backups_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plugin_scans" ADD CONSTRAINT "plugin_scans_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_results" ADD CONSTRAINT "monitor_results_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wp_db_credentials" ADD CONSTRAINT "wp_db_credentials_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_executions" ADD CONSTRAINT "job_executions_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
