import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import {
	CreateEnvironmentDto,
	UpdateEnvironmentDto,
} from './dto/environment.dto';

@Injectable()
export class EnvironmentsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly enc: EncryptionService,
	) {}

	findByProject(projectId: number) {
		return this.prisma.environment.findMany({
			where: { project_id: BigInt(projectId) },
			orderBy: { name: 'asc' },
		});
	}

	async findOne(id: number) {
		const env = await this.prisma.environment.findUnique({
			where: { id: BigInt(id) },
		});
		if (!env) throw new NotFoundException(`Environment ${id} not found`);
		return env;
	}

	async create(projectId: number, dto: CreateEnvironmentDto) {
		const { cyberpanel_login, cyberpanel_user_id, ...rest } = dto;
		return this.prisma.environment.create({
			data: {
				...rest,
				project_id: BigInt(projectId),
				cyberpanel_user_id: cyberpanel_user_id
					? BigInt(cyberpanel_user_id)
					: undefined,
				cyberpanel_login: cyberpanel_login
					? this.enc.encrypt(JSON.stringify(cyberpanel_login))
					: undefined,
				type: rest.type as never,
			},
		});
	}

	async update(id: number, dto: UpdateEnvironmentDto) {
		await this.findOne(id);
		const { cyberpanel_login, cyberpanel_user_id, ...rest } = dto;
		return this.prisma.environment.update({
			where: { id: BigInt(id) },
			data: {
				...rest,
				...(cyberpanel_user_id !== undefined && {
					cyberpanel_user_id: BigInt(cyberpanel_user_id),
				}),
				...(cyberpanel_login !== undefined && {
					cyberpanel_login: this.enc.encrypt(JSON.stringify(cyberpanel_login)),
				}),
				type: rest.type as never,
			},
		});
	}

	async remove(id: number) {
		await this.findOne(id);
		return this.prisma.environment.delete({ where: { id: BigInt(id) } });
	}
}
