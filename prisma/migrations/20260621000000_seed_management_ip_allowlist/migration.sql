INSERT INTO "app_settings" ("key", "value", "updated_at")
-- Empty allowlist = feature disabled by default. Operators configure their
-- management IPs via the Settings → Security page after first login.
VALUES ('security_ip_allowlist', '[]', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
