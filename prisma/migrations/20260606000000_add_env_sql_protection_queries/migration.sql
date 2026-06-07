-- AlterTable
ALTER TABLE "environments" ADD COLUMN "sql_protection_queries" TEXT[] NOT NULL DEFAULT '{}';
