import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { PaginationQuery } from '@bedrock-forge/shared';

@Injectable()
export class ClientsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findAll(query: PaginationQuery) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const skip = (page - 1) * limit;
		const where = query.search
			? {
					OR: [
						{ name: { contains: query.search, mode: 'insensitive' as const } },
						{ email: { contains: query.search, mode: 'insensitive' as const } },
					],
				}
			: {};

		const [items, total] = await this.prisma.$transaction([
			this.prisma.client.findMany({
				where,
				skip,
				take: limit,
				include: { client_tags: { include: { tag: true } } },
				orderBy: { name: 'asc' },
			}),
			this.prisma.client.count({ where }),
		]);
		return { items, total, page, limit };
	}

	findById(id: bigint) {
		return this.prisma.client.findUnique({
			where: { id },
			include: { client_tags: { include: { tag: true } }, projects: true },
		});
	}

	async create(dto: CreateClientDto) {
		const { tagIds, ...data } = dto;
		return this.prisma.client.create({
			data: {
				...data,
				client_tags: tagIds?.length
					? { create: tagIds.map(tagId => ({ tag_id: BigInt(tagId) })) }
					: undefined,
			},
			include: { client_tags: { include: { tag: true } } },
		});
	}

	async update(id: bigint, dto: UpdateClientDto) {
		const { tagIds, ...data } = dto;
		return this.prisma.client.update({
			where: { id },
			data: {
				...data,
				...(tagIds !== undefined && {
					client_tags: {
						deleteMany: {},
						create: tagIds.map(tagId => ({ tag_id: BigInt(tagId) })),
					},
				}),
			},
			include: { client_tags: { include: { tag: true } } },
		});
	}

	delete(id: bigint) {
		return this.prisma.client.delete({ where: { id } });
	}
}
