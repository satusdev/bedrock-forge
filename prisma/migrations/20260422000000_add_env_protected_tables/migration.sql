-- Add protected_tables column to environments
-- Stores WP table names that must not be overwritten during DB push/clone.
-- The target keeps these tables intact; all others are replaced by the dump import.
ALTER TABLE "environments" ADD COLUMN "protected_tables" TEXT[] NOT NULL DEFAULT '{}';
