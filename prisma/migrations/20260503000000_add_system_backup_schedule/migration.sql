-- CreateTable
CREATE TABLE "system_backup_schedules" (
    "id" BIGSERIAL NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "hour" INTEGER NOT NULL DEFAULT 3,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "retention_count" INTEGER,
    "retention_days" INTEGER,
    "last_run_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "system_backup_schedules_pkey" PRIMARY KEY ("id")
);
