-- Migration: add is_baseline field to environments
ALTER TABLE "environments" ADD COLUMN "is_baseline" BOOLEAN NOT NULL DEFAULT false;
