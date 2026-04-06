-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');

-- CreateTable: notification_channels
CREATE TABLE "notification_channels" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'slack',
    "slack_bot_token_enc" TEXT,
    "slack_channel_id" TEXT,
    "events" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable: notification_logs
CREATE TABLE "notification_logs" (
    "id" BIGSERIAL NOT NULL,
    "channel_id" BIGINT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: invoices
CREATE TABLE "invoices" (
    "id" BIGSERIAL NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "project_id" BIGINT NOT NULL,
    "client_id" BIGINT NOT NULL,
    "hosting_package_id" BIGINT,
    "support_package_id" BIGINT,
    "hosting_package_snapshot" TEXT,
    "support_package_snapshot" TEXT,
    "hosting_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "support_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "period_start" TIMESTAMPTZ NOT NULL,
    "period_end" TIMESTAMPTZ NOT NULL,
    "due_date" TIMESTAMPTZ NOT NULL,
    "paid_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

CREATE INDEX "invoices_project_id_idx" ON "invoices"("project_id");
CREATE INDEX "invoices_client_id_idx" ON "invoices"("client_id");
CREATE INDEX "invoices_status_idx" ON "invoices"("status");
CREATE INDEX "invoices_period_start_period_end_idx" ON "invoices"("period_start", "period_end");

CREATE INDEX "notification_logs_channel_id_idx" ON "notification_logs"("channel_id");
CREATE INDEX "notification_logs_event_type_idx" ON "notification_logs"("event_type");
CREATE INDEX "notification_logs_status_idx" ON "notification_logs"("status");
CREATE INDEX "notification_logs_created_at_idx" ON "notification_logs"("created_at");

-- AddForeignKeys
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_channel_id_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "notification_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_hosting_package_id_fkey"
    FOREIGN KEY ("hosting_package_id") REFERENCES "hosting_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_support_package_id_fkey"
    FOREIGN KEY ("support_package_id") REFERENCES "support_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
