CREATE TABLE "server_security_alert_settings" (
    "id" BIGSERIAL NOT NULL,
    "server_id" BIGINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "ssh_login_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "file_change_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "interval_minutes" INTEGER NOT NULL DEFAULT 5,
    "file_watch_paths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "last_checked_at" TIMESTAMPTZ,
    "last_auth_cursor" TEXT,
    "file_snapshot" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_security_alert_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "server_security_alert_settings_server_id_key"
    ON "server_security_alert_settings"("server_id");

CREATE INDEX "server_security_alert_settings_enabled_idx"
    ON "server_security_alert_settings"("enabled");

ALTER TABLE "server_security_alert_settings"
    ADD CONSTRAINT "server_security_alert_settings_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
