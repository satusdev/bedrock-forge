-- AlterTable: add optional retention policy fields to backup_schedules
ALTER TABLE "backup_schedules" ADD COLUMN "retention_count" INTEGER;
ALTER TABLE "backup_schedules" ADD COLUMN "retention_days" INTEGER;
