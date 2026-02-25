import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
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
	created_at: Date;
	updated_at: Date;
};

@Injectable()
export class SchedulesService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
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
			created_at: row.created_at,
			updated_at: row.updated_at,
		};
	}

	private async getScheduleRow(scheduleId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbScheduleRow[]>`
			SELECT
				id,
				name,
				description,
				frequency,
				cron_expression,
				hour,
				minute,
				day_of_week,
				day_of_month,
				timezone,
				backup_type,
				storage_type,
				retention_count,
				retention_days,
				status,
				last_run_at,
				next_run_at,
				project_id,
				created_at,
				updated_at
			FROM backup_schedules bs
			JOIN projects p ON p.id = bs.project_id
			WHERE bs.id = ${scheduleId}
				AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const row = rows[0];
		if (!row) {
			throw new NotFoundException({ detail: 'Schedule not found' });
		}
		return row;
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

		const rows = await this.prisma.$queryRaw<DbScheduleRow[]>`
			SELECT
				id,
				name,
				description,
				frequency,
				cron_expression,
				hour,
				minute,
				day_of_week,
				day_of_month,
				timezone,
				backup_type,
				storage_type,
				retention_count,
				retention_days,
				status,
				last_run_at,
				next_run_at,
				project_id,
				created_at,
				updated_at
			FROM backup_schedules bs
			JOIN projects p ON p.id = bs.project_id
			WHERE
				(${query.project_id ?? null}::int IS NULL OR bs.project_id = ${query.project_id ?? null})
				AND (${query.status ?? null}::text IS NULL OR bs.status::text = ${query.status ?? null})
				AND p.owner_id = ${resolvedOwnerId}
			ORDER BY bs.created_at DESC
			OFFSET ${offset}
			LIMIT ${pageSize}
		`;

		return rows.map(row => this.normalize(row));
	}

	async getSchedule(scheduleId: number, ownerId?: number) {
		const row = await this.getScheduleRow(scheduleId, ownerId);
		return this.normalize(row);
	}

	async createSchedule(payload: ScheduleCreateDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const projectRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM projects
			WHERE id = ${payload.project_id} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		if (!projectRows[0]) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const insertRows = await this.prisma.$queryRaw<DbScheduleRow[]>`
			INSERT INTO backup_schedules (
				name,
				description,
				frequency,
				cron_expression,
				hour,
				minute,
				day_of_week,
				day_of_month,
				timezone,
				backup_type,
				storage_type,
				retention_count,
				retention_days,
				status,
				project_id,
				created_by_id,
				updated_at
			)
			VALUES (
				${payload.name},
				${payload.description ?? null},
				${payload.frequency ?? 'daily'}::schedulefrequency,
				${payload.cron_expression ?? null},
				${payload.hour ?? 2},
				${payload.minute ?? 0},
				${payload.day_of_week ?? null},
				${payload.day_of_month ?? null},
				${payload.timezone ?? 'UTC'},
				${payload.backup_type ?? 'full'}::backuptype,
				${payload.storage_type ?? 'google_drive'}::backupstoragetype,
				${payload.retention_count ?? 7},
				${payload.retention_days ?? null},
				${'active'}::schedulestatus,
				${payload.project_id},
				${resolvedOwnerId},
				NOW()
			)
			RETURNING id, name, description, frequency, cron_expression, hour, minute, day_of_week, day_of_month, timezone, backup_type, storage_type, retention_count, retention_days, status, last_run_at, next_run_at, project_id, created_at, updated_at
		`;

		return this.normalize(insertRows[0] as DbScheduleRow);
	}

	async updateSchedule(
		scheduleId: number,
		payload: ScheduleUpdateDto,
		ownerId?: number,
	) {
		const existing = await this.getScheduleRow(scheduleId, ownerId);
		await this.prisma.$executeRaw`
			UPDATE backup_schedules
			SET
				name = ${payload.name ?? existing.name},
				description = ${payload.description ?? existing.description},
				frequency = ${payload.frequency ?? existing.frequency}::schedulefrequency,
				cron_expression = ${payload.cron_expression ?? existing.cron_expression},
				hour = ${payload.hour ?? existing.hour},
				minute = ${payload.minute ?? existing.minute},
				day_of_week = ${payload.day_of_week ?? existing.day_of_week},
				day_of_month = ${payload.day_of_month ?? existing.day_of_month},
				timezone = ${payload.timezone ?? existing.timezone},
				backup_type = ${payload.backup_type ?? existing.backup_type}::backuptype,
				storage_type = ${payload.storage_type ?? existing.storage_type}::backupstoragetype,
				retention_count = ${payload.retention_count ?? existing.retention_count},
				retention_days = ${payload.retention_days ?? existing.retention_days},
				status = ${payload.status ?? existing.status}::schedulestatus,
				updated_at = NOW()
			WHERE id = ${scheduleId} AND project_id = ${existing.project_id}
		`;

		const updated = await this.getScheduleRow(scheduleId, ownerId);
		return this.normalize(updated);
	}

	async deleteSchedule(scheduleId: number, ownerId?: number) {
		const existing = await this.getScheduleRow(scheduleId, ownerId);
		await this.prisma.$executeRaw`
			DELETE FROM backup_schedules
			WHERE id = ${scheduleId} AND project_id = ${existing.project_id}
		`;
	}

	async pauseSchedule(scheduleId: number, ownerId?: number) {
		return this.updateSchedule(scheduleId, { status: 'paused' }, ownerId);
	}

	async resumeSchedule(scheduleId: number, ownerId?: number) {
		return this.updateSchedule(scheduleId, { status: 'active' }, ownerId);
	}

	async runScheduleNow(scheduleId: number, ownerId?: number) {
		const schedule = await this.getScheduleRow(scheduleId, ownerId);
		return {
			task_id: randomUUID(),
			status: 'accepted',
			message: `Schedule '${schedule.name}' queued for immediate run`,
			schedule_id: scheduleId,
		};
	}
}
