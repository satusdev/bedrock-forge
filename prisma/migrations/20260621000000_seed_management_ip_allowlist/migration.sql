INSERT INTO "app_settings" ("key", "value", "updated_at")
VALUES ('security_ip_allowlist', '["41.242.21.99/32"]', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
