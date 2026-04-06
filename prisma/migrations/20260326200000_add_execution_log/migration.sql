-- Add execution_log JSONB column to job_executions
-- Stores a timestamped array of step entries for per-command traceability.
-- Nullable so existing rows remain valid without a default value.
ALTER TABLE "job_executions" ADD COLUMN "execution_log" JSONB;
