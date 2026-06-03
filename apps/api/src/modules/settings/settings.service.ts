import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsRepository } from './settings.repository';
import { EncryptionService } from '../../common/encryption/encryption.service';

/** Keys whose values are stored AES-256-GCM encrypted in the DB. */
const SENSITIVE_KEYS = new Set([
	'global_ssh_private_key',
	'rclone_gdrive_config',
	'GITHUB_API_TOKEN',
]);

@Injectable()
export class SettingsService {
	constructor(
		private readonly repo: SettingsRepository,
		private readonly enc: EncryptionService,
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
}
