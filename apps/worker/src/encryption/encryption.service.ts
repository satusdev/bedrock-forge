import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

@Injectable()
export class EncryptionService {
	private readonly keyBuffer: Buffer;

	constructor(private readonly config: ConfigService) {
		const key = config.get<string>('encryption.key');
		if (!key || key.length < 32)
			throw new Error('ENCRYPTION_KEY must be at least 32 characters');
		this.keyBuffer = Buffer.from(key.slice(0, 32), 'utf8');
	}

	encrypt(plain: string): string {
		const iv = randomBytes(IV_LEN);
		const cipher = createCipheriv(ALGO, this.keyBuffer, iv);
		const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
		const tag = cipher.getAuthTag();
		return Buffer.concat([iv, enc, tag]).toString('base64');
	}

	decrypt(ciphertext: string): string {
		const buf = Buffer.from(ciphertext, 'base64');
		const iv = buf.subarray(0, IV_LEN);
		const tag = buf.subarray(buf.length - TAG_LEN);
		const enc = buf.subarray(IV_LEN, buf.length - TAG_LEN);
		const decipher = createDecipheriv(ALGO, this.keyBuffer, iv);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
			'utf8',
		);
	}
}
