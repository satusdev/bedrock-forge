-- Monitor enhancements: SSL checks, DNS resolution, keyword matching, unique env constraint

-- Extend MonitorLogEvent enum with new event types
ALTER TYPE "MonitorLogEvent" ADD VALUE IF NOT EXISTS 'ssl_expiry';
ALTER TYPE "MonitorLogEvent" ADD VALUE IF NOT EXISTS 'dns_failed';
ALTER TYPE "MonitorLogEvent" ADD VALUE IF NOT EXISTS 'keyword_missing';

-- Advanced check configuration on monitors
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "check_ssl"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "ssl_expires_at"     TIMESTAMPTZ;
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "ssl_issuer"         TEXT;
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "ssl_days_remaining" INTEGER;
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "ssl_alert_days"     INTEGER;
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "check_dns"          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "dns_resolves"       BOOLEAN;
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "check_keyword"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "keyword"            TEXT;
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "keyword_found"      BOOLEAN;

-- Enforce one monitor per environment (was application-level only)
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_environment_id_key" UNIQUE ("environment_id");

-- Extended result columns for per-check SSL / DNS / keyword outcome
ALTER TABLE "monitor_results" ADD COLUMN IF NOT EXISTS "ssl_days_remaining" INTEGER;
ALTER TABLE "monitor_results" ADD COLUMN IF NOT EXISTS "dns_resolves"        BOOLEAN;
ALTER TABLE "monitor_results" ADD COLUMN IF NOT EXISTS "keyword_found"       BOOLEAN;
