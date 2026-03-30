import {
	Injectable,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common';
import { CyberpanelRepository } from './cyberpanel.repository';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { UpsertCyberpanelDto } from './dto/cyberpanel.dto';

@Injectable()
export class CyberpanelService {
	constructor(
		private readonly repo: CyberpanelRepository,
		private readonly enc: EncryptionService,
	) {}

	async getCredentials(serverId: number) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);
		if (!server.cyberpanel_login)
			throw new BadRequestException(
				'No CyberPanel credentials stored for this server',
			);

		const raw = this.enc.decrypt(server.cyberpanel_login as string);
		return JSON.parse(raw) as Record<string, unknown>;
	}

	async saveCredentials(serverId: number, dto: UpsertCyberpanelDto) {
		const server = await this.repo.findServerById(BigInt(serverId));
		if (!server) throw new NotFoundException(`Server ${serverId} not found`);

		const encrypted = this.enc.encrypt(
			JSON.stringify({
				url: dto.url,
				username: dto.username,
				password: dto.password,
			}),
		);
		await this.repo.saveCyberpanelLogin(BigInt(serverId), encrypted);
		return { success: true };
	}
}
