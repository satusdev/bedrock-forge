import {
	Injectable,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/encryption/encryption.service';

@Injectable()
export class CyberpanelService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly enc: EncryptionService,
	) {}

	async getCredentials(envId: number) {
		const env = await this.prisma.environment.findUnique({
			where: { id: BigInt(envId) },
		});
		if (!env) throw new NotFoundException(`Environment ${envId} not found`);
		if (!env.cyberpanel_login)
			throw new BadRequestException(
				'No CyberPanel credentials stored for this environment',
			);

		const raw = this.enc.decrypt(env.cyberpanel_login as string);
		return JSON.parse(raw) as Record<string, unknown>;
	}
}
