#!/usr/bin/env node
/**
 * Bedrock Forge — Master Encryption Key Rotation Utility
 *
 * Decrypts all sensitive credentials at rest using the old key and re-encrypts
 * them using the new key. Performs a safe dry-run decryption first to verify
 * that the old key is correct and all encrypted data is readable.
 *
 * Usage:
 *   node tools/rotate-key.js --old-key=<64-hex> --new-key=<64-hex>
 */

const { createCipheriv, createDecipheriv, randomBytes } = require("crypto");
const { PrismaClient } = require("@prisma/client");
const path = require("path");

// Load .env file
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const SENSITIVE_SETTING_KEYS = new Set([
  "global_ssh_private_key",
  "rclone_gdrive_config",
  "GITHUB_API_TOKEN",
  "cloudflare_api_token",
]);

function encrypt(plaintext, keyBuf) {
  if (!plaintext) return plaintext;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyBuf, iv, {
    authTagLength: TAG_LENGTH,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, encrypted, tag]);
  return combined.toString("base64");
}

function decrypt(ciphertext, keyBuf) {
  if (!ciphertext) return ciphertext;
  const combined = Buffer.from(ciphertext, "base64");
  if (combined.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid ciphertext: too short");
  }
  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(combined.length - TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, keyBuf, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf-8");
}

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((val) => {
    if (val.startsWith("--")) {
      const [k, v] = val.split("=");
      args[k.slice(2)] = v;
    }
  });
  return args;
}

async function main() {
  const args = parseArgs();
  const oldKeyHex = args["old-key"] || process.env.OLD_ENCRYPTION_KEY;
  const newKeyHex = args["new-key"] || process.env.NEW_ENCRYPTION_KEY;

  if (!oldKeyHex || !newKeyHex) {
    console.error("Error: Both --old-key and --new-key must be specified (or provided via env vars).");
    console.error("Usage: node tools/rotate-key.js --old-key=<64-hex> --new-key=<64-hex>");
    process.exit(1);
  }

  if (!/^[a-f0-9]{64}$/i.test(oldKeyHex) || !/^[a-f0-9]{64}$/i.test(newKeyHex)) {
    console.error("Error: Keys must be exactly 64 hex characters (32 bytes).");
    process.exit(1);
  }

  if (oldKeyHex === newKeyHex) {
    console.error("Error: Old key and new key are identical. Rotation is a no-op.");
    process.exit(1);
  }

  const oldKey = Buffer.from(oldKeyHex, "hex");
  const newKey = Buffer.from(newKeyHex, "hex");

  console.log("Connecting to database...");
  const prisma = new PrismaClient();

  try {
    // ─── 1. Retrieve all sensitive resources ─────────────────────────────────
    const users = await prisma.user.findMany({
      where: { totp_secret_encrypted: { not: null } },
      select: { id: true, email: true, totp_secret_encrypted: true },
    });

    const servers = await prisma.server.findMany({
      select: { id: true, name: true, ssh_private_key_encrypted: true, cyberpanel_login: true },
    });

    const dbCredsList = await prisma.wpDbCredentials.findMany({
      select: {
        id: true,
        environment_id: true,
        db_name_encrypted: true,
        db_user_encrypted: true,
        db_password_encrypted: true,
        db_host_encrypted: true,
      },
    });

    const channels = await prisma.notificationChannel.findMany({
      select: {
        id: true,
        name: true,
        slack_bot_token_enc: true,
        google_chat_webhook_url_enc: true,
        webhook_url_enc: true,
        webhook_secret_enc: true,
      },
    });

    const appSettings = await prisma.appSetting.findMany({
      where: { key: { in: Array.from(SENSITIVE_SETTING_KEYS) } },
    });

    console.log(`\nFound resources to audit/rotate:`);
    console.log(`- Users with TOTP: ${users.length}`);
    console.log(`- Servers: ${servers.length}`);
    console.log(`- WordPress Database Credentials: ${dbCredsList.length}`);
    console.log(`- Notification Channels: ${channels.length}`);
    console.log(`- Sensitive App Settings: ${appSettings.length}`);

    // ─── 2. DRY RUN: Decrypt everything with the old key ─────────────────────
    console.log("\n[1/3] Starting dry run decryption check...");

    const decryptedUsers = [];
    for (const u of users) {
      try {
        const plaintext = decrypt(u.totp_secret_encrypted, oldKey);
        decryptedUsers.push({ id: u.id, plaintext });
      } catch (err) {
        throw new Error(`Failed to decrypt TOTP secret for User ${u.email} (ID: ${u.id}): ${err.message}`);
      }
    }

    const decryptedServers = [];
    for (const s of servers) {
      try {
        const sshKey = decrypt(s.ssh_private_key_encrypted, oldKey);
        let cpLogin = null;
        if (s.cyberpanel_login) {
          cpLogin = decrypt(s.cyberpanel_login, oldKey);
        }
        decryptedServers.push({ id: s.id, sshKey, cpLogin });
      } catch (err) {
        throw new Error(`Failed to decrypt credentials for Server "${s.name}" (ID: ${s.id}): ${err.message}`);
      }
    }

    const decryptedDbCreds = [];
    for (const d of dbCredsList) {
      try {
        decryptedDbCreds.push({
          id: d.id,
          dbName: decrypt(d.db_name_encrypted, oldKey),
          dbUser: decrypt(d.db_user_encrypted, oldKey),
          dbPassword: decrypt(d.db_password_encrypted, oldKey),
          dbHost: decrypt(d.db_host_encrypted, oldKey),
        });
      } catch (err) {
        throw new Error(`Failed to decrypt DB credentials for Entry ID ${d.id} (Env ID: ${d.environment_id}): ${err.message}`);
      }
    }

    const decryptedChannels = [];
    for (const c of channels) {
      try {
        decryptedChannels.push({
          id: c.id,
          slackBotToken: c.slack_bot_token_enc ? decrypt(c.slack_bot_token_enc, oldKey) : null,
          googleChatWebhookUrl: c.google_chat_webhook_url_enc ? decrypt(c.google_chat_webhook_url_enc, oldKey) : null,
          webhookUrl: c.webhook_url_enc ? decrypt(c.webhook_url_enc, oldKey) : null,
          webhookSecret: c.webhook_secret_enc ? decrypt(c.webhook_secret_enc, oldKey) : null,
        });
      } catch (err) {
        throw new Error(`Failed to decrypt credentials for Notification Channel "${c.name}" (ID: ${c.id}): ${err.message}`);
      }
    }

    const decryptedSettings = [];
    for (const s of appSettings) {
      try {
        const plaintext = decrypt(s.value, oldKey);
        decryptedSettings.push({ id: s.id, key: s.key, plaintext });
      } catch (err) {
        throw new Error(`Failed to decrypt AppSetting key "${s.key}": ${err.message}`);
      }
    }

    console.log("✓ Dry run decryption verification succeeded! No data corruption or invalid keys found.");

    // ─── 3. ENCRYPTION: Encrypt everything with the new key ──────────────────
    console.log("\n[2/3] Preparing new encrypted payloads...");

    const rotatedUsers = decryptedUsers.map((u) => ({
      id: u.id,
      encrypted: encrypt(u.plaintext, newKey),
    }));

    const rotatedServers = decryptedServers.map((s) => ({
      id: s.id,
      sshKey: encrypt(s.sshKey, newKey),
      cpLogin: s.cpLogin ? encrypt(s.cpLogin, newKey) : null,
    }));

    const rotatedDbCreds = decryptedDbCreds.map((d) => ({
      id: d.id,
      dbName: encrypt(d.dbName, newKey),
      dbUser: encrypt(d.dbUser, newKey),
      dbPassword: encrypt(d.dbPassword, newKey),
      dbHost: encrypt(d.dbHost, newKey),
    }));

    const rotatedChannels = decryptedChannels.map((c) => ({
      id: c.id,
      slackBotToken: c.slackBotToken ? encrypt(c.slackBotToken, newKey) : null,
      googleChatWebhookUrl: c.googleChatWebhookUrl ? encrypt(c.googleChatWebhookUrl, newKey) : null,
      webhookUrl: c.webhookUrl ? encrypt(c.webhookUrl, newKey) : null,
      webhookSecret: c.webhookSecret ? encrypt(c.webhookSecret, newKey) : null,
    }));

    const rotatedSettings = decryptedSettings.map((s) => ({
      id: s.id,
      encrypted: encrypt(s.plaintext, newKey),
    }));

    // ─── 4. WRITE: Commit updates in a transaction ──────────────────────────
    console.log("\n[3/3] Committing changes to the database...");

    await prisma.$transaction(async (tx) => {
      for (const ru of rotatedUsers) {
        await tx.user.update({
          where: { id: ru.id },
          data: { totp_secret_encrypted: ru.encrypted },
        });
      }

      for (const rs of rotatedServers) {
        await tx.server.update({
          where: { id: rs.id },
          data: {
            ssh_private_key_encrypted: rs.sshKey,
            cyberpanel_login: rs.cpLogin,
          },
        });
      }

      for (const rd of rotatedDbCreds) {
        await tx.wpDbCredentials.update({
          where: { id: rd.id },
          data: {
            db_name_encrypted: rd.dbName,
            db_user_encrypted: rd.dbUser,
            db_password_encrypted: rd.dbPassword,
            db_host_encrypted: rd.dbHost,
          },
        });
      }

      for (const rc of rotatedChannels) {
        await tx.notificationChannel.update({
          where: { id: rc.id },
          data: {
            slack_bot_token_enc: rc.slackBotToken,
            google_chat_webhook_url_enc: rc.googleChatWebhookUrl,
            webhook_url_enc: rc.webhookUrl,
            webhook_secret_enc: rc.webhookSecret,
          },
        });
      }

      for (const rs of rotatedSettings) {
        await tx.appSetting.update({
          where: { id: rs.id },
          data: { value: rs.encrypted },
        });
      }
    });

    console.log("\n=========================================");
    console.log("   Key rotation completed successfully!");
    console.log("=========================================");
    console.log("Remember to update the ENCRYPTION_KEY environment variable in your production configuration.");
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ ERROR DURING ROTATION: ${err.message}`);
    console.error("Database transaction rolled back. No changes were committed.");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
