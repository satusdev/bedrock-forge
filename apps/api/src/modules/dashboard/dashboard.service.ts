import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
	constructor(private readonly prisma: PrismaService) {}

	async getSummary() {
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

		const monitorsUp = monitors.filter(m => m.last_status === 200).length;
		const monitorsDown = monitors.filter(
			m => m.last_status !== null && m.last_status !== 200,
		).length;
		const avgUptime =
			monitors.length > 0
				? monitors.reduce(
						(sum, m) => sum + parseFloat(String(m.uptime_pct ?? 100)),
						0,
					) / monitors.length
				: null;

		return {
			projects: { total: projectTotal },
			servers: { total: serverTotal },
			clients: { total: clientTotal },
			monitors: {
				total: monitors.length,
				up: monitorsUp,
				down: monitorsDown,
				avgUptime: avgUptime !== null ? Number(avgUptime.toFixed(1)) : null,
			},
			domains: { expiringSoon: domainsExpiringSoon },
			recentJobs: recentJobs.map(j => ({
				...j,
				id: Number(j.id),
			})),
		};
	}
}
