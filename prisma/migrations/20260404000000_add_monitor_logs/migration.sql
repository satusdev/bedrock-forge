-- CreateEnum
CREATE TYPE "MonitorLogEvent" AS ENUM ('down', 'up', 'degraded');

-- CreateTable
CREATE TABLE "monitor_logs" (
    "id" BIGSERIAL NOT NULL,
    "monitor_id" BIGINT NOT NULL,
    "event_type" "MonitorLogEvent" NOT NULL,
    "status_code" INTEGER,
    "response_ms" INTEGER,
    "message" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitor_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monitor_logs_monitor_id_idx" ON "monitor_logs"("monitor_id");

-- CreateIndex
CREATE INDEX "monitor_logs_occurred_at_idx" ON "monitor_logs"("occurred_at");

-- AddForeignKey
ALTER TABLE "monitor_logs" ADD CONSTRAINT "monitor_logs_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
