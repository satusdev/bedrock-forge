import { Injectable } from '@nestjs/common';
import { DashboardRepository } from './dashboard.repository';

@Injectable()
export class DashboardService {
	constructor(private readonly repo: DashboardRepository) {}

	async getSummary() {
		const {
			projectTotal,
			serverTotal,
			clientTotal,
			monitors,
			recentJobs,
			domainsExpiringSoon,
		} = await this.repo.getSummaryData();

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
