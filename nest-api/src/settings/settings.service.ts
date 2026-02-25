import { BadRequestException, Injectable } from '@nestjs/common';
import { execFileSync } from 'child_process';
import { createPrivateKey, createPublicKey } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly keyPrivate = 'system.ssh.private_key';
	private readonly keyPublic = 'system.ssh.public_key';

	private async upsertSetting(
		key: string,
		payload: {
			value: string | null;
			encryptedValue: string | null;
			isSensitive: boolean;
		},
	) {
		await this.prisma.$executeRaw`
			INSERT INTO app_settings (
				key,
				value,
				encrypted_value,
				is_sensitive,
				created_at,
				updated_at
			)
			VALUES (
				${key},
				${payload.value},
				${payload.encryptedValue},
				${payload.isSensitive},
				NOW(),
				NOW()
			)
			ON CONFLICT (key)
			DO UPDATE SET
				value = EXCLUDED.value,
				encrypted_value = EXCLUDED.encrypted_value,
				is_sensitive = EXCLUDED.is_sensitive,
				updated_at = NOW()
		`;
	}

	private async getSetting(key: string) {
		const rows = await this.prisma.$queryRaw<
			{ value: string | null; encrypted_value: string | null }[]
		>`
			SELECT value, encrypted_value
			FROM app_settings
			WHERE key = ${key}
			LIMIT 1
		`;
		return rows[0] ?? null;
	}

	private normalizePrivateKey(privateKey: string) {
		const withNormalizedNewlines = privateKey.replace(/\r\n/g, '\n').trim();
		if (/^SHA256:[A-Za-z0-9+/=]+$/.test(withNormalizedNewlines)) {
			throw new BadRequestException({
				detail:
					'SSH fingerprint detected. Paste the full private key block instead of SHA256 fingerprint.',
			});
		}

		const normalized = withNormalizedNewlines.includes('\\n')
			? withNormalizedNewlines.replace(/\\n/g, '\n')
			: withNormalizedNewlines;
		if (!normalized) {
			throw new BadRequestException({
				detail: 'Private key is required.',
			});
		}

		if (normalized.length > 128 * 1024) {
			throw new BadRequestException({
				detail: 'Private key is too large.',
			});
		}

		const beginMatch = normalized.match(
			/^-----BEGIN ([A-Z0-9 ]+PRIVATE KEY)-----/m,
		);
		const endMatch = normalized.match(
			/^-----END ([A-Z0-9 ]+PRIVATE KEY)-----/m,
		);
		if (!beginMatch || !endMatch) {
			throw new BadRequestException({
				detail:
					'Invalid private key format. Provide a valid PEM/OpenSSH private key block.',
			});
		}

		const beginLabel = beginMatch[1]?.trim();
		const endLabel = endMatch[1]?.trim();
		if (!beginLabel || !endLabel || beginLabel !== endLabel) {
			throw new BadRequestException({
				detail: 'Invalid private key block delimiters.',
			});
		}

		const allowedLabels = new Set([
			'PRIVATE KEY',
			'RSA PRIVATE KEY',
			'EC PRIVATE KEY',
			'DSA PRIVATE KEY',
			'OPENSSH PRIVATE KEY',
		]);
		if (!allowedLabels.has(beginLabel)) {
			throw new BadRequestException({
				detail: 'Unsupported private key type.',
			});
		}

		return { normalized, keyLabel: beginLabel };
	}

	private derivePublicKeyFromPem(privateKeyPem: string) {
		const keyObject = createPrivateKey(privateKeyPem);
		const publicKey = createPublicKey(keyObject).export({
			type: 'spki',
			format: 'pem',
		});
		return publicKey.toString().trim();
	}

	private async derivePublicKeyFromOpenSsh(openSshPrivateKey: string) {
		const tempDir = await mkdtemp(join(tmpdir(), 'forge-sshkey-'));
		const keyPath = join(tempDir, 'id_key');
		try {
			await writeFile(keyPath, `${openSshPrivateKey}\n`, {
				encoding: 'utf-8',
				mode: 0o600,
			});
			try {
				const output = execFileSync('ssh-keygen', ['-y', '-f', keyPath], {
					encoding: 'utf-8',
					stdio: ['ignore', 'pipe', 'pipe'],
				});
				return output.trim();
			} catch (error) {
				const execError = error as NodeJS.ErrnoException;
				if (execError.code === 'ENOENT') {
					throw new BadRequestException({
						detail:
							"OpenSSH key support is unavailable on this server (missing 'ssh-keygen'). Ask admin to install openssh-client.",
					});
				}
				throw error;
			}
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	}

	private async derivePublicKey(privateKey: string) {
		const { normalized, keyLabel } = this.normalizePrivateKey(privateKey);

		try {
			if (keyLabel === 'OPENSSH PRIVATE KEY') {
				return await this.derivePublicKeyFromOpenSsh(normalized);
			}
			return this.derivePublicKeyFromPem(normalized);
		} catch (error) {
			if (error instanceof BadRequestException) {
				throw error;
			}
			throw new BadRequestException({
				detail:
					'Invalid or unsupported private key. Use a valid PEM/OpenSSH private key.',
			});
		}
	}

	async getSystemSSHKey() {
		const privateSetting = await this.getSetting(this.keyPrivate);
		const publicSetting = await this.getSetting(this.keyPublic);

		if (!privateSetting?.encrypted_value && !privateSetting?.value) {
			return { configured: false, public_key: null, key_type: null };
		}

		const publicKey = publicSetting?.value ?? null;
		const keyType = publicKey?.includes('BEGIN PUBLIC KEY')
			? 'Configured'
			: 'Configured';

		return {
			configured: true,
			public_key: publicKey,
			key_type: keyType,
		};
	}

	async updateSystemSSHKey(privateKey: string) {
		const publicKey = await this.derivePublicKey(privateKey);

		await this.upsertSetting(this.keyPrivate, {
			value: null,
			encryptedValue: privateKey,
			isSensitive: true,
		});
		await this.upsertSetting(this.keyPublic, {
			value: publicKey,
			encryptedValue: null,
			isSensitive: false,
		});

		return {
			configured: true,
			public_key: publicKey,
			key_type: 'Configured',
		};
	}
}
