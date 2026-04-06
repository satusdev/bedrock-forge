-- CreateTable
CREATE TABLE "backup_schedules" (
    "id"             BIGSERIAL NOT NULL,
    "environment_id" BIGINT    NOT NULL,
    "type"           "BackupType" NOT NULL DEFAULT 'full',
    "frequency"      TEXT      NOT NULL,
    "hour"           INTEGER   NOT NULL DEFAULT 3,
    "minute"         INTEGER   NOT NULL DEFAULT 0,
    "day_of_week"    INTEGER,
    "day_of_month"   INTEGER,
    "enabled"        BOOLEAN   NOT NULL DEFAULT true,
    "last_run_at"    TIMESTAMPTZ,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMPTZ NOT NULL,

    CONSTRAINT "backup_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "backup_schedules_environment_id_key" ON "backup_schedules"("environment_id");

-- CreateIndex
CREATE INDEX "backup_schedules_enabled_idx" ON "backup_schedules"("enabled");

-- AddForeignKey
ALTER TABLE "backup_schedules"
    ADD CONSTRAINT "backup_schedules_environment_id_fkey"
    FOREIGN KEY ("environment_id")
    REFERENCES "environments"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
