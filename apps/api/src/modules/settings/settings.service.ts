import { Injectable } from '@nestjs/common';
import { SettingsRepository } from './settings.repository';
import { EncryptionService } from '../../common/encryption/encryption.service';

/** Keys whose values are stored AES-256-GCM encrypted in the DB. */
const SENSITIVE_KEYS = new Set([
	'global_ssh_private_key',
	'rclone_gdrive_config',
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
		return s ? { key: s.key, value: s.value } : null;
	}

	async set(key: string, value: string) {
		return this.repo.upsert(key, value);
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
}
