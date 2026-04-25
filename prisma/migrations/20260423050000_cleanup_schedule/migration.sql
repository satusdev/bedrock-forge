-- Migration: add cleanup_schedules table
CREATE TABLE "cleanup_schedules" (
  "id"             BIGSERIAL PRIMARY KEY,
  "environment_id" BIGINT NOT NULL,
  "enabled"        BOOLEAN NOT NULL DEFAULT true,
  "frequency"      TEXT NOT NULL DEFAULT 'weekly',
  "hour"           INTEGER NOT NULL DEFAULT 3,
  "minute"         INTEGER NOT NULL DEFAULT 30,
  "day_of_week"    INTEGER,
  "day_of_month"   INTEGER,
  "keep_revisions" INTEGER NOT NULL DEFAULT 3,
  "last_run_at"    TIMESTAMPTZ,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "cleanup_schedules_environment_id_fkey"
    FOREIGN KEY ("environment_id") REFERENCES "environments" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "cleanup_schedules_environment_id_key" ON "cleanup_schedules"("environment_id");
CREATE INDEX "cleanup_schedules_enabled_idx" ON "cleanup_schedules"("enabled");
