import { Injectable } from '@nestjs/common';

type TaskStatusRecord = {
	task_id: string;
	status: string;
	message: string;
	progress: number;
	result: unknown;
	started_at: string | null;
	completed_at: string | null;
	updated_at: string;
};

type TaskStatusFallback = {
	status?: string;
	message?: string;
	progress?: number;
	result?: unknown;
	started_at?: string | null;
	completed_at?: string | null;
};

type TaskStatusUpdate = {
	status?: string;
	message?: string;
	progress?: number;
	result?: unknown;
	started_at?: string | null;
	completed_at?: string | null;
};

@Injectable()
export class TaskStatusService {
	private readonly store = new Map<string, TaskStatusRecord>();

	getTaskStatus(taskId: string, fallback: TaskStatusFallback = {}) {
		const existing = this.store.get(taskId);
		if (existing) {
			return existing;
		}

		const now = new Date().toISOString();
		return {
			task_id: taskId,
			status: fallback.status ?? 'pending',
			message: fallback.message ?? 'Task is queued',
			progress: this.normalizeProgress(fallback.progress ?? 0),
			result: fallback.result ?? null,
			started_at: fallback.started_at ?? null,
			completed_at: fallback.completed_at ?? null,
			updated_at: now,
		};
	}

	upsertTaskStatus(taskId: string, update: TaskStatusUpdate) {
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
			status: nextStatus,
			message: update.message ?? existing?.message ?? '',
			progress: this.normalizeProgress(
				update.progress ?? existing?.progress ?? 0,
			),
			result: update.result ?? existing?.result ?? null,
			started_at: startedAt,
			completed_at: completedAt,
			updated_at: now,
		};

		this.store.set(taskId, record);
		return record;
	}

	pruneTerminalStatuses(maxAgeMinutes = 180) {
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

		return removed;
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
