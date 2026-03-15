import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SyncRepository {
	constructor(private readonly prisma: PrismaService) {}

	async getSystemPrivateKey(): Promise<string | null> {
		const rows = await this.prisma.$queryRaw<
			{ encrypted_value: string | null; value: string | null }[]
		>`
			SELECT encrypted_value, value
			FROM app_settings
			WHERE key = ${'system.ssh.private_key'}
			LIMIT 1
		`;
		const row = rows[0];
		if (!row) {
			return null;
		}
		return row.encrypted_value ?? row.value;
	}
}
