-- Add account lockout fields to users table.
-- login_failures: counter incremented on each failed login attempt, reset on success.
-- locked_until: when set (non-null), the account rejects login attempts until this timestamp.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "login_failures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMPTZ;
