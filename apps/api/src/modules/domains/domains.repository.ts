import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PaginationQuery } from '@bedrock-forge/shared';

@Injectable()
export class DomainsRepository {
	constructor(private readonly prisma: PrismaService) {}

	findAll(query: PaginationQuery) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const where: Record<string, unknown> = {};
		if (query.search) {
			where['name'] = { contains: query.search, mode: 'insensitive' };
		}
		return this.prisma
			.$transaction([
				this.prisma.domain.findMany({
					where,
					skip: (page - 1) * limit,
					take: limit,
					orderBy: { name: 'asc' },
				}),
				this.prisma.domain.count({ where }),
			])
			.then(([items, total]) => ({ items, total, page, limit }));
	}

	findById(id: bigint) {
		return this.prisma.domain.findUnique({ where: { id } });
	}

	/** Find an existing domain record by exact name. */
	findByName(name: string) {
		return this.prisma.domain.findUnique({ where: { name } });
	}

	create(data: { name: string }) {
		return this.prisma.domain.create({ data });
	}

	update(id: bigint, data: { name?: string }) {
		return this.prisma.domain.update({ where: { id }, data });
	}

	delete(id: bigint) {
		return this.prisma.domain.delete({ where: { id } });
	}
}
