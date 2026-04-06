-- Migration: env_type_string_backup_path
-- Changes:
--   1. Convert environments.type from EnvironmentType enum to plain TEXT
--      (allows free-text labels: production, staging, development, qa, etc.)
--   2. Add backup_path nullable TEXT column to environments
--      (configurable per-environment persistent storage path on remote server)

-- Step 1: Drop the enum default so we can change the column type
ALTER TABLE "environments" ALTER COLUMN "type" DROP DEFAULT;

-- Step 2: Cast the column from the EnvironmentType enum to TEXT
ALTER TABLE "environments" ALTER COLUMN "type" TYPE TEXT USING "type"::text;

-- Step 3: Restore a sensible text default
ALTER TABLE "environments" ALTER COLUMN "type" SET DEFAULT 'production';

-- Step 4: Drop the now-unused EnvironmentType enum
DROP TYPE IF EXISTS "EnvironmentType";

-- Step 5: Add backup_path column (nullable — environments may not have a configured backup path)
ALTER TABLE "environments" ADD COLUMN IF NOT EXISTS "backup_path" TEXT;
