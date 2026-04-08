-- Add cyberpanel_version column to servers
-- Stores the detected CyberPanel version string (e.g. "2.4 Build 4") read
-- from /usr/local/CyberCP/version.txt via SSH during test-connection.
-- NULL means not detected yet or no CyberPanel installed on the server.
ALTER TABLE "servers" ADD COLUMN "cyberpanel_version" TEXT;
