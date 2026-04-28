-- CreateTable
CREATE TABLE "theme_scans" (
    "id" BIGSERIAL NOT NULL,
    "environment_id" BIGINT NOT NULL,
    "themes" JSONB NOT NULL,
    "scanned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theme_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "theme_scans_environment_id_idx" ON "theme_scans"("environment_id");

-- CreateIndex
CREATE INDEX "theme_scans_scanned_at_idx" ON "theme_scans"("scanned_at");

-- AddForeignKey
ALTER TABLE "theme_scans" ADD CONSTRAINT "theme_scans_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
