-- CreateEnum
CREATE TYPE "SecurityScanType" AS ENUM ('SSH_AUDIT', 'SERVER_HARDENING', 'MALWARE_SCAN', 'WP_AUDIT', 'PROJECT_MALWARE');

-- CreateEnum
CREATE TYPE "SecurityScanStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "security_scans" (
    "id" BIGSERIAL NOT NULL,
    "scan_type" "SecurityScanType" NOT NULL,
    "status" "SecurityScanStatus" NOT NULL DEFAULT 'pending',
    "server_id" BIGINT,
    "environment_id" BIGINT,
    "job_execution_id" BIGINT,
    "score" INTEGER,
    "summary" JSONB,
    "findings" JSONB,
    "error" TEXT,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "security_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_scans_server_id_idx" ON "security_scans"("server_id");

-- CreateIndex
CREATE INDEX "security_scans_environment_id_idx" ON "security_scans"("environment_id");

-- CreateIndex
CREATE INDEX "security_scans_scan_type_idx" ON "security_scans"("scan_type");

-- CreateIndex
CREATE INDEX "security_scans_status_idx" ON "security_scans"("status");

-- CreateIndex
CREATE INDEX "security_scans_created_at_idx" ON "security_scans"("created_at");

-- AddForeignKey
ALTER TABLE "security_scans" ADD CONSTRAINT "security_scans_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_scans" ADD CONSTRAINT "security_scans_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
