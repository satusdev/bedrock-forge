-- CreateTable: system_backups
-- Forge self-backup: pg_dump of the Forge PostgreSQL DB uploaded to Google Drive

CREATE TABLE "system_backups" (
    "id"               BIGSERIAL PRIMARY KEY,
    "job_execution_id" BIGINT,
    "status"           TEXT NOT NULL DEFAULT 'pending',
    "file_path"        TEXT,
    "size_bytes"       BIGINT,
    "error_message"    TEXT,
    "started_at"       TIMESTAMPTZ,
    "completed_at"     TIMESTAMPTZ,
    "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "system_backups_job_execution_id_fkey"
        FOREIGN KEY ("job_execution_id")
        REFERENCES "job_executions"("id")
        ON DELETE SET NULL
);

CREATE INDEX "system_backups_status_idx"     ON "system_backups"("status");
CREATE INDEX "system_backups_created_at_idx" ON "system_backups"("created_at");
