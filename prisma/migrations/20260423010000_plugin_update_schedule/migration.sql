-- Plugin auto-update schedules (Bedrock / Composer-managed environments only)

CREATE TABLE "plugin_update_schedules" (
    "id"             BIGSERIAL     NOT NULL,
    "environment_id" BIGINT        NOT NULL,
    "enabled"        BOOLEAN       NOT NULL DEFAULT true,
    "frequency"      TEXT          NOT NULL DEFAULT 'weekly',
    "hour"           INTEGER       NOT NULL DEFAULT 2,
    "minute"         INTEGER       NOT NULL DEFAULT 0,
    "day_of_week"    INTEGER,
    "day_of_month"   INTEGER,
    "last_run_at"    TIMESTAMPTZ,
    "created_at"     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_update_schedules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plugin_update_schedules_environment_id_key"
    ON "plugin_update_schedules"("environment_id");

CREATE INDEX "plugin_update_schedules_enabled_idx"
    ON "plugin_update_schedules"("enabled");

ALTER TABLE "plugin_update_schedules"
    ADD CONSTRAINT "plugin_update_schedules_environment_id_fkey"
    FOREIGN KEY ("environment_id") REFERENCES "environments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
