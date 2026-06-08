import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SettingsRepository } from './settings.repository';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { UpdateCloudflareDnsRecordDto } from './dto/cloudflare-settings.dto';

const execFileAsync = promisify(execFile);

/** Keys whose values are stored AES-256-GCM encrypted in the DB. */
const SENSITIVE_KEYS = new Set([
	'global_ssh_private_key',
	'rclone_gdrive_config',
	'GITHUB_API_TOKEN',
	'cloudflare_api_token',
]);

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

@Injectable()
export class SettingsService {
	private readonly logger = new Logger(SettingsService.name);

	constructor(
		private readonly repo: SettingsRepository,
		private readonly enc: EncryptionService,
		private readonly config: ConfigService,
	) {}

	async getAll() {
		const settings = await this.repo.findAll();
		return Object.fromEntries(settings.map(s => [s.key, s.value]));
	}

	async get(key: string) {
		const s = await this.repo.findByKey(key);
		if (!s) return null;
		// Never return plaintext for sensitive keys via the generic get() accessor.
		// Use getDecrypted() internally or hasEncrypted() for UI existence checks.
		if (SENSITIVE_KEYS.has(key)) {
			return { key: s.key, has_value: true };
		}
		return { key: s.key, value: s.value };
	}

	async set(key: string, value: string) {
		// Auto-encrypt sensitive values so callers don't need to know about encryption.
		const stored = SENSITIVE_KEYS.has(key) ? this.enc.encrypt(value) : value;
		return this.repo.upsert(key, stored);
	}

	async delete(key: string) {
		return this.repo.delete(key);
	}

	/** Store a sensitive value encrypted. The raw plaintext is never persisted. */
	async setEncrypted(key: string, plaintext: string): Promise<void> {
		const encrypted = this.enc.encrypt(plaintext);
		await this.repo.upsert(key, encrypted);
	}

	/** Retrieve and decrypt a sensitive value. Returns null if unset. */
	async getDecrypted(key: string): Promise<string | null> {
		const s = await this.repo.findByKey(key);
		if (!s) return null;
		try {
			return this.enc.decrypt(s.value);
		} catch {
			return null;
		}
	}

	/** Returns true/false — never exposes the key value. */
	async hasEncrypted(key: string): Promise<boolean> {
		const s = await this.repo.findByKey(key);
		return !!s;
	}

	/** Filter out sensitive keys from getAll() display. */
	async getAllPublic() {
		const settings = await this.repo.findAll();
		const visible = settings.filter(s => !SENSITIVE_KEYS.has(s.key));
		return Object.fromEntries(visible.map(s => [s.key, s.value]));
	}

	async getBillingSettings() {
		const all = await this.getAllPublic();
		return {
			currency_code: all['billing.currency_code'] ?? 'USD',
			currency_locale: all['billing.currency_locale'] ?? 'en-US',
		};
	}

	async setBillingSettings(input: {
		currency_code: string;
		currency_locale: string;
	}) {
		const currency = input.currency_code.trim().toUpperCase();
		const locale = input.currency_locale.trim();
		if (!/^[A-Z]{3}$/.test(currency)) {
			throw new BadRequestException('Currency code must be a 3-letter ISO code');
		}
		try {
			new Intl.NumberFormat(locale, {
				style: 'currency',
				currency,
			}).format(1);
		} catch {
			throw new BadRequestException('Invalid currency or locale');
		}
		await Promise.all([
			this.set('billing.currency_code', currency),
			this.set('billing.currency_locale', locale),
		]);
		return { currency_code: currency, currency_locale: locale };
	}

	// ── Google Drive (rclone) ───────────────────────────────────────────────

	async setGdrive(token: string): Promise<void> {
		let parsed: RcloneOAuthToken;
		try {
			parsed = JSON.parse(token.trim()) as RcloneOAuthToken;
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

		const remoteName = this.config.get<string>('RCLONE_REMOTE_NAME') ?? 'gdrive';
		// Serialize on one line — rclone INI values must not contain newlines
		const tokenOneLine = JSON.stringify(parsed);
		const rcloneConf = buildRcloneConfig(remoteName, tokenOneLine);
		await this.setEncrypted('rclone_gdrive_config', rcloneConf);

		this.logger.log(
			'Google Drive configured via OAuth token (rclone authorize).',
		);
	}

	async testGdrive(): Promise<{ success: boolean; message: string }> {
		const rcloneConf = await this.getDecrypted('rclone_gdrive_config');
		if (!rcloneConf) {
			return { success: false, message: 'Google Drive is not configured.' };
		}

		const tmpConf = join(tmpdir(), `rclone_test_${randomUUID()}.conf`);
		const remoteName = this.config.get<string>('RCLONE_REMOTE_NAME') ?? 'gdrive';

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

	// ── Cloudflare ──────────────────────────────────────────────────────────

	async getCloudflareConfig() {
		const configured = await this.hasEncrypted('cloudflare_api_token');
		const zone = await this.get('cloudflare_zone_id');
		const zoneName = await this.get('cloudflare_zone_name');
		return {
			configured,
			zone_id: zone?.value ?? null,
			zone_name: zoneName?.value ?? null,
		};
	}

	async setCloudflareConfig(dto: { api_token: string; zone_id: string; zone_name?: string }) {
		await Promise.all([
			this.setEncrypted('cloudflare_api_token', dto.api_token.trim()),
			this.set('cloudflare_zone_id', dto.zone_id.trim()),
			this.set('cloudflare_zone_name', dto.zone_name?.trim() ?? ''),
		]);
	}

	async deleteCloudflareConfig() {
		await Promise.all([
			this.delete('cloudflare_api_token').catch(() => undefined),
			this.delete('cloudflare_zone_id').catch(() => undefined),
			this.delete('cloudflare_zone_name').catch(() => undefined),
		]);
	}

	async testCloudflare() {
		const { token, zoneId } = await this.getCloudflareCredentials();
		const result = await this.cloudflareFetch(token, `/zones/${zoneId}`);
		return {
			success: true,
			message: `Connected to ${result.result?.name ?? zoneId}`,
			zone: result.result,
		};
	}

	async listCloudflareDnsRecords() {
		const { token, zoneId } = await this.getCloudflareCredentials();
		const result = await this.cloudflareFetch(
			token,
			`/zones/${zoneId}/dns_records?per_page=100`,
		);
		return result.result ?? [];
	}

	async updateCloudflareDnsRecord(
		recordId: string,
		dto: UpdateCloudflareDnsRecordDto,
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

	async purgeCloudflareCache() {
		const { token, zoneId } = await this.getCloudflareCredentials();
		const result = await this.cloudflareFetch(
			token,
			`/zones/${zoneId}/purge_cache`,
			{ method: 'POST', body: JSON.stringify({ purge_everything: true }) },
		);
		return { success: !!result.success };
	}

	async setCloudflareDevelopmentMode(enabled: boolean) {
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

	private async getCloudflareCredentials() {
		const token = await this.getDecrypted('cloudflare_api_token');
		const zone = await this.get('cloudflare_zone_id');
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

	// ── Webhook Testing ─────────────────────────────────────────────────────

	async testWebhook(type: 'slack' | 'discord' | 'google_chat', url: string) {
		if (!url) throw new BadRequestException('Webhook URL is required');

		const payload =
			type === 'slack' || type === 'google_chat'
				? { text: '✅ Bedrock Forge — Test Notification' }
				: { content: '✅ Bedrock Forge — Test Notification' };

		try {
			const res = await fetch(url, {
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
