-- CreateTable
CREATE TABLE "custom_plugins" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "repo_url" TEXT NOT NULL,
    "repo_path" TEXT NOT NULL DEFAULT '.',
    "type" TEXT NOT NULL DEFAULT 'plugin',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "custom_plugins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environment_custom_plugins" (
    "id" BIGSERIAL NOT NULL,
    "environment_id" BIGINT NOT NULL,
    "custom_plugin_id" BIGINT NOT NULL,
    "installed_version" TEXT,
    "latest_version" TEXT,
    "version_checked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environment_custom_plugins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_plugins_name_key" ON "custom_plugins"("name");

-- CreateIndex
CREATE UNIQUE INDEX "custom_plugins_slug_key" ON "custom_plugins"("slug");

-- CreateIndex
CREATE INDEX "environment_custom_plugins_environment_id_idx" ON "environment_custom_plugins"("environment_id");

-- CreateIndex
CREATE INDEX "environment_custom_plugins_custom_plugin_id_idx" ON "environment_custom_plugins"("custom_plugin_id");

-- CreateIndex
CREATE UNIQUE INDEX "environment_custom_plugins_environment_id_custom_plugin_id_key" ON "environment_custom_plugins"("environment_id", "custom_plugin_id");

-- AddForeignKey
ALTER TABLE "environment_custom_plugins" ADD CONSTRAINT "environment_custom_plugins_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environment_custom_plugins" ADD CONSTRAINT "environment_custom_plugins_custom_plugin_id_fkey" FOREIGN KEY ("custom_plugin_id") REFERENCES "custom_plugins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
