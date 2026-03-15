import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ProjectRow = {
	id: number;
	name: string;
};

type MonitorRow = {
	id: number;
	name: string;
	last_status: string | null;
	last_response_time_ms: number | null;
	last_check_at: Date | null;
};

type IncidentRow = {
	title: string;
	status: string;
	started_at: Date;
	resolved_at: Date | null;
	duration_seconds: number | null;
};

@Injectable()
export class StatusService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private async getProjectOrThrow(projectId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<ProjectRow[]>`
			SELECT id, name
			FROM projects
			WHERE id = ${projectId}
				AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const project = rows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
		return project;
	}

	private async calculateUptime(monitorId: number, hours: number) {
		const rows = await this.prisma.$queryRaw<
			{ total: bigint; up_count: bigint }[]
		>`
			SELECT
				COUNT(h.id)::bigint AS total,
				COUNT(h.id) FILTER (WHERE h.status = ${'up'}::heartbeatstatus)::bigint AS up_count
			FROM heartbeats h
			WHERE h.monitor_id = ${monitorId}
				AND h.checked_at >= (NOW() - (${hours} * INTERVAL '1 hour'))
		`;

		const total = Number(rows[0]?.total ?? 0n);
		const upCount = Number(rows[0]?.up_count ?? 0n);
		if (total <= 0) {
			return 100;
		}

		return Number(((upCount / total) * 100).toFixed(2));
	}

	private determineOverallStatus(monitors: MonitorRow[]) {
		if (!monitors.length) {
			return 'unknown';
		}

		const downCount = monitors.filter(
			monitor => monitor.last_status === 'down',
		).length;
		const degradedCount = monitors.filter(
			monitor => monitor.last_status === 'degraded',
		).length;

		if (downCount === monitors.length) {
			return 'major_outage';
		}
		if (downCount > 0 || degradedCount > 0) {
			return 'degraded';
		}

		return 'operational';
	}

	async getStatusPage(
		projectId: number,
		page = 1,
		pageSize = 10,
		ownerId?: number,
	) {
		const normalizedPage = Math.max(1, page);
		const normalizedPageSize = Math.min(50, Math.max(1, pageSize));

		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const project = await this.getProjectOrThrow(projectId, resolvedOwnerId);

		const monitors = await this.prisma.$queryRaw<MonitorRow[]>`
			SELECT
				m.id,
				m.name,
				m.last_status::text AS last_status,
				m.last_response_time_ms,
				m.last_check_at
			FROM monitors m
			JOIN projects p ON p.id = m.project_id
			WHERE m.project_id = ${projectId}
				AND m.is_active = ${true}
				AND p.owner_id = ${resolvedOwnerId}
			ORDER BY m.id ASC
		`;

		const monitorStatuses = [] as Array<{
			name: string;
			status: string;
			uptime_24h: number;
			uptime_30d: number;
			response_time_ms: number | null;
			last_check: Date | null;
		}>;

		for (const monitor of monitors) {
			const uptime24h = await this.calculateUptime(monitor.id, 24);
			const uptime30d = await this.calculateUptime(monitor.id, 24 * 30);

			monitorStatuses.push({
				name: monitor.name,
				status: monitor.last_status ?? 'pending',
				uptime_24h: uptime24h,
				uptime_30d: uptime30d,
				response_time_ms: monitor.last_response_time_ms,
				last_check: monitor.last_check_at,
			});
		}

		const monitorIds = monitors.map(monitor => monitor.id);
		let totalIncidents = 0;
		let recentIncidents: IncidentRow[] = [];

		if (monitorIds.length > 0) {
			const totalRows = await this.prisma.$queryRaw<{ total: bigint }[]>`
				SELECT COUNT(i.id)::bigint AS total
				FROM incidents i
				WHERE i.monitor_id = ANY(${monitorIds})
					AND i.started_at >= (NOW() - INTERVAL '30 day')
			`;
			totalIncidents = Number(totalRows[0]?.total ?? 0n);

			recentIncidents = await this.prisma.$queryRaw<IncidentRow[]>`
				SELECT
					i.title,
					i.status::text AS status,
					i.started_at,
					i.resolved_at,
					i.duration_seconds
				FROM incidents i
				WHERE i.monitor_id = ANY(${monitorIds})
					AND i.started_at >= (NOW() - INTERVAL '30 day')
				ORDER BY i.started_at DESC
				OFFSET ${(normalizedPage - 1) * normalizedPageSize}
				LIMIT ${normalizedPageSize}
			`;
		}

		return {
			project_name: project.name,
			overall_status: this.determineOverallStatus(monitors),
			monitors: monitorStatuses,
			recent_incidents: recentIncidents,
			incident_pagination: {
				page: normalizedPage,
				page_size: normalizedPageSize,
				total: totalIncidents,
			},
			last_updated: new Date(),
		};
	}

	async getStatusHistory(projectId: number, days = 30, ownerId?: number) {
		const normalizedDays = Math.min(90, Math.max(1, days));
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const project = await this.getProjectOrThrow(projectId, resolvedOwnerId);

		const monitorRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT m.id
			FROM monitors m
			JOIN projects p ON p.id = m.project_id
			WHERE m.project_id = ${projectId}
				AND m.is_active = ${true}
				AND p.owner_id = ${resolvedOwnerId}
		`;
		const monitorIds = monitorRows.map(row => row.id);

		if (monitorIds.length === 0) {
			return {
				project_name: project.name,
				period_days: normalizedDays,
				history: [],
				average_uptime: 100,
			};
		}

		const history: Array<{
			date: string;
			uptime_percentage: number;
			checks_total: number;
			checks_up: number;
		}> = [];

		let totalUptime = 0;
		for (let dayOffset = 0; dayOffset < normalizedDays; dayOffset += 1) {
			const dayRows = await this.prisma.$queryRaw<
				{ checks_total: bigint; checks_up: bigint }[]
			>`
				SELECT
					COUNT(h.id)::bigint AS checks_total,
					COUNT(h.id) FILTER (WHERE h.status = ${'up'}::heartbeatstatus)::bigint AS checks_up
				FROM heartbeats h
				WHERE h.monitor_id = ANY(${monitorIds})
					AND h.checked_at >= date_trunc('day', NOW() - (${dayOffset} * INTERVAL '1 day'))
					AND h.checked_at <= (date_trunc('day', NOW() - (${dayOffset} * INTERVAL '1 day')) + INTERVAL '1 day' - INTERVAL '1 microsecond')
			`;

			const checksTotal = Number(dayRows[0]?.checks_total ?? 0n);
			const checksUp = Number(dayRows[0]?.checks_up ?? 0n);
			const uptime =
				checksTotal > 0
					? Number(((checksUp / checksTotal) * 100).toFixed(2))
					: 100;

			const date = new Date();
			date.setUTCDate(date.getUTCDate() - dayOffset);

			history.push({
				date: date.toISOString().slice(0, 10),
				uptime_percentage: uptime,
				checks_total: checksTotal,
				checks_up: checksUp,
			});
			totalUptime += uptime;
		}

		return {
			project_name: project.name,
			period_days: normalizedDays,
			history: history.reverse(),
			average_uptime: Number((totalUptime / normalizedDays).toFixed(2)),
		};
	}
}
