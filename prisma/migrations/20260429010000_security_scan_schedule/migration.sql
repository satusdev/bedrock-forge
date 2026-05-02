-- Create SecuritySeverity enum for use in security scan schedule notify threshold
CREATE TYPE "SecuritySeverity" AS ENUM ('critical', 'high', 'medium', 'low', 'info');

-- CreateTable: security_scan_schedules
-- Stores automated scan schedules for servers (server_id set) and environments (environment_id set).
-- Unique constraints ensure one schedule per server and one per environment.
CREATE TABLE "security_scan_schedules" (
    "id" BIGSERIAL NOT NULL,
    "server_id" BIGINT,
    "environment_id" BIGINT,
    "scan_types" TEXT[] NOT NULL,
    "frequency" TEXT NOT NULL,
    "hour" INTEGER NOT NULL DEFAULT 2,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMPTZ,
    "notify_enabled" BOOLEAN NOT NULL DEFAULT false,
    "notify_threshold" "SecuritySeverity" NOT NULL DEFAULT 'critical',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "security_scan_schedules_pkey" PRIMARY KEY ("id")
);

-- Unique: one schedule per server, one per environment
CREATE UNIQUE INDEX "security_scan_schedules_server_id_key" ON "security_scan_schedules"("server_id") WHERE "server_id" IS NOT NULL;
CREATE UNIQUE INDEX "security_scan_schedules_environment_id_key" ON "security_scan_schedules"("environment_id") WHERE "environment_id" IS NOT NULL;

-- Index: query all enabled schedules for the cron runner
CREATE INDEX "security_scan_schedules_enabled_idx" ON "security_scan_schedules"("enabled");

-- AddForeignKey
ALTER TABLE "security_scan_schedules" ADD CONSTRAINT "security_scan_schedules_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_scan_schedules" ADD CONSTRAINT "security_scan_schedules_environment_id_fkey"
    FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
