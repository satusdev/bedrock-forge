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
import { IsBoolean, IsOptional, IsString, MinLength, Matches } from 'class-validator';
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

class SetBillingSettingsDto {
	@IsString()
	@Matches(/^[A-Za-z]{3}$/)
	currency_code!: string;

	@IsString()
	@MinLength(2)
	currency_locale!: string;
}

class SetCloudflareSettingsDto {
	@IsString()
	@MinLength(20)
	api_token!: string;

	@IsString()
	@MinLength(3)
	zone_id!: string;

	@IsOptional()
	@IsString()
	zone_name?: string;
}

class UpdateCloudflareDnsRecordDto {
	@IsOptional()
	@IsString()
	type?: string;

	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	content?: string;

	@IsOptional()
	@IsBoolean()
	proxied?: boolean;
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

	@Get('public/billing')
	@Roles(ROLES.MANAGER)
	getBillingSettings() {
		return this.svc.getBillingSettings();
	}

	@Put('billing')
	@HttpCode(HttpStatus.NO_CONTENT)
	async setBillingSettings(@Body() dto: SetBillingSettingsDto) {
		await this.svc.setBillingSettings(dto);
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

		this.logger.log(
			'Google Drive configured via OAuth token (rclone authorize).',
		);
	}

	/** Remove Google Drive configuration. */
	@Delete('gdrive') @HttpCode(HttpStatus.NO_CONTENT) async deleteGdrive() {
		await this.svc.delete('rclone_gdrive_config');
	}

	// ── Cloudflare ──────────────────────────────────────────────────────────

	@Get('cloudflare')
	async getCloudflare() {
		const configured = await this.svc.hasEncrypted('cloudflare_api_token');
		const zone = await this.svc.get('cloudflare_zone_id');
		const zoneName = await this.svc.get('cloudflare_zone_name');
		return {
			configured,
			zone_id: zone?.value ?? null,
			zone_name: zoneName?.value ?? null,
		};
	}

	@Put('cloudflare') @HttpCode(HttpStatus.NO_CONTENT) async setCloudflare(
		@Body() dto: SetCloudflareSettingsDto,
	) {
		await Promise.all([
			this.svc.setEncrypted('cloudflare_api_token', dto.api_token.trim()),
			this.svc.set('cloudflare_zone_id', dto.zone_id.trim()),
			this.svc.set('cloudflare_zone_name', dto.zone_name?.trim() ?? ''),
		]);
	}

	@Delete('cloudflare') @HttpCode(HttpStatus.NO_CONTENT) async deleteCloudflare() {
		await Promise.all([
			this.svc.delete('cloudflare_api_token').catch(() => undefined),
			this.svc.delete('cloudflare_zone_id').catch(() => undefined),
			this.svc.delete('cloudflare_zone_name').catch(() => undefined),
		]);
	}

	@Post('cloudflare/test')
	async testCloudflare() {
		const { token, zoneId } = await this.getCloudflareCredentials();
		const result = await this.cloudflareFetch(token, `/zones/${zoneId}`);
		return {
			success: true,
			message: `Connected to ${result.result?.name ?? zoneId}`,
			zone: result.result,
		};
	}

	@Get('cloudflare/dns-records')
	async listCloudflareDnsRecords() {
		const { token, zoneId } = await this.getCloudflareCredentials();
		const result = await this.cloudflareFetch(
			token,
			`/zones/${zoneId}/dns_records?per_page=100`,
		);
		return result.result ?? [];
	}

	@Put('cloudflare/dns-records/:recordId')
	async updateCloudflareDnsRecord(
		@Param('recordId') recordId: string,
		@Body() dto: UpdateCloudflareDnsRecordDto,
	) {
		const { token, zoneId } = await this.getCloudflareCredentials();
		const existing = await this.cloudflareFetch(
			token,
			`/zones/${zoneId}/dns_records/${recordId}`,
		);
		const current = existing.result;
		const payload = {
			type: dto.type ?? current.type,
			name: dto.name ?? current.name,
			content: dto.content ?? current.content,
			ttl: current.ttl ?? 1,
			proxied: dto.proxied ?? current.proxied ?? false,
		};
		const result = await this.cloudflareFetch(
			token,
			`/zones/${zoneId}/dns_records/${recordId}`,
			{ method: 'PUT', body: JSON.stringify(payload) },
		);
		return result.result;
	}

	@Post('cloudflare/cache/purge')
	async purgeCloudflareCache() {
		const { token, zoneId } = await this.getCloudflareCredentials();
		const result = await this.cloudflareFetch(
			token,
			`/zones/${zoneId}/purge_cache`,
			{ method: 'POST', body: JSON.stringify({ purge_everything: true }) },
		);
		return { success: !!result.success };
	}

	@Put('cloudflare/development-mode')
	async setCloudflareDevelopmentMode(@Body('enabled') enabled: boolean) {
		const { token, zoneId } = await this.getCloudflareCredentials();
		const result = await this.cloudflareFetch(
			token,
			`/zones/${zoneId}/settings/development_mode`,
			{
				method: 'PATCH',
				body: JSON.stringify({ value: enabled ? 'on' : 'off' }),
			},
		);
		return result.result;
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

	private async getCloudflareCredentials() {
		const token = await this.svc.getDecrypted('cloudflare_api_token');
		const zone = await this.svc.get('cloudflare_zone_id');
		if (!token || !zone?.value) {
			throw new BadRequestException('Cloudflare is not configured.');
		}
		return { token, zoneId: zone.value };
	}

	private async cloudflareFetch(
		token: string,
		path: string,
		init: RequestInit = {},
	): Promise<any> {
		const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				...(init.headers ?? {}),
			},
		});
		const payload = await res.json().catch(() => null);
		if (!res.ok || payload?.success === false) {
			const message =
				payload?.errors?.[0]?.message ?? res.statusText ?? 'Cloudflare request failed';
			throw new BadRequestException(message);
		}
		return payload;
	}

	// ── System Backup Folder ID ─────────────────────────────────────────────

	/** Returns { folder_id: string | null } — the Google Drive folder used for Forge self-backups. */
	@Get('system-backup-folder') async getSystemBackupFolder() {
		const result = await this.svc.get('forge_system_backup_folder_id');
		return { folder_id: result?.value ?? null };
	}

	/** Save the Google Drive folder ID used for Forge system backups. */
	@Put('system-backup-folder')
	@HttpCode(HttpStatus.NO_CONTENT)
	async setSystemBackupFolder(@Body() dto: SetSettingDto) {
		await this.svc.set('forge_system_backup_folder_id', dto.value);
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

	@Post('test-webhook')
	async testWebhook(
		@Body() dto: { type: 'slack' | 'discord' | 'google_chat'; url: string },
	) {
		if (!dto.url) throw new BadRequestException('Webhook URL is required');

		const payload =
			dto.type === 'slack' || dto.type === 'google_chat'
				? { text: '✅ Bedrock Forge — Test Notification' }
				: { content: '✅ Bedrock Forge — Test Notification' };

		try {
			const res = await fetch(dto.url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const text = await res.text();
				throw new Error(`Status ${res.status}: ${text}`);
			}

			return { success: true };
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			throw new BadRequestException(`Failed to send test notification: ${msg}`);
		}
	}
}
