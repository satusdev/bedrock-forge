import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PaginationQuery } from '@bedrock-forge/shared';

@Injectable()
export class DomainsRepository {
	constructor(private readonly prisma: PrismaService) {}

	findAll(query: PaginationQuery & { projectId?: number }) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const where: Record<string, unknown> = {};
		if (query.search) {
			where['name'] = { contains: query.search, mode: 'insensitive' };
		}
		if (query.projectId) {
			where['project_id'] = BigInt(query.projectId);
		}
		return this.prisma
			.$transaction([
				this.prisma.domain.findMany({
					where,
					skip: (page - 1) * limit,
					take: limit,
					orderBy: { name: 'asc' },
					include: { project: { select: { id: true, name: true } } },
				}),
				this.prisma.domain.count({ where }),
			])
			.then(([items, total]) => ({ items, total, page, limit }));
	}

	findById(id: bigint) {
		return this.prisma.domain.findUnique({
			where: { id },
			include: { project: { select: { id: true, name: true } } },
		});
	}

	/** Find the first domain record with this name across all projects. */
	findByName(name: string) {
		return this.prisma.domain.findFirst({
			where: { name },
			include: { project: { select: { id: true, name: true } } },
		});
	}

	create(data: { name: string; project_id: bigint }) {
		return this.prisma.domain.create({ data });
	}

	update(id: bigint, data: { name?: string; project_id?: bigint }) {
		return this.prisma.domain.update({ where: { id }, data });
	}

	delete(id: bigint) {
		return this.prisma.domain.delete({ where: { id } });
	}
}
