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
			runningJobs,
			failedJobs24h,
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

		const mapJob = (j: { id: bigint; queue_name: string; job_type: string | null; status: string; progress: number; last_error?: string | null; payload?: unknown; created_at: Date; environment?: { id?: bigint; url: string; project?: { id: bigint; name: string } } | null }) => ({
			...j,
			id: Number(j.id),
			environment: j.environment ? {
				...j.environment,
				id: j.environment.id ? Number(j.environment.id) : undefined,
				project: j.environment.project ? {
					...j.environment.project,
					id: Number(j.environment.project.id),
				} : undefined,
			} : null,
		});

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
			recentJobs: recentJobs.map(j => ({ ...j, id: Number(j.id) })),
			runningJobs: runningJobs.map(mapJob),
			failedJobs24h: failedJobs24h.map(mapJob),
		};
	}

	getHealthScores() {
		return this.repo.getHealthScores();
	}

	getAttentionItems() {
		return this.repo.getAttentionItems();
	}

	get24hSummary() {
		return this.repo.get24hSummary();
	}
}

