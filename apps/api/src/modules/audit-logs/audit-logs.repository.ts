import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface AuditLogFilter {
	user_id?: number;
	action?: string;
	resource_type?: string;
	date_from?: Date;
	date_to?: Date;
}

@Injectable()
export class AuditLogsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findAll(filter: AuditLogFilter, page: number, limit: number) {
		const where = {
			...(filter.user_id && { user_id: BigInt(filter.user_id) }),
			...(filter.action && { action: { contains: filter.action, mode: 'insensitive' as const } }),
			...(filter.resource_type && { resource_type: filter.resource_type }),
			...(filter.date_from || filter.date_to
				? {
						created_at: {
							...(filter.date_from && { gte: filter.date_from }),
							...(filter.date_to && { lte: filter.date_to }),
						},
					}
				: {}),
		};

		const [data, total] = await Promise.all([
			this.prisma.auditLog.findMany({
				where,
				orderBy: { created_at: 'desc' },
				skip: (page - 1) * limit,
				take: limit,
				include: {
					user: { select: { id: true, name: true, email: true } },
				},
			}),
			this.prisma.auditLog.count({ where }),
		]);

		return { data, total };
	}

	findById(id: number) {
		return this.prisma.auditLog.findUnique({
			where: { id: BigInt(id) },
			include: { user: { select: { id: true, name: true, email: true } } },
		});
	}
}
