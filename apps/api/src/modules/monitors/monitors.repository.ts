import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MonitorsRepository {
	constructor(private readonly prisma: PrismaService) {}

	findAll() {
		return this.prisma.monitor.findMany({
			orderBy: { created_at: 'desc' },
			include: {
				environment: { select: { id: true, url: true, type: true } },
			},
		});
	}

	findById(id: bigint) {
		return this.prisma.monitor.findUnique({
			where: { id },
			include: {
				monitor_results: { orderBy: { checked_at: 'desc' }, take: 100 },
			},
		});
	}

	create(data: {
		environment_id: bigint;
		interval_seconds: number;
		enabled?: boolean;
	}) {
		return this.prisma.monitor.create({
			data: {
				environment_id: data.environment_id,
				interval_seconds: data.interval_seconds,
				...(data.enabled !== undefined && { enabled: data.enabled }),
			},
		});
	}

	update(id: bigint, data: { interval_seconds?: number; enabled?: boolean }) {
		return this.prisma.monitor.update({
			where: { id },
			data: {
				...(data.interval_seconds !== undefined && {
					interval_seconds: data.interval_seconds,
				}),
				...(data.enabled !== undefined && { enabled: data.enabled }),
			},
		});
	}

	delete(id: bigint) {
		return this.prisma.monitor.delete({ where: { id } });
	}
}
