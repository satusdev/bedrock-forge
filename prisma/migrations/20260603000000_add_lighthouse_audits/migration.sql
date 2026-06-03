CREATE TYPE "LighthouseAuditStatus" AS ENUM ('queued', 'running', 'completed', 'failed');
CREATE TYPE "LighthouseStrategy" AS ENUM ('mobile', 'desktop');

CREATE TABLE "lighthouse_audits" (
    "id" BIGSERIAL NOT NULL,
    "environment_id" BIGINT NOT NULL,
    "monitor_id" BIGINT,
    "job_execution_id" BIGINT,
    "url" TEXT NOT NULL,
    "strategy" "LighthouseStrategy" NOT NULL DEFAULT 'mobile',
    "status" "LighthouseAuditStatus" NOT NULL DEFAULT 'queued',
    "performance_score" INTEGER,
    "accessibility_score" INTEGER,
    "best_practices_score" INTEGER,
    "seo_score" INTEGER,
    "fcp_ms" INTEGER,
    "lcp_ms" INTEGER,
    "cls" DECIMAL(8,4),
    "tbt_ms" INTEGER,
    "speed_index_ms" INTEGER,
    "opportunities" JSONB,
    "summary" JSONB,
    "raw_result" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lighthouse_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lighthouse_audits_environment_id_idx" ON "lighthouse_audits"("environment_id");
CREATE INDEX "lighthouse_audits_monitor_id_idx" ON "lighthouse_audits"("monitor_id");
CREATE INDEX "lighthouse_audits_job_execution_id_idx" ON "lighthouse_audits"("job_execution_id");
CREATE INDEX "lighthouse_audits_status_idx" ON "lighthouse_audits"("status");
CREATE INDEX "lighthouse_audits_created_at_idx" ON "lighthouse_audits"("created_at");

ALTER TABLE "lighthouse_audits" ADD CONSTRAINT "lighthouse_audits_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lighthouse_audits" ADD CONSTRAINT "lighthouse_audits_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lighthouse_audits" ADD CONSTRAINT "lighthouse_audits_job_execution_id_fkey" FOREIGN KEY ("job_execution_id") REFERENCES "job_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
