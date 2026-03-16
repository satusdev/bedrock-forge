import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 16;

/**
 * EncryptionService — AES-256-GCM symmetric encryption for credentials at rest.
 *
 * Encrypted format (base64): <12-byte IV><ciphertext><16-byte auth tag>
 * All three parts are concatenated and base64-encoded as a single string.
 */
@Injectable()
export class EncryptionService {
	private readonly key: Buffer;

	constructor(private readonly config: ConfigService) {
		const hexKey = config.get<string>('encryption.key');
		if (!hexKey || hexKey.length !== 64) {
			throw new Error(
				'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes for AES-256)',
			);
		}
		this.key = Buffer.from(hexKey, 'hex');
	}

	encrypt(plaintext: string): string {
		const iv = randomBytes(IV_LENGTH);
		const cipher = createCipheriv(ALGORITHM, this.key, iv, {
			authTagLength: TAG_LENGTH,
		});

		const encrypted = Buffer.concat([
			cipher.update(plaintext, 'utf-8'),
			cipher.final(),
		]);

		const tag = cipher.getAuthTag();

		// Concatenate: IV (12) + ciphertext (variable) + auth tag (16)
		const combined = Buffer.concat([iv, encrypted, tag]);
		return combined.toString('base64');
	}

	decrypt(ciphertext: string): string {
		const combined = Buffer.from(ciphertext, 'base64');

		if (combined.length < IV_LENGTH + TAG_LENGTH) {
			throw new Error('Invalid ciphertext: too short');
		}

		const iv = combined.subarray(0, IV_LENGTH);
		const tag = combined.subarray(combined.length - TAG_LENGTH);
		const encrypted = combined.subarray(
			IV_LENGTH,
			combined.length - TAG_LENGTH,
		);

		const decipher = createDecipheriv(ALGORITHM, this.key, iv, {
			authTagLength: TAG_LENGTH,
		});
		decipher.setAuthTag(tag);

		return Buffer.concat([
			decipher.update(encrypted),
			decipher.final(),
		]).toString('utf-8');
	}
}
