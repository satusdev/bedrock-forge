-- Step 1: Deduplicate domains with identical names — keep the lowest id per name.
-- This is required before making name UNIQUE; without it the constraint would fail
-- if multiple projects ever shared the same root domain.
DELETE FROM "domains" d1
USING "domains" d2
WHERE d1.name = d2.name
  AND d1.id > d2.id;

-- Step 2: Drop existing unique constraint on (project_id, name)
ALTER TABLE "domains" DROP CONSTRAINT IF EXISTS "domains_project_id_name_key";

-- Step 3: Drop foreign-key constraint on project_id
ALTER TABLE "domains" DROP CONSTRAINT IF EXISTS "domains_project_id_fkey";

-- Step 4: Drop index on project_id
DROP INDEX IF EXISTS "domains_project_id_idx";

-- Step 5: Drop the existing non-unique name index (will be replaced by UNIQUE)
DROP INDEX IF EXISTS "domains_name_idx";

-- Step 6: Remove project_id column
ALTER TABLE "domains" DROP COLUMN "project_id";

-- Step 7: Add UNIQUE constraint on name (domains are globally unique)
ALTER TABLE "domains" ADD CONSTRAINT "domains_name_key" UNIQUE ("name");

-- Step 8: Add SSL tracking columns
ALTER TABLE "domains" ADD COLUMN "ssl_json"        JSONB;
ALTER TABLE "domains" ADD COLUMN "ssl_expires_at"  TIMESTAMPTZ;
ALTER TABLE "domains" ADD COLUMN "ssl_issuer"      TEXT;
ALTER TABLE "domains" ADD COLUMN "ssl_checked_at"  TIMESTAMPTZ;
