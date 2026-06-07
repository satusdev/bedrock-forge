-- AlterTable
ALTER TABLE "environments" ADD COLUMN "protected_post_types" TEXT[] NOT NULL DEFAULT '{}';
