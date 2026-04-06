-- Add job_execution_id FK to backups so each Backup row is directly linked
-- to its controlling JobExecution. This allows the API to include job status,
-- progress, and last_error in a single query without a separate lookup.

ALTER TABLE "backups" ADD COLUMN "job_execution_id" BIGINT;

ALTER TABLE "backups"
  ADD CONSTRAINT "backups_job_execution_id_fkey"
  FOREIGN KEY ("job_execution_id")
  REFERENCES "job_executions"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "backups_job_execution_id_idx" ON "backups"("job_execution_id");
