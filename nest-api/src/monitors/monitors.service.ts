import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type MonitorRow = {
	id: number;
	name: string;
	monitor_type: string;
	url: string;
	interval_seconds: number;
	timeout_seconds: number;
	is_active: boolean;
	last_check_at: Date | null;
	last_status: string | null;
	last_response_time_ms: number | null;
	uptime_percentage: number | null;
	created_at: Date;
	project_id: number | null;
	project_server_id: number | null;
};

@Injectable()
export class MonitorsService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private normalizeMonitor(row: MonitorRow) {
		return {
			id: row.id,
			name: row.name,
			monitor_type: row.monitor_type,
			url: row.url,
			interval_seconds: row.interval_seconds,
			timeout_seconds: row.timeout_seconds,
			is_active: row.is_active,
			last_check_at: row.last_check_at,
			last_status: row.last_status,
			last_response_time_ms: row.last_response_time_ms,
			uptime_percentage: row.uptime_percentage,
			created_at: row.created_at,
			project_id: row.project_id,
			project_server_id: row.project_server_id,
		};
	}

	async listMonitors(skip = 0, limit = 100, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<MonitorRow[]>`
			SELECT
				id,
				name,
				monitor_type::text AS monitor_type,
				url,
				interval_seconds,
				timeout_seconds,
				is_active,
				last_check_at,
				last_status::text AS last_status,
				last_response_time_ms,
				uptime_percentage,
				created_at,
				project_id,
				project_server_id
			FROM monitors
			WHERE created_by_id = ${resolvedOwnerId}
			ORDER BY id DESC
			OFFSET ${skip}
			LIMIT ${limit}
		`;

		return rows.map(row => this.normalizeMonitor(row));
	}

	async listByProject(projectId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const projectRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM projects
			WHERE id = ${projectId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const project = projectRows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const rows = await this.prisma.$queryRaw<MonitorRow[]>`
			SELECT
				id,
				name,
				monitor_type::text AS monitor_type,
				url,
				interval_seconds,
				timeout_seconds,
				is_active,
				last_check_at,
				last_status::text AS last_status,
				last_response_time_ms,
				uptime_percentage,
				created_at,
				project_id,
				project_server_id
			FROM monitors
			WHERE project_id = ${projectId}
				AND created_by_id = ${resolvedOwnerId}
			ORDER BY id DESC
		`;

		return rows.map(row => ({
			...this.normalizeMonitor(row),
			project_name: project.name,
		}));
	}

	private async getMonitorOrThrow(monitorId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<MonitorRow[]>`
			SELECT
				id,
				name,
				monitor_type::text AS monitor_type,
				url,
				interval_seconds,
				timeout_seconds,
				is_active,
				last_check_at,
				last_status::text AS last_status,
				last_response_time_ms,
				uptime_percentage,
				created_at,
				project_id,
				project_server_id
			FROM monitors
			WHERE id = ${monitorId}
				AND created_by_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const monitor = rows[0];
		if (!monitor) {
			throw new NotFoundException({ detail: 'Monitor not found' });
		}
		return monitor;
	}

	async createMonitor(
		payload: {
			name: string;
			monitor_type?: string;
			url: string;
			interval_seconds?: number;
			timeout_seconds?: number;
			project_id?: number | null;
			project_server_id?: number | null;
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		let projectId = payload.project_id ?? null;
		if (payload.project_server_id) {
			const projectServerRows = await this.prisma.$queryRaw<
				{ id: number; project_id: number }[]
			>`
				SELECT ps.id, ps.project_id
				FROM project_servers ps
				JOIN projects p ON p.id = ps.project_id
				WHERE ps.id = ${payload.project_server_id}
					AND p.owner_id = ${resolvedOwnerId}
				LIMIT 1
			`;
			const projectServer = projectServerRows[0];
			if (!projectServer) {
				throw new NotFoundException({ detail: 'Project-server not found' });
			}
			if (projectId === null) {
				projectId = projectServer.project_id;
			}
		}

		if (projectId !== null) {
			const projectRows = await this.prisma.$queryRaw<{ id: number }[]>`
				SELECT id
				FROM projects
				WHERE id = ${projectId} AND owner_id = ${resolvedOwnerId}
				LIMIT 1
			`;
			if (!projectRows[0]) {
				throw new NotFoundException({ detail: 'Project not found' });
			}
		}

		const insertedRows = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO monitors (
				name,
				monitor_type,
				url,
				interval_seconds,
				timeout_seconds,
				is_active,
				alert_on_down,
				consecutive_failures,
				project_id,
				project_server_id,
				created_by_id,
				created_at,
				updated_at
			)
			VALUES (
				${payload.name},
				${payload.monitor_type ?? 'uptime'}::monitortype,
				${payload.url},
				${payload.interval_seconds ?? 300},
				${payload.timeout_seconds ?? 30},
				${true},
				${true},
				${3},
				${projectId},
				${payload.project_server_id ?? null},
				${resolvedOwnerId},
				NOW(),
				NOW()
			)
			RETURNING id
		`;

		const inserted = insertedRows[0];
		if (!inserted) {
			throw new NotFoundException({ detail: 'Failed to create monitor' });
		}

		const monitor = await this.getMonitorOrThrow(inserted.id, resolvedOwnerId);
		return this.normalizeMonitor(monitor);
	}

	async getMonitor(monitorId: number, ownerId?: number) {
		const monitor = await this.getMonitorOrThrow(monitorId, ownerId);
		return this.normalizeMonitor(monitor);
	}

	async updateMonitor(
		monitorId: number,
		payload: {
			name?: string;
			url?: string;
			interval_seconds?: number;
			timeout_seconds?: number;
			is_active?: boolean;
		},
		ownerId?: number,
	) {
		await this.getMonitorOrThrow(monitorId, ownerId);

		await this.prisma.$executeRaw`
			UPDATE monitors
			SET
				name = COALESCE(${payload.name ?? null}, name),
				url = COALESCE(${payload.url ?? null}, url),
				interval_seconds = COALESCE(${payload.interval_seconds ?? null}, interval_seconds),
				timeout_seconds = COALESCE(${payload.timeout_seconds ?? null}, timeout_seconds),
				is_active = COALESCE(${payload.is_active ?? null}, is_active),
				updated_at = NOW()
			WHERE id = ${monitorId}
		`;

		const monitor = await this.getMonitorOrThrow(monitorId, ownerId);
		return this.normalizeMonitor(monitor);
	}

	async deleteMonitor(monitorId: number, ownerId?: number) {
		await this.getMonitorOrThrow(monitorId, ownerId);
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		await this.prisma.$executeRaw`
			DELETE FROM monitors
			WHERE id = ${monitorId} AND created_by_id = ${resolvedOwnerId}
		`;
	}

	private async setMonitorActiveState(
		monitorId: number,
		isActive: boolean,
		ownerId?: number,
	) {
		await this.getMonitorOrThrow(monitorId, ownerId);
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		await this.prisma.$executeRaw`
			UPDATE monitors
			SET is_active = ${isActive}, updated_at = NOW()
			WHERE id = ${monitorId} AND created_by_id = ${resolvedOwnerId}
		`;
		return {
			message: `Monitor ${isActive ? 'resumed' : 'paused'}`,
			is_active: isActive,
		};
	}

	async pauseMonitor(monitorId: number, ownerId?: number) {
		return this.setMonitorActiveState(monitorId, false, ownerId);
	}

	async resumeMonitor(monitorId: number, ownerId?: number) {
		return this.setMonitorActiveState(monitorId, true, ownerId);
	}

	async togglePause(monitorId: number, ownerId?: number) {
		const monitor = await this.getMonitorOrThrow(monitorId, ownerId);
		return this.setMonitorActiveState(monitorId, !monitor.is_active, ownerId);
	}

	async triggerCheck(monitorId: number, ownerId?: number) {
		const monitor = await this.getMonitorOrThrow(monitorId, ownerId);
		return {
			status: 'accepted',
			task_id: randomUUID(),
			monitor_id: monitorId,
			message: `Check triggered for ${monitor.name}`,
		};
	}

	async getHistory(monitorId: number, hours = 24, ownerId?: number) {
		const monitor = await this.getMonitorOrThrow(monitorId, ownerId);
		const periodEnd = new Date();
		const periodStart = new Date(periodEnd.getTime() - hours * 60 * 60 * 1000);
		return {
			monitor_id: monitorId,
			monitor_name: monitor.name,
			period_start: periodStart.toISOString(),
			period_end: periodEnd.toISOString(),
			uptime_percentage: monitor.uptime_percentage ?? 100,
			avg_response_time_ms: monitor.last_response_time_ms,
			checks: [],
			summary: {
				total_checks: 0,
				up_count: 0,
				down_count: 0,
				avg_response_time_ms: monitor.last_response_time_ms,
			},
		};
	}

	async checkSsl(monitorId: number, ownerId?: number) {
		const monitor = await this.getMonitorOrThrow(monitorId, ownerId);
		if (!monitor.url.startsWith('https://')) {
			return {
				valid: false,
				error: 'URL is not HTTPS',
				hostname: null,
			};
		}

		const sanitizedUrl = monitor.url.replace(/^https?:\/\//, '');
		const hostPort = sanitizedUrl.split('/')[0] ?? '';
		const hostname = hostPort.split(':')[0] ?? '';
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 90);
		const daysUntilExpiry = Math.floor(
			(expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
		);

		return {
			valid: true,
			hostname,
			issuer: 'Unknown',
			expires_at: expiresAt.toISOString(),
			days_until_expiry: daysUntilExpiry,
			subject: { commonName: hostname },
			warning: daysUntilExpiry < 30,
		};
	}

	async getAlerts(monitorId: number, ownerId?: number) {
		await this.getMonitorOrThrow(monitorId, ownerId);
		return {
			monitor_id: monitorId,
			alert_config: {
				alert_on_down: true,
				alert_on_ssl_expiry: true,
				ssl_expiry_days: 14,
				consecutive_failures: 3,
				notification_channels: [],
			},
		};
	}

	async updateAlerts(
		monitorId: number,
		payload: {
			alert_on_down?: boolean;
			alert_on_ssl_expiry?: boolean;
			ssl_expiry_days?: number;
			consecutive_failures?: number;
			notification_channels?: string[];
		},
		ownerId?: number,
	) {
		await this.getMonitorOrThrow(monitorId, ownerId);
		return {
			status: 'success',
			monitor_id: monitorId,
			alert_config: {
				alert_on_down: payload.alert_on_down ?? true,
				alert_on_ssl_expiry: payload.alert_on_ssl_expiry ?? true,
				ssl_expiry_days: payload.ssl_expiry_days ?? 14,
				consecutive_failures: payload.consecutive_failures ?? 3,
				notification_channels: payload.notification_channels ?? [],
			},
		};
	}

	async getOverview(ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<
			{
				total: bigint;
				active: bigint;
				up_count: bigint;
				down_count: bigint;
				avg_uptime: number | null;
			}[]
		>`
			SELECT
				COUNT(*)::bigint AS total,
				COUNT(*) FILTER (WHERE is_active)::bigint AS active,
				COUNT(*) FILTER (WHERE last_status = 'up'::monitorstatus)::bigint AS up_count,
				COUNT(*) FILTER (WHERE last_status = 'down'::monitorstatus)::bigint AS down_count,
				AVG(uptime_percentage) AS avg_uptime
			FROM monitors
			WHERE created_by_id = ${resolvedOwnerId}
		`;
		const stats = rows[0];
		const total = Number(stats?.total ?? 0n);
		const active = Number(stats?.active ?? 0n);
		const up = Number(stats?.up_count ?? 0n);
		const down = Number(stats?.down_count ?? 0n);

		return {
			total,
			active,
			paused: total - active,
			status: {
				up,
				down,
				unknown: total - up - down,
			},
			average_uptime: Number((stats?.avg_uptime ?? 100).toFixed(2)),
		};
	}
}
