import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/encryption/encryption.service';

/** Keys whose values are stored AES-256-GCM encrypted in the DB. */
const SENSITIVE_KEYS = new Set([
	'global_ssh_private_key',
	'rclone_gdrive_config',
]);

@Injectable()
export class SettingsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly enc: EncryptionService,
	) {}

	async getAll() {
		const settings = await this.prisma.appSetting.findMany({
			orderBy: { key: 'asc' },
		});
		return Object.fromEntries(settings.map(s => [s.key, s.value]));
	}

	async get(key: string) {
		const s = await this.prisma.appSetting.findUnique({ where: { key } });
		return s ? { key: s.key, value: s.value } : null;
	}

	async set(key: string, value: string) {
		return this.prisma.appSetting.upsert({
			where: { key },
			update: { value },
			create: { key, value },
		});
	}

	async delete(key: string) {
		return this.prisma.appSetting.delete({ where: { key } });
	}

	/** Store a sensitive value encrypted. The raw plaintext is never persisted. */
	async setEncrypted(key: string, plaintext: string): Promise<void> {
		const encrypted = this.enc.encrypt(plaintext);
		await this.prisma.appSetting.upsert({
			where: { key },
			update: { value: encrypted },
			create: { key, value: encrypted },
		});
	}

	/** Retrieve and decrypt a sensitive value. Returns null if unset. */
	async getDecrypted(key: string): Promise<string | null> {
		const s = await this.prisma.appSetting.findUnique({ where: { key } });
		if (!s) return null;
		try {
			return this.enc.decrypt(s.value);
		} catch {
			return null;
		}
	}

	/** Returns true/false — never exposes the key value. */
	async hasEncrypted(key: string): Promise<boolean> {
		const s = await this.prisma.appSetting.findUnique({ where: { key } });
		return !!s;
	}

	/** Filter out sensitive keys from getAll() display. */
	async getAllPublic() {
		const settings = await this.prisma.appSetting.findMany({
			orderBy: { key: 'asc' },
		});
		const visible = settings.filter(s => !SENSITIVE_KEYS.has(s.key));
		return Object.fromEntries(visible.map(s => [s.key, s.value]));
	}
}
