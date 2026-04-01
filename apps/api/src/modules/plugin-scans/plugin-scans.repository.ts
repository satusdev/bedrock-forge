import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PaginationQuery } from '@bedrock-forge/shared';

@Injectable()
export class PluginScansRepository {
	constructor(private readonly prisma: PrismaService) {}

	findByEnvironment(envId: bigint, query: PaginationQuery) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		return this.prisma
			.$transaction([
				this.prisma.pluginScan.findMany({
					where: { environment_id: envId },
					skip: (page - 1) * limit,
					take: limit,
					orderBy: { scanned_at: 'desc' },
				}),
				this.prisma.pluginScan.count({ where: { environment_id: envId } }),
			])
			.then(([items, total]) => ({ items, total, page, limit }));
	}

	createJobExecution(data: {
		environment_id: bigint;
		queue_name: string;
		job_type?: string;
		bull_job_id: string;
	}) {
		return this.prisma.jobExecution.create({ data });
	}
}
