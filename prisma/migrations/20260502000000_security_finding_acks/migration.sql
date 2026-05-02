-- CreateTable: security_finding_acks
-- Keyed by (scope_key, category, title) so acks carry over across rescans.

CREATE TABLE "security_finding_acks" (
    "id"               BIGSERIAL       NOT NULL,
    "scope_key"        VARCHAR(64)     NOT NULL,
    "category"         VARCHAR(64)     NOT NULL,
    "title"            VARCHAR(256)    NOT NULL,
    "server_id"        BIGINT,
    "environment_id"   BIGINT,
    "acknowledged_by"  BIGINT          NOT NULL,
    "note"             TEXT,
    "created_at"       TIMESTAMPTZ(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_finding_acks_pkey" PRIMARY KEY ("id")
);

-- UniqueIndex: one ack per finding per target
CREATE UNIQUE INDEX "security_finding_acks_scope_key_category_title_key"
    ON "security_finding_acks"("scope_key", "category", "title");

-- Index for scope-key lookups
CREATE INDEX "security_finding_acks_scope_key_idx"
    ON "security_finding_acks"("scope_key");

-- ForeignKeys
ALTER TABLE "security_finding_acks"
    ADD CONSTRAINT "security_finding_acks_acknowledged_by_fkey"
    FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_finding_acks"
    ADD CONSTRAINT "security_finding_acks_server_id_fkey"
    FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_finding_acks"
    ADD CONSTRAINT "security_finding_acks_environment_id_fkey"
    FOREIGN KEY ("environment_id") REFERENCES "environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
