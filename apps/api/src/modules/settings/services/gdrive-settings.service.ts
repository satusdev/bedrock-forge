import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { SettingsRepository } from "../settings.repository";
import { EncryptionService } from "../../../common/encryption/encryption.service";
import { ConfigService } from "@nestjs/config";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

interface RcloneOAuthToken {
  access_token?: string;
  token_type?: string;
  refresh_token?: string;
  expiry?: string;
  [key: string]: unknown;
}

function buildRcloneConfig(remoteName: string, tokenJson: string): string {
  return `[${remoteName}]\ntype = drive\nscope = drive\ntoken = ${tokenJson}\n`;
}

@Injectable()
export class GdriveSettingsService {
  private readonly logger = new Logger(GdriveSettingsService.name);

  constructor(
    private readonly repo: SettingsRepository,
    private readonly enc: EncryptionService,
    private readonly config: ConfigService,
  ) {}

  async getGdriveConfig() {
    const s = await this.repo.findByKey("rclone_gdrive_config");
    return { configured: !!s };
  }

  async setGdrive(token: string): Promise<void> {
    let parsed: RcloneOAuthToken;
    try {
      parsed = JSON.parse(token.trim()) as RcloneOAuthToken;
    } catch {
      throw new BadRequestException(
        'Invalid JSON — paste the token JSON printed by `rclone authorize "drive"`.',
      );
    }

    const required = ["access_token", "refresh_token"];
    const missing = required.filter((k) => !parsed[k]);
    if (missing.length) {
      throw new BadRequestException(
        `Token JSON is missing required fields: ${missing.join(", ")}. ` +
          "Make sure you copy the token JSON output by rclone authorize, not a credentials file.",
      );
    }

    const remoteName =
      this.config.get<string>("RCLONE_REMOTE_NAME") ?? "gdrive";
    const tokenOneLine = JSON.stringify(parsed);
    const rcloneConf = buildRcloneConfig(remoteName, tokenOneLine);
    const encrypted = this.enc.encrypt(rcloneConf);
    await this.repo.upsert("rclone_gdrive_config", encrypted);

    this.logger.log(
      "Google Drive configured via OAuth token (rclone authorize).",
    );
  }

  async deleteGdrive(): Promise<void> {
    await this.repo.delete("rclone_gdrive_config");
  }

  async testGdrive(): Promise<{ success: boolean; message: string }> {
    const s = await this.repo.findByKey("rclone_gdrive_config");
    if (!s) {
      return { success: false, message: "Google Drive is not configured." };
    }
    let rcloneConf: string;
    try {
      rcloneConf = this.enc.decrypt(s.value);
    } catch {
      return { success: false, message: "Failed to decrypt Google Drive credentials." };
    }

    const tmpConf = join(tmpdir(), `rclone_test_${randomUUID()}.conf`);
    const remoteName =
      this.config.get<string>("RCLONE_REMOTE_NAME") ?? "gdrive";

    try {
      await mkdir(tmpdir(), { recursive: true });
      await writeFile(tmpConf, rcloneConf, { mode: 0o600 });

      await execFileAsync("rclone", [
        "lsd",
        `${remoteName}:`,
        "--config",
        tmpConf,
        "--max-depth",
        "1",
      ]);

      return { success: true, message: "Connection successful." };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      this.logger.warn(`GDrive connection test failed: ${msg}`);
      return {
        success: false,
        message: `Connection failed: ${msg}`,
      };
    } finally {
      await unlink(tmpConf).catch(() => undefined);
    }
  }
}
