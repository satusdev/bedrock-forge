-- Add missing database indexes identified in the system audit.
-- Each index targets a field that is queried/filtered in hot paths.

-- MonitorResult: look up results by monitor_id (e.g. paginated result history per monitor)
CREATE INDEX IF NOT EXISTS "monitor_results_monitor_id_idx" ON "monitor_results"("monitor_id");

-- Domain: expiry-check queries and alerting scans filter/sort by expires_at and ssl_expires_at
CREATE INDEX IF NOT EXISTS "domains_expires_at_idx" ON "domains"("expires_at");
CREATE INDEX IF NOT EXISTS "domains_ssl_expires_at_idx" ON "domains"("ssl_expires_at");

-- JobExecution: worker callbacks look up executions by BullMQ job ID on every job lifecycle event
CREATE INDEX IF NOT EXISTS "job_executions_bull_job_id_idx" ON "job_executions"("bull_job_id");

-- RefreshToken: valid-token queries filter WHERE revoked_at IS NULL on every authenticated request
CREATE INDEX IF NOT EXISTS "refresh_tokens_revoked_at_idx" ON "refresh_tokens"("revoked_at");
