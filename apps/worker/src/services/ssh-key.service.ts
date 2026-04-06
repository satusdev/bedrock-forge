import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';

/**
 * SshKeyService
 *
 * Shared helper for resolving SSH private keys across all worker processors.
 * Mirrors the robust logic in the API's ServersService.resolvePrivateKey().
 *
 * Resolution order:
 *   1. Per-server key (ssh_private_key_encrypted field)
 *   2. Global key (app_settings.global_ssh_private_key)
 *
 * For each candidate key:
 *   - Decryption is wrapped in try/catch (guards against wrong ENCRYPTION_KEY)
 *   - Result is validated to be a PEM header (-----BEGIN ...)
 *
 * Throws a clear actionable error if no valid key is found.
 */
@Injectable()
export class SshKeyService {
	private readonly logger = new Logger(SshKeyService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly enc: EncryptionService,
	) {}

	async resolvePrivateKey(server: {
		name: string;
		ssh_private_key_encrypted: string | null;
	}): Promise<string> {
		if (server.ssh_private_key_encrypted) {
			try {
				const decrypted = this.enc.decrypt(server.ssh_private_key_encrypted);
				if (decrypted && decrypted.trimStart().startsWith('-----BEGIN')) {
					return decrypted;
				}
				this.logger.warn(
					`Per-server key for "${server.name}" decrypted but is not PEM-formatted — falling back to global key.`,
				);
			} catch (e) {
				this.logger.warn(
					`Per-server key decryption failed for "${server.name}" ` +
						`(ENCRYPTION_KEY mismatch or corrupted payload) — ` +
						`falling back to global key. Cause: ${e instanceof Error ? e.message : String(e)}`,
				);
			}
		}

		const globalSetting = await this.prisma.appSetting.findUnique({
			where: { key: 'global_ssh_private_key' },
		});
		if (globalSetting?.value) {
			try {
				const decrypted = this.enc.decrypt(globalSetting.value);
				if (decrypted && decrypted.trimStart().startsWith('-----BEGIN')) {
					return decrypted;
				}
			} catch {
				// Global key is also corrupted — fall through to the throw below
			}
		}

		throw new Error(
			`No valid SSH key available for server "${server.name}". ` +
				'Set a PEM-formatted private key on the server edit page, ' +
				'or configure a global SSH key in Settings → SSH Key.',
		);
	}
}
