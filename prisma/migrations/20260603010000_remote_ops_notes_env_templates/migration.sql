-- Persistent operational notes and environment variable templates.

CREATE TABLE "resource_notes" (
  "id" BIGSERIAL PRIMARY KEY,
  "resource_type" TEXT NOT NULL,
  "resource_id" BIGINT NOT NULL,
  "body" TEXT NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "created_by_id" BIGINT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "resource_notes_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "resource_notes_resource_type_resource_id_idx"
  ON "resource_notes"("resource_type", "resource_id");
CREATE INDEX "resource_notes_created_by_id_idx"
  ON "resource_notes"("created_by_id");

CREATE TABLE "env_variable_templates" (
  "id" BIGSERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "environment_type" TEXT,
  "required_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "secret_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "defaults" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "env_variable_templates_name_environment_type_key"
  ON "env_variable_templates"("name", "environment_type");
