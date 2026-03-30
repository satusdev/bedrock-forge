import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface JobExecutionFilter {
	queue_name?: string;
	status?: string;
	environment_id?: number;
	date_from?: Date;
	date_to?: Date;
}

export interface JobExecutionPage {
	data: JobExecutionRow[];
	total: number;
	page: number;
	limit: number;
}

export interface JobExecutionRow {
	id: number;
	queue_name: string;
	status: string;
	progress: number | null;
	last_error: string | null;
	started_at: Date | null;
	completed_at: Date | null;
	created_at: Date;
	environment: {
		id: number;
		type: string;
		url: string | null;
		project: {
			id: number;
			name: string;
			client: { id: number; name: string };
		};
	} | null;
}

@Injectable()
export class JobExecutionsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findPaginated(
		filter: JobExecutionFilter,
		page: number,
		limit: number,
	): Promise<JobExecutionPage> {
		const where: Record<string, unknown> = {};

		if (filter.queue_name) where.queue_name = filter.queue_name;
		if (filter.status) where.status = filter.status;
		if (filter.environment_id)
			where.environment_id = BigInt(filter.environment_id);
		if (filter.date_from || filter.date_to) {
			where.created_at = {
				...(filter.date_from ? { gte: filter.date_from } : {}),
				...(filter.date_to ? { lte: filter.date_to } : {}),
			};
		}

		const [total, rows] = await Promise.all([
			this.prisma.jobExecution.count({ where }),
			this.prisma.jobExecution.findMany({
				where,
				orderBy: { created_at: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
				select: {
					id: true,
					queue_name: true,
					status: true,
					progress: true,
					last_error: true,
					started_at: true,
					completed_at: true,
					created_at: true,
					environment: {
						select: {
							id: true,
							type: true,
							url: true,
							project: {
								select: {
									id: true,
									name: true,
									client: { select: { id: true, name: true } },
								},
							},
						},
					},
				},
			}),
		]);

		return {
			data: rows.map(r => ({
				...r,
				id: Number(r.id),
				environment: r.environment
					? {
							...r.environment,
							id: Number(r.environment.id),
							project: {
								...r.environment.project,
								id: Number(r.environment.project.id),
								client: {
									...r.environment.project.client,
									id: Number(r.environment.project.client.id),
								},
							},
						}
					: null,
			})),
			total,
			page,
			limit,
		};
	}

	async findById(id: number) {
		return this.prisma.jobExecution.findUniqueOrThrow({
			where: { id: BigInt(id) },
			include: {
				environment: {
					include: {
						project: { include: { client: true } },
					},
				},
			},
		});
	}

	async findLog(id: number) {
		return this.prisma.jobExecution.findUniqueOrThrow({
			where: { id: BigInt(id) },
			select: { id: true, status: true, execution_log: true },
		});
	}
}
