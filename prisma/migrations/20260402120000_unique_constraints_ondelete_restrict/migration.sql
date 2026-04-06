-- Unique constraint: prevent duplicate environments on the same server path
ALTER TABLE "environments" ADD CONSTRAINT "environments_server_id_root_path_key" UNIQUE ("server_id", "root_path");

-- Unique constraint: prevent duplicate domain names within a project
ALTER TABLE "domains" ADD CONSTRAINT "domains_project_id_name_key" UNIQUE ("project_id", "name");

-- Add explicit RESTRICT on the projects.client_id FK to prevent silent client deletion
-- (PostgreSQL default is NO ACTION which is effectively deferred RESTRICT; this makes it immediate)
ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_client_id_fkey";
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
