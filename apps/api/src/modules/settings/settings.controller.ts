import {
	Controller,
	Get,
	Put,
	Delete,
	Post,
	Param,
	Body,
	HttpCode,
	HttpStatus,
	UseGuards,
	BadRequestException,
	InternalServerErrorException,
	Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ROLES } from '@bedrock-forge/shared';
import { SettingsService } from './settings.service';
import { SetGdriveDto } from './dto/gdrive-settings.dto';
import { IsString, MinLength } from 'class-validator';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';

const execFileAsync = promisify(execFile);

class SetSettingDto {
	@IsString() value!: string;
}

class SetSshKeyDto {
	@IsString() @MinLength(20) key!: string;
}

interface RcloneOAuthToken {
	access_token?: string;
	token_type?: string;
	refresh_token?: string;
	expiry?: string;
	[key: string]: unknown;
}

/** Build an rclone.conf INI string from a rclone OAuth token JSON string. */
function buildRcloneConfig(remoteName: string, tokenJson: string): string {
	return `[${remoteName}]\ntype = drive\nscope = drive\ntoken = ${tokenJson}\n`;
}

@Controller('settings')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(ROLES.ADMIN)
export class SettingsController {
	private readonly logger = new Logger(SettingsController.name);

	constructor(
		private readonly svc: SettingsService,
		private readonly config: ConfigService,
	) {}

	/** Returns all non-sensitive settings as a key:value map. */
	@Get() getAll() {
		return this.svc.getAllPublic();
	}

	// ── Global SSH Key ──────────────────────────────────────────────────────

	/** Returns { has_key: boolean } — never exposes the actual value. */
	@Get('ssh-key') async getSshKey() {
		const has_key = await this.svc.hasEncrypted('global_ssh_private_key');
		return { has_key };
	}

	/** Store or replace the global SSH private key (encrypted at rest). */
	@Put('ssh-key') @HttpCode(HttpStatus.NO_CONTENT) async setSshKey(
		@Body() dto: SetSshKeyDto,
	) {
		await this.svc.setEncrypted('global_ssh_private_key', dto.key);
	}

	/** Remove the global SSH private key. */
	@Delete('ssh-key') @HttpCode(HttpStatus.NO_CONTENT) async deleteSshKey() {
		await this.svc.delete('global_ssh_private_key');
	}

	// ── Google Drive (rclone) ───────────────────────────────────────────────

	/** Returns { configured: boolean }. */
	@Get('gdrive') async getGdrive() {
		const configured = await this.svc.hasEncrypted('rclone_gdrive_config');
		return { configured };
	}

	/**
	 * Store Google Drive OAuth token produced by `rclone authorize "drive"`.
	 * Validates the token has access_token + refresh_token, converts to
	 * rclone.conf format, and stores encrypted.
	 */
	@Put('gdrive') @HttpCode(HttpStatus.NO_CONTENT) async setGdrive(
		@Body() dto: SetGdriveDto,
	) {
		let parsed: RcloneOAuthToken;
		try {
			parsed = JSON.parse(dto.token.trim()) as RcloneOAuthToken;
		} catch {
			throw new BadRequestException(
				'Invalid JSON — paste the token JSON printed by `rclone authorize "drive"`.',
			);
		}

		const required = ['access_token', 'refresh_token'];
		const missing = required.filter(k => !parsed[k]);
		if (missing.length) {
			throw new BadRequestException(
				`Token JSON is missing required fields: ${missing.join(', ')}. ` +
					'Make sure you copy the token JSON output by rclone authorize, not a credentials file.',
			);
		}

		const remoteName = process.env.RCLONE_REMOTE_NAME ?? 'gdrive';
		// Serialize on one line — rclone INI values must not contain newlines
		const tokenOneLine = JSON.stringify(parsed);
		const rcloneConf = buildRcloneConfig(remoteName, tokenOneLine);
		await this.svc.setEncrypted('rclone_gdrive_config', rcloneConf);

		this.logger.log('Google Drive configured via OAuth token (rclone authorize).');
	}

	/** Remove Google Drive configuration. */
	@Delete('gdrive') @HttpCode(HttpStatus.NO_CONTENT) async deleteGdrive() {
		await this.svc.delete('rclone_gdrive_config');
	}

	/**
	 * Test the stored Google Drive credentials by writing a temp rclone.conf
	 * and running `rclone lsd`. Returns { success: boolean, message: string }.
	 */
	@Post('gdrive/test')
	async testGdrive(): Promise<{ success: boolean; message: string }> {
		const rcloneConf = await this.svc.getDecrypted('rclone_gdrive_config');
		if (!rcloneConf) {
			return { success: false, message: 'Google Drive is not configured.' };
		}

		const tmpConf = join(tmpdir(), `rclone_test_${randomUUID()}.conf`);
		const remoteName = process.env.RCLONE_REMOTE_NAME ?? 'gdrive';

		try {
			await mkdir(tmpdir(), { recursive: true });
			await writeFile(tmpConf, rcloneConf, { mode: 0o600 });

			await execFileAsync('rclone', [
				'lsd',
				`${remoteName}:`,
				'--config',
				tmpConf,
				'--max-depth',
				'1',
			]);

			return { success: true, message: 'Connection successful.' };
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Unknown error';
			this.logger.warn(`GDrive connection test failed: ${msg}`);
			return {
				success: false,
				message: `Connection failed: ${msg}`,
			};
		} finally {
			await unlink(tmpConf).catch(() => undefined);
		}
	}

	// ── Generic key/value settings ──────────────────────────────────────────

	@Get(':key') get(@Param('key') key: string) {
		return this.svc.get(key);
	}
	@Put(':key') set(@Param('key') key: string, @Body() dto: SetSettingDto) {
		return this.svc.set(key, dto.value);
	}
	@Delete(':key') delete(@Param('key') key: string) {
		return this.svc.delete(key);
	}
}
