import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
	backupstoragetype,
	backuptype,
	Prisma,
	schedulefrequency,
	schedulestatus,
} from '@prisma/client';
import { BackupsService } from '../backups/backups.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleCreateDto } from './dto/schedule-create.dto';
import { ScheduleUpdateDto } from './dto/schedule-update.dto';

type DbScheduleRow = {
	id: number;
	name: string;
	description: string | null;
	frequency: string;
	cron_expression: string | null;
	hour: number;
	minute: number;
	day_of_week: number | null;
	day_of_month: number | null;
	timezone: string;
	backup_type: string;
	storage_type: string;
	retention_count: number;
	retention_days: number | null;
	status: string;
	last_run_at: Date | null;
	next_run_at: Date | null;
	project_id: number;
	created_by_id: number;
	environment_id: number | null;
	created_at: Date;
	updated_at: Date;
	celery_task_id: string | null;
};

const scheduleSelect = {
	id: true,
	name: true,
	description: true,
	frequency: true,
	cron_expression: true,
	hour: true,
	minute: true,
	day_of_week: true,
	day_of_month: true,
	timezone: true,
	backup_type: true,
	storage_type: true,
	retention_count: true,
	retention_days: true,
	status: true,
	last_run_at: true,
	next_run_at: true,
	project_id: true,
	created_by_id: true,
	environment_id: true,
	celery_task_id: true,
	created_at: true,
	updated_at: true,
} satisfies Prisma.backup_schedulesSelect;

const scheduleStatuses = new Set<schedulestatus>([
	'active',
	'paused',
	'disabled',
]);

const scheduleFrequencies = new Set<schedulefrequency>([
	'hourly',
	'daily',
	'weekly',
	'monthly',
	'custom',
]);

const backupTypes = new Set<backuptype>(['full', 'database', 'files']);

const backupStorageTypes = new Set<backupstoragetype>([
	'local',
	'google_drive',
	's3',
]);

@Injectable()
export class SchedulesService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly backupsService: BackupsService,
	) {}

	private readonly fallbackOwnerId = 1;
	private readonly scheduleLeaseSeconds = Math.max(
		30,
		Math.min(
			3600,
			Number.parseInt(process.env.SCHEDULE_RUNNER_LEASE_SECONDS ?? '300', 10) ||
				300,
		),
	);
	private readonly scheduleLeaseHeartbeatMs = Math.max(
		1000,
		Math.floor((this.scheduleLeaseSeconds * 1000) / 3),
	);

	private startScheduleLeaseHeartbeat(scheduleId: number, claimToken?: string) {
		if (!claimToken) {
			return () => undefined;
		}

		const timer = setInterval(() => {
			void this.prisma.backup_schedules
				.updateMany({
					where: {
						id: scheduleId,
						status: 'active',
						celery_task_id: claimToken,
					},
					data: {
						updated_at: new Date(),
					},
				})
				.catch(() => undefined);
		}, this.scheduleLeaseHeartbeatMs);

		timer.unref();

		return () => {
			clearInterval(timer);
		};
	}

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private normalizeFrequency(
		value: string | undefined,
		fallback: schedulefrequency,
	) {
		if (!value) {
			return fallback;
		}
		const normalized = value.trim().toLowerCase();
		if (!scheduleFrequencies.has(normalized as schedulefrequency)) {
			throw new BadRequestException({ detail: 'Invalid frequency' });
		}
		return normalized as schedulefrequency;
	}

	private normalizeBackupType(value: string | undefined, fallback: backuptype) {
		if (!value) {
			return fallback;
		}
		const normalized = value.trim().toLowerCase();
		if (!backupTypes.has(normalized as backuptype)) {
			throw new BadRequestException({ detail: 'Invalid backup_type' });
		}
		return normalized as backuptype;
	}

	private normalizeStorageType(
		value: string | undefined,
		fallback: backupstoragetype,
	) {
		if (!value) {
			return fallback;
		}
		const normalized = value.trim().toLowerCase();
		const mapped = normalized === 'gdrive' ? 'google_drive' : normalized;
		if (!backupStorageTypes.has(mapped as backupstoragetype)) {
			throw new BadRequestException({ detail: 'Invalid storage_type' });
		}
		return mapped as backupstoragetype;
	}

	private normalizeStatus(value: string | undefined, fallback: schedulestatus) {
		if (!value) {
			return fallback;
		}
		const normalized = value.trim().toLowerCase();
		if (!scheduleStatuses.has(normalized as schedulestatus)) {
			throw new BadRequestException({ detail: 'Invalid status' });
		}
		return normalized as schedulestatus;
	}

	private calculateNextRunAt(
		schedule: Pick<
			DbScheduleRow,
			| 'frequency'
			| 'hour'
			| 'minute'
			| 'day_of_week'
			| 'day_of_month'
			| 'cron_expression'
		>,
		fromDate = new Date(),
	) {
		const frequency = this.normalizeFrequency(schedule.frequency, 'daily');
		const base = new Date(fromDate);

		if (frequency === 'hourly') {
			const next = new Date(base);
			next.setUTCMinutes(schedule.minute ?? 0, 0, 0);
			if (next <= base) {
				next.setUTCHours(next.getUTCHours() + 1);
			}
			return next;
		}

		if (frequency === 'daily') {
			const next = new Date(base);
			next.setUTCHours(schedule.hour ?? 2, schedule.minute ?? 0, 0, 0);
			if (next <= base) {
				next.setUTCDate(next.getUTCDate() + 1);
			}
			return next;
		}

		if (frequency === 'weekly') {
			const next = new Date(base);
			next.setUTCHours(schedule.hour ?? 2, schedule.minute ?? 0, 0, 0);
			const targetDay = Math.max(0, Math.min(6, schedule.day_of_week ?? 0));
			const currentDay = next.getUTCDay();
			let offset = (targetDay - currentDay + 7) % 7;
			if (offset === 0 && next <= base) {
				offset = 7;
			}
			next.setUTCDate(next.getUTCDate() + offset);
			return next;
		}

		if (frequency === 'monthly') {
			const next = new Date(base);
			next.setUTCHours(schedule.hour ?? 2, schedule.minute ?? 0, 0, 0);
			const targetDay = Math.max(1, Math.min(28, schedule.day_of_month ?? 1));
			next.setUTCDate(targetDay);
			if (next <= base) {
				next.setUTCMonth(next.getUTCMonth() + 1, targetDay);
			}
			return next;
		}

		if (frequency === 'custom' && schedule.cron_expression) {
			const next = new Date(base);
			next.setUTCDate(next.getUTCDate() + 1);
			next.setUTCHours(schedule.hour ?? 2, schedule.minute ?? 0, 0, 0);
			return next;
		}

		const fallback = new Date(base);
		fallback.setUTCDate(fallback.getUTCDate() + 1);
		fallback.setUTCHours(schedule.hour ?? 2, schedule.minute ?? 0, 0, 0);
		return fallback;
	}

	private normalize(row: DbScheduleRow) {
		return {
			id: row.id,
			name: row.name,
			description: row.description,
			frequency: row.frequency,
			cron_expression: row.cron_expression,
			hour: row.hour,
			minute: row.minute,
			day_of_week: row.day_of_week,
			day_of_month: row.day_of_month,
			timezone: row.timezone,
			backup_type: row.backup_type,
			storage_type: row.storage_type,
			retention_count: row.retention_count,
			retention_days: row.retention_days,
			status: row.status,
			last_run_at: row.last_run_at,
			next_run_at: row.next_run_at,
			project_id: row.project_id,
			environment_id: row.environment_id,
			created_at: row.created_at,
			updated_at: row.updated_at,
		};
	}

	private async getScheduleRow(scheduleId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const row = await this.prisma.backup_schedules.findFirst({
			where: {
				id: scheduleId,
				projects: {
					is: {
						owner_id: resolvedOwnerId,
					},
				},
			},
			select: scheduleSelect,
		});
		if (!row) {
			throw new NotFoundException({ detail: 'Schedule not found' });
		}
		return row as DbScheduleRow;
	}

	async listSchedules(query: {
		project_id?: number;
		status?: string;
		page?: number;
		page_size?: number;
		owner_id?: number;
	}) {
		const resolvedOwnerId = this.resolveOwnerId(query.owner_id);
		const pageSize = Math.max(1, Math.min(100, query.page_size ?? 20));
		const page = Math.max(1, query.page ?? 1);
		const offset = (page - 1) * pageSize;
		const normalizedStatus = query.status?.trim().toLowerCase();

		if (
			normalizedStatus &&
			!scheduleStatuses.has(normalizedStatus as schedulestatus)
		) {
			return [];
		}

		const where: Prisma.backup_schedulesWhereInput = {
			projects: {
				is: {
					owner_id: resolvedOwnerId,
				},
			},
		};

		if (typeof query.project_id === 'number') {
			where.project_id = query.project_id;
		}

		if (normalizedStatus) {
			where.status = normalizedStatus as schedulestatus;
		}

		const rows = await this.prisma.backup_schedules.findMany({
			where,
			orderBy: {
				created_at: 'desc',
			},
			skip: offset,
			take: pageSize,
			select: scheduleSelect,
		});

		return rows.map(row => this.normalize(row as DbScheduleRow));
	}

	async getSchedule(scheduleId: number, ownerId?: number) {
		const row = await this.getScheduleRow(scheduleId, ownerId);
		return this.normalize(row);
	}

	async createSchedule(payload: ScheduleCreateDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const project = await this.prisma.projects.findFirst({
			where: {
				id: payload.project_id,
				owner_id: resolvedOwnerId,
			},
			select: { id: true },
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		if (payload.environment_id) {
			const environment = await this.prisma.project_servers.findFirst({
				where: {
					id: payload.environment_id,
					project_id: payload.project_id,
					projects: {
						is: {
							owner_id: resolvedOwnerId,
						},
					},
				},
				select: { id: true },
			});
			if (!environment) {
				throw new NotFoundException({ detail: 'Environment not found' });
			}
		}

		const created = await this.prisma.backup_schedules.create({
			data: {
				name: payload.name,
				description: payload.description ?? null,
				frequency: this.normalizeFrequency(payload.frequency, 'daily'),
				cron_expression: payload.cron_expression ?? null,
				hour: payload.hour ?? 2,
				minute: payload.minute ?? 0,
				day_of_week: payload.day_of_week ?? null,
				day_of_month: payload.day_of_month ?? null,
				timezone: payload.timezone ?? 'UTC',
				backup_type: this.normalizeBackupType(payload.backup_type, 'full'),
				storage_type: this.normalizeStorageType(
					payload.storage_type,
					'google_drive',
				),
				retention_count: payload.retention_count ?? 7,
				retention_days: payload.retention_days ?? null,
				status: 'active',
				project_id: payload.project_id,
				environment_id: payload.environment_id ?? null,
				next_run_at: this.calculateNextRunAt({
					frequency: payload.frequency ?? 'daily',
					hour: payload.hour ?? 2,
					minute: payload.minute ?? 0,
					day_of_week: payload.day_of_week ?? null,
					day_of_month: payload.day_of_month ?? null,
					cron_expression: payload.cron_expression ?? null,
				}),
				created_by_id: resolvedOwnerId,
				updated_at: new Date(),
			},
			select: scheduleSelect,
		});

		return this.normalize(created as DbScheduleRow);
	}

	async updateSchedule(
		scheduleId: number,
		payload: ScheduleUpdateDto,
		ownerId?: number,
	) {
		const existing = await this.getScheduleRow(scheduleId, ownerId);
		const resolvedOwnerId = this.resolveOwnerId(ownerId);

		if (payload.environment_id) {
			const environment = await this.prisma.project_servers.findFirst({
				where: {
					id: payload.environment_id,
					project_id: existing.project_id,
					projects: {
						is: {
							owner_id: resolvedOwnerId,
						},
					},
				},
				select: { id: true },
			});
			if (!environment) {
				throw new NotFoundException({ detail: 'Environment not found' });
			}
		}

		await this.prisma.backup_schedules.update({
			where: { id: scheduleId },
			data: {
				name: payload.name ?? existing.name,
				environment_id: payload.environment_id ?? existing.environment_id,
				description: payload.description ?? existing.description,
				frequency: this.normalizeFrequency(
					payload.frequency,
					existing.frequency as schedulefrequency,
				),
				cron_expression: payload.cron_expression ?? existing.cron_expression,
				hour: payload.hour ?? existing.hour,
				minute: payload.minute ?? existing.minute,
				day_of_week: payload.day_of_week ?? existing.day_of_week,
				day_of_month: payload.day_of_month ?? existing.day_of_month,
				timezone: payload.timezone ?? existing.timezone,
				backup_type: this.normalizeBackupType(
					payload.backup_type,
					existing.backup_type as backuptype,
				),
				storage_type: this.normalizeStorageType(
					payload.storage_type,
					existing.storage_type as backupstoragetype,
				),
				retention_count: payload.retention_count ?? existing.retention_count,
				retention_days: payload.retention_days ?? existing.retention_days,
				status: this.normalizeStatus(
					payload.status,
					existing.status as schedulestatus,
				),
				next_run_at:
					this.normalizeStatus(
						payload.status,
						existing.status as schedulestatus,
					) === 'active'
						? this.calculateNextRunAt({
								frequency: payload.frequency ?? existing.frequency,
								hour: payload.hour ?? existing.hour,
								minute: payload.minute ?? existing.minute,
								day_of_week: payload.day_of_week ?? existing.day_of_week,
								day_of_month: payload.day_of_month ?? existing.day_of_month,
								cron_expression:
									payload.cron_expression ?? existing.cron_expression,
							})
						: null,
				updated_at: new Date(),
			},
		});

		const updated = await this.getScheduleRow(scheduleId, ownerId);
		return this.normalize(updated);
	}

	async deleteSchedule(scheduleId: number, ownerId?: number) {
		await this.getScheduleRow(scheduleId, ownerId);
		await this.prisma.backup_schedules.delete({
			where: { id: scheduleId },
		});
	}

	async pauseSchedule(scheduleId: number, ownerId?: number) {
		return this.updateSchedule(scheduleId, { status: 'paused' }, ownerId);
	}

	async resumeSchedule(scheduleId: number, ownerId?: number) {
		return this.updateSchedule(scheduleId, { status: 'active' }, ownerId);
	}

	async runScheduleNow(
		scheduleId: number,
		ownerId?: number,
		claimToken?: string,
	) {
		const schedule = await this.getScheduleRow(scheduleId, ownerId);
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const startedAt = new Date();
		const runName = `${schedule.name} - ${startedAt.toISOString()}`;

		if (claimToken && schedule.celery_task_id !== claimToken) {
			throw new BadRequestException({
				detail: 'Schedule lease token is invalid or expired',
			});
		}

		const stopLeaseHeartbeat = this.startScheduleLeaseHeartbeat(
			scheduleId,
			claimToken,
		);

		try {
			const backupType = this.normalizeBackupType(schedule.backup_type, 'full');
			const storageType = this.normalizeStorageType(
				schedule.storage_type,
				'google_drive',
			);

			const createdBackup = await this.backupsService.createBackup(
				{
					project_id: schedule.project_id,
					environment_id: schedule.environment_id ?? undefined,
					backup_type: backupType,
					storage_type: storageType,
					name: runName,
					notes: `Triggered by schedule ${schedule.id}`,
				},
				resolvedOwnerId,
			);

			const execution = await this.backupsService.runBackup(
				createdBackup.backup_id,
				{
					project_id: schedule.project_id,
					environment_id: schedule.environment_id ?? undefined,
					backup_type: backupType,
					task_id: createdBackup.task_id,
				},
				resolvedOwnerId,
			);

			if (claimToken) {
				const updated = await this.prisma.backup_schedules.updateMany({
					where: {
						id: scheduleId,
						status: 'active',
						celery_task_id: claimToken,
					},
					data: {
						last_run_at: startedAt,
						next_run_at: this.calculateNextRunAt(schedule, startedAt),
						last_run_success: true,
						last_run_error: null,
						celery_task_id: null,
						run_count: { increment: 1 },
						updated_at: new Date(),
					},
				});

				if (updated.count !== 1) {
					throw new BadRequestException({
						detail: 'Schedule lease expired before completion',
					});
				}
			} else {
				await this.prisma.backup_schedules.update({
					where: { id: scheduleId },
					data: {
						last_run_at: startedAt,
						next_run_at: this.calculateNextRunAt(schedule, startedAt),
						last_run_success: true,
						last_run_error: null,
						celery_task_id: null,
						run_count: { increment: 1 },
						updated_at: new Date(),
					},
				});
			}

			return {
				task_id: execution.task_id,
				status: 'accepted',
				message: `Schedule '${schedule.name}' executed`,
				schedule_id: scheduleId,
				backup_id: createdBackup.backup_id,
			};
		} catch (error) {
			const detail =
				error instanceof Error ? error.message : 'Schedule execution failed';
			if (claimToken) {
				await this.prisma.backup_schedules.updateMany({
					where: {
						id: scheduleId,
						status: 'active',
						celery_task_id: claimToken,
					},
					data: {
						last_run_at: startedAt,
						next_run_at: this.calculateNextRunAt(schedule, startedAt),
						last_run_success: false,
						last_run_error: detail,
						celery_task_id: null,
						run_count: { increment: 1 },
						failure_count: { increment: 1 },
						updated_at: new Date(),
					},
				});
			} else {
				await this.prisma.backup_schedules.update({
					where: { id: scheduleId },
					data: {
						last_run_at: startedAt,
						next_run_at: this.calculateNextRunAt(schedule, startedAt),
						last_run_success: false,
						last_run_error: detail,
						celery_task_id: null,
						run_count: { increment: 1 },
						failure_count: { increment: 1 },
						updated_at: new Date(),
					},
				});
			}
			throw error;
		} finally {
			stopLeaseHeartbeat();
		}
	}

	async claimDueSchedules(limit = 5) {
		const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
		const now = new Date();
		const staleLeaseThreshold = new Date(
			now.getTime() - this.scheduleLeaseSeconds * 1000,
		);
		const rows = await this.prisma.backup_schedules.findMany({
			where: {
				status: 'active',
				OR: [{ next_run_at: null }, { next_run_at: { lte: now } }],
				AND: [
					{
						OR: [
							{ celery_task_id: null },
							{ updated_at: { lt: staleLeaseThreshold } },
						],
					},
				],
			},
			orderBy: [{ next_run_at: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
			take: safeLimit,
			select: { id: true, created_by_id: true },
		});

		if (rows.length === 0) {
			return [];
		}

		const claimed: Array<{
			id: number;
			created_by_id: number;
			claim_token: string;
		}> = [];

		for (const row of rows) {
			const claimToken = `schedule-lease-${randomUUID()}`;
			const updateResult = await this.prisma.backup_schedules.updateMany({
				where: {
					id: row.id,
					status: 'active',
					OR: [
						{ celery_task_id: null },
						{ updated_at: { lt: staleLeaseThreshold } },
					],
				},
				data: {
					celery_task_id: claimToken,
					updated_at: now,
				},
			});

			if (updateResult.count === 1) {
				claimed.push({
					id: row.id,
					created_by_id: row.created_by_id,
					claim_token: claimToken,
				});
			}
		}

		return claimed;
	}
}
