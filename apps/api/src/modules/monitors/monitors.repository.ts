import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface MonitorCreateData {
	environment_id: bigint;
	interval_seconds: number;
	enabled?: boolean;
	check_ssl?: boolean;
	ssl_alert_days?: number | null;
	check_dns?: boolean;
	check_keyword?: boolean;
	keyword?: string;
}

export interface MonitorUpdateData {
	interval_seconds?: number;
	enabled?: boolean;
	check_ssl?: boolean;
	ssl_alert_days?: number | null;
	check_dns?: boolean;
	check_keyword?: boolean;
	keyword?: string;
}

@Injectable()
export class MonitorsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findAll(opts: { page: number; limit: number; search?: string }) {
		const skip = (opts.page - 1) * opts.limit;
		const where: Prisma.MonitorWhereInput = opts.search
			? {
					environment: {
						url: { contains: opts.search, mode: 'insensitive' },
					},
				}
			: {};

		const [items, total] = await Promise.all([
			this.prisma.monitor.findMany({
				where,
				orderBy: { created_at: 'desc' },
				skip,
				take: opts.limit,
				include: {
					environment: { select: { id: true, url: true, type: true } },
				},
			}),
			this.prisma.monitor.count({ where }),
		]);
		return { items, total };
	}

	findById(id: bigint) {
		return this.prisma.monitor.findUnique({
			where: { id },
			include: {
				environment: { select: { id: true, url: true, type: true } },
				monitor_results: { orderBy: { checked_at: 'desc' }, take: 100 },
			},
		});
	}

	create(data: MonitorCreateData) {
		return this.prisma.monitor.create({
			data: {
				environment_id: data.environment_id,
				interval_seconds: data.interval_seconds,
				...(data.enabled !== undefined && { enabled: data.enabled }),
				...(data.check_ssl !== undefined && { check_ssl: data.check_ssl }),
				...(data.ssl_alert_days !== undefined && {
					ssl_alert_days: data.ssl_alert_days,
				}),
				...(data.check_dns !== undefined && { check_dns: data.check_dns }),
				...(data.check_keyword !== undefined && {
					check_keyword: data.check_keyword,
				}),
				...(data.keyword !== undefined && { keyword: data.keyword }),
			},
		});
	}

	update(id: bigint, data: MonitorUpdateData) {
		return this.prisma.monitor.update({
			where: { id },
			data: {
				...(data.interval_seconds !== undefined && {
					interval_seconds: data.interval_seconds,
				}),
				...(data.enabled !== undefined && { enabled: data.enabled }),
				...(data.check_ssl !== undefined && { check_ssl: data.check_ssl }),
				...(data.ssl_alert_days !== undefined && {
					ssl_alert_days: data.ssl_alert_days,
				}),
				...(data.check_dns !== undefined && { check_dns: data.check_dns }),
				...(data.check_keyword !== undefined && {
					check_keyword: data.check_keyword,
				}),
				...(data.keyword !== undefined && { keyword: data.keyword }),
			},
		});
	}

	delete(id: bigint) {
		return this.prisma.monitor.delete({ where: { id } });
	}

	// ── Monitor logs (state-transition history) ───────────────────────────────

	createLog(data: {
		monitor_id: bigint;
		event_type: Prisma.MonitorLogCreateInput['event_type'];
		status_code?: number | null;
		response_ms?: number | null;
		message?: string | null;
	}) {
		return this.prisma.monitorLog.create({
			data: {
				monitor_id: data.monitor_id,
				event_type: data.event_type,
				...(data.status_code !== undefined && {
					status_code: data.status_code,
				}),
				...(data.response_ms !== undefined && {
					response_ms: data.response_ms,
				}),
				...(data.message !== undefined && { message: data.message }),
			},
		});
	}

	/** Resolve the latest open DOWN log for a monitor (set resolved_at + duration). */
	async resolveLog(monitorId: bigint) {
		const openLog = await this.prisma.monitorLog.findFirst({
			where: {
				monitor_id: monitorId,
				event_type: 'down',
				resolved_at: null,
			},
			orderBy: { occurred_at: 'desc' },
		});
		if (!openLog) return;

		const resolvedAt = new Date();
		const durationSeconds = Math.floor(
			(resolvedAt.getTime() - openLog.occurred_at.getTime()) / 1000,
		);
		return this.prisma.monitorLog.update({
			where: { id: openLog.id },
			data: { resolved_at: resolvedAt, duration_seconds: durationSeconds },
		});
	}

	findLogs(monitorId: bigint, opts: { skip?: number; take?: number } = {}) {
		return this.prisma.monitorLog.findMany({
			where: { monitor_id: monitorId },
			orderBy: { occurred_at: 'desc' },
			skip: opts.skip ?? 0,
			take: opts.take ?? 50,
		});
	}

	countLogs(monitorId: bigint) {
		return this.prisma.monitorLog.count({ where: { monitor_id: monitorId } });
	}

	findResults(monitorId: bigint, opts: { skip?: number; take?: number } = {}) {
		return this.prisma.monitorResult.findMany({
			where: { monitor_id: monitorId },
			orderBy: { checked_at: 'desc' },
			skip: opts.skip ?? 0,
			take: opts.take ?? 100,
		});
	}

	countResults(monitorId: bigint) {
		return this.prisma.monitorResult.count({
			where: { monitor_id: monitorId },
		});
	}
}
