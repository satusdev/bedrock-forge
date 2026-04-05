import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardRepository {
	constructor(private readonly prisma: PrismaService) {}

	async getSummaryData() {
		const [
			projectTotal,
			serverTotal,
			clientTotal,
			monitors,
			recentJobs,
			domainsExpiringSoon,
		] = await Promise.all([
			this.prisma.project.count(),
			this.prisma.server.count(),
			this.prisma.client.count(),
			this.prisma.monitor.findMany({
				select: { last_status: true, uptime_pct: true },
			}),
			this.prisma.jobExecution.findMany({
				take: 8,
				orderBy: { created_at: 'desc' },
				select: {
					id: true,
					queue_name: true,
					job_type: true,
					status: true,
					progress: true,
					created_at: true,
					environment: { select: { url: true } },
				},
			}),
			this.prisma.domain.count({
				where: {
					expires_at: {
						gte: new Date(),
						lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
					},
				},
			}),
		]);

		return {
			projectTotal,
			serverTotal,
			clientTotal,
			monitors,
			recentJobs,
			domainsExpiringSoon,
		};
	}
}
