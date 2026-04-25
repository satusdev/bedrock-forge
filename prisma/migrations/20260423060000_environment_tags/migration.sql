-- Migration: add environment_tags pivot table
CREATE TABLE "environment_tags" (
  "environment_id" BIGINT NOT NULL,
  "tag_id"         BIGINT NOT NULL,
  CONSTRAINT "environment_tags_pkey" PRIMARY KEY ("environment_id", "tag_id"),
  CONSTRAINT "environment_tags_environment_id_fkey"
    FOREIGN KEY ("environment_id") REFERENCES "environments" ("id") ON DELETE CASCADE,
  CONSTRAINT "environment_tags_tag_id_fkey"
    FOREIGN KEY ("tag_id") REFERENCES "tags" ("id") ON DELETE CASCADE
);

CREATE INDEX "environment_tags_environment_id_idx" ON "environment_tags"("environment_id");
CREATE INDEX "environment_tags_tag_id_idx" ON "environment_tags"("tag_id");
