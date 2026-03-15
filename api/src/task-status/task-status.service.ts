import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TaskStatusRecord = {
	task_id: string;
	project_id?: number | null;
	task_kind?: string | null;
	category?: string | null;
	status: string;
	message: string;
	progress: number;
	result: unknown;
	logs: string;
	started_at: string | null;
	completed_at: string | null;
	updated_at: string;
};

type TaskStatusFallback = {
	project_id?: number | null;
	task_kind?: string | null;
	category?: string | null;
	status?: string;
	message?: string;
	progress?: number;
	result?: unknown;
	logs?: string;
	started_at?: string | null;
	completed_at?: string | null;
};

type TaskStatusUpdate = {
	project_id?: number | null;
	task_kind?: string | null;
	category?: string | null;
	status?: string;
	message?: string;
	progress?: number;
	result?: unknown;
	logs?: string;
	started_at?: string | null;
	completed_at?: string | null;
};

@Injectable()
export class TaskStatusService {
	private readonly store = new Map<string, TaskStatusRecord>();

	constructor(
		@Optional() private readonly prisma: PrismaService | null = null,
	) {}

	async getTaskStatus(taskId: string, fallback: TaskStatusFallback = {}) {
		const existing = this.store.get(taskId);
		if (existing) {
			return existing;
		}

		if ((fallback.category ?? '').toLowerCase() === 'sync') {
			const persisted = await this.loadPersistedSyncTask(taskId);
			if (persisted) {
				this.store.set(taskId, persisted);
				return persisted;
			}
		}

		const now = new Date().toISOString();
		return {
			task_id: taskId,
			project_id: fallback.project_id ?? null,
			task_kind: fallback.task_kind ?? null,
			category: fallback.category ?? null,
			status: fallback.status ?? 'pending',
			message: fallback.message ?? 'Task is queued',
			progress: this.normalizeProgress(fallback.progress ?? 0),
			result: fallback.result ?? null,
			logs: fallback.logs ?? '',
			started_at: fallback.started_at ?? null,
			completed_at: fallback.completed_at ?? null,
			updated_at: now,
		};
	}

	async upsertTaskStatus(taskId: string, update: TaskStatusUpdate) {
		const now = new Date().toISOString();
		const existing = this.store.get(taskId);
		const nextStatus = update.status ?? existing?.status ?? 'pending';
		const startedAt =
			update.started_at !== undefined
				? update.started_at
				: nextStatus === 'running'
					? (existing?.started_at ?? now)
					: (existing?.started_at ?? null);
		const completedAt =
			update.completed_at !== undefined
				? update.completed_at
				: ['completed', 'failed'].includes(nextStatus)
					? (existing?.completed_at ?? now)
					: (existing?.completed_at ?? null);

		const record: TaskStatusRecord = {
			task_id: taskId,
			project_id: update.project_id ?? existing?.project_id ?? null,
			task_kind: update.task_kind ?? existing?.task_kind ?? null,
			category: update.category ?? existing?.category ?? null,
			status: nextStatus,
			message: update.message ?? existing?.message ?? '',
			progress: this.normalizeProgress(
				update.progress ?? existing?.progress ?? 0,
			),
			result: update.result ?? existing?.result ?? null,
			logs: update.logs ?? existing?.logs ?? '',
			started_at: startedAt,
			completed_at: completedAt,
			updated_at: now,
		};

		this.store.set(taskId, record);

		if ((record.category ?? '').toLowerCase() === 'sync') {
			await this.persistSyncTask(record);
		}

		return record;
	}

	async pruneTerminalStatuses(maxAgeMinutes = 180) {
		const safeMaxAgeMinutes = Math.max(
			1,
			Math.min(7 * 24 * 60, Math.trunc(maxAgeMinutes)),
		);
		const threshold = Date.now() - safeMaxAgeMinutes * 60_000;
		let removed = 0;

		for (const [taskId, record] of this.store.entries()) {
			if (!['completed', 'failed'].includes(record.status)) {
				continue;
			}

			const updatedAt = Date.parse(record.updated_at);
			if (!Number.isFinite(updatedAt) || updatedAt > threshold) {
				continue;
			}

			this.store.delete(taskId);
			removed += 1;
		}

		if (this.prisma) {
			await this.prisma.$executeRaw`
				DELETE FROM sync_task_statuses
				WHERE status IN ('completed', 'failed')
				AND updated_at < NOW() - (${safeMaxAgeMinutes} * INTERVAL '1 minute')
			`;
		}

		return removed;
	}

	async listSyncTaskStatuses(projectId: number, limit = 20) {
		const normalizedLimit = Number.isFinite(limit) ? limit : 20;
		const safeLimit = Math.max(1, Math.min(200, Math.trunc(normalizedLimit)));

		if (!this.prisma) {
			return Array.from(this.store.values())
				.filter(
					record =>
						(record.category ?? '').toLowerCase() === 'sync' &&
						record.project_id === projectId,
				)
				.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
				.slice(0, safeLimit);
		}

		const rows = await this.prisma.$queryRaw<
			{
				task_id: string;
				project_id: number | null;
				task_kind: string | null;
				status: string;
				message: string;
				progress: number;
				result: unknown;
				logs: string | null;
				started_at: Date | null;
				completed_at: Date | null;
				updated_at: Date;
			}[]
		>`
			SELECT
				task_id,
				project_id,
				task_kind,
				status,
				message,
				progress,
				result,
				logs,
				started_at,
				completed_at,
				updated_at
			FROM sync_task_statuses
			WHERE project_id = ${projectId}
			ORDER BY updated_at DESC
			LIMIT ${safeLimit}
		`;

		return rows.map(
			row =>
				({
					task_id: row.task_id,
					project_id: row.project_id,
					task_kind: row.task_kind,
					category: 'sync',
					status: row.status,
					message: row.message,
					progress: this.normalizeProgress(row.progress),
					result: row.result ?? null,
					logs: row.logs ?? '',
					started_at: row.started_at?.toISOString() ?? null,
					completed_at: row.completed_at?.toISOString() ?? null,
					updated_at: row.updated_at.toISOString(),
				}) satisfies TaskStatusRecord,
		);
	}

	private async loadPersistedSyncTask(taskId: string) {
		if (!this.prisma) {
			return null;
		}

		const rows = await this.prisma.$queryRaw<
			{
				task_id: string;
				project_id: number | null;
				task_kind: string | null;
				status: string;
				message: string;
				progress: number;
				result: unknown;
				logs: string | null;
				started_at: Date | null;
				completed_at: Date | null;
				updated_at: Date;
			}[]
		>`
			SELECT
				task_id,
				project_id,
				task_kind,
				status,
				message,
				progress,
				result,
				logs,
				started_at,
				completed_at,
				updated_at
			FROM sync_task_statuses
			WHERE task_id = ${taskId}
			LIMIT 1
		`;

		const row = rows[0];
		if (!row) {
			return null;
		}

		return {
			task_id: row.task_id,
			project_id: row.project_id,
			task_kind: row.task_kind,
			category: 'sync',
			status: row.status,
			message: row.message,
			progress: this.normalizeProgress(row.progress),
			result: row.result ?? null,
			logs: row.logs ?? '',
			started_at: row.started_at?.toISOString() ?? null,
			completed_at: row.completed_at?.toISOString() ?? null,
			updated_at: row.updated_at.toISOString(),
		} satisfies TaskStatusRecord;
	}

	private async persistSyncTask(record: TaskStatusRecord) {
		if (!this.prisma) {
			return;
		}

		const startedAt = record.started_at ? new Date(record.started_at) : null;
		const completedAt = record.completed_at
			? new Date(record.completed_at)
			: null;
		const updatedAt = new Date(record.updated_at);

		await this.prisma.$executeRaw`
			INSERT INTO sync_task_statuses (
				task_id,
				project_id,
				task_kind,
				status,
				message,
				progress,
				result,
				logs,
				started_at,
				completed_at,
				updated_at
			)
			VALUES (
				${record.task_id},
				${record.project_id ?? null},
				${record.task_kind ?? null},
				${record.status},
				${record.message},
				${record.progress},
				${record.result ?? null},
				${record.logs},
				${startedAt},
				${completedAt},
				${updatedAt}
			)
			ON CONFLICT (task_id)
			DO UPDATE SET
				project_id = EXCLUDED.project_id,
				task_kind = EXCLUDED.task_kind,
				status = EXCLUDED.status,
				message = EXCLUDED.message,
				progress = EXCLUDED.progress,
				result = EXCLUDED.result,
				logs = EXCLUDED.logs,
				started_at = EXCLUDED.started_at,
				completed_at = EXCLUDED.completed_at,
				updated_at = EXCLUDED.updated_at
		`;
	}

	private normalizeProgress(progress: number) {
		if (Number.isNaN(progress)) {
			return 0;
		}
		if (progress < 0) {
			return 0;
		}
		if (progress > 100) {
			return 100;
		}
		return progress;
	}
}
