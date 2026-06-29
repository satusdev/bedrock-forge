-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "host_key_fingerprint" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_totp_step" BIGINT;
