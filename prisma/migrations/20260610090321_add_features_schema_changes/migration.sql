/*
  Warnings:

  - The `status` column on the `system_backups` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterEnum
ALTER TYPE "BackupType" ADD VALUE 'incremental';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SecurityScanType" ADD VALUE 'BACKDOOR_SEARCH';
ALTER TYPE "SecurityScanType" ADD VALUE 'PLUGIN_AUDIT';

-- DropForeignKey
ALTER TABLE "cleanup_schedules" DROP CONSTRAINT "cleanup_schedules_environment_id_fkey";

-- DropForeignKey
ALTER TABLE "environment_tags" DROP CONSTRAINT "environment_tags_environment_id_fkey";

-- DropForeignKey
ALTER TABLE "environment_tags" DROP CONSTRAINT "environment_tags_tag_id_fkey";

-- DropForeignKey
ALTER TABLE "resource_notes" DROP CONSTRAINT "resource_notes_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "system_backups" DROP CONSTRAINT "system_backups_job_execution_id_fkey";

-- DropIndex
DROP INDEX "monitors_environment_id_idx";

-- AlterTable
ALTER TABLE "cleanup_schedules" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "env_variable_templates" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "environments" ADD COLUMN     "is_multisite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "multisite_url" TEXT;

-- AlterTable
ALTER TABLE "notification_channels" ADD COLUMN     "webhook_secret_enc" TEXT,
ADD COLUMN     "webhook_url_enc" TEXT,
ALTER COLUMN "events" DROP DEFAULT;

-- AlterTable
ALTER TABLE "plugin_update_schedules" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "resource_notes" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "server_security_alert_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "cost_monthly" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "system_backups" DROP COLUMN "status",
ADD COLUMN     "status" "BackupStatus" NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "maintenance_windows" (
    "id" BIGSERIAL NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" BIGINT NOT NULL,
    "server_id" BIGINT,
    "environment_id" BIGINT,
    "reason" TEXT,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" BIGINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_windows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_windows_resource_type_resource_id_idx" ON "maintenance_windows"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "maintenance_windows_starts_at_ends_at_idx" ON "maintenance_windows"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "domains_name_idx" ON "domains"("name");

-- CreateIndex
CREATE INDEX "system_backups_status_idx" ON "system_backups"("status");

-- AddForeignKey
ALTER TABLE "environment_tags" ADD CONSTRAINT "environment_tags_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_tags" ADD CONSTRAINT "environment_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cleanup_schedules" ADD CONSTRAINT "cleanup_schedules_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_notes" ADD CONSTRAINT "resource_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_backups" ADD CONSTRAINT "system_backups_job_execution_id_fkey" FOREIGN KEY ("job_execution_id") REFERENCES "job_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
