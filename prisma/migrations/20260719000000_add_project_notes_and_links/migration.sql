-- AddColumn: notes (Text, nullable) and links (JSONB, nullable) to projects table
-- These fields were added to schema.prisma but never had a migration generated.

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "links" JSONB;
