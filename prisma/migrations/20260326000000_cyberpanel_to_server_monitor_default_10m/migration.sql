-- Migration: Move CyberPanel credentials from environments to servers
--            Change monitor default interval from 60s to 600s (10 minutes)
--            Drop unused cyberpanel_users table

-- Step 1: Add cyberpanel_login column to servers
ALTER TABLE "servers" ADD COLUMN "cyberpanel_login" JSONB;

-- Step 2: Migrate existing CyberPanel credentials from environments to their server
-- For each server, copy the first non-null cyberpanel_login found in its environments
UPDATE "servers" s
SET cyberpanel_login = (
    SELECT e.cyberpanel_login
    FROM "environments" e
    WHERE e.server_id = s.id
      AND e.cyberpanel_login IS NOT NULL
    ORDER BY e.created_at ASC
    LIMIT 1
);

-- Step 3: Drop the cyberpanel_login column from environments
ALTER TABLE "environments" DROP COLUMN IF EXISTS "cyberpanel_login";

-- Step 4: Drop the cyberpanel_users table (application code never used it)
DROP TABLE IF EXISTS "cyberpanel_users";

-- Step 5: Change the default interval for monitors from 60s to 600s
ALTER TABLE "monitors" ALTER COLUMN "interval_seconds" SET DEFAULT 600;
