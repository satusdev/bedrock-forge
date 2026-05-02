-- Add session metadata to refresh_tokens for active session management
ALTER TABLE "refresh_tokens" ADD COLUMN "user_agent" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "ip_address" VARCHAR(45);
