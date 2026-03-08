import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SyncService } from './sync.service';

@Injectable()
export class SyncRunnerService {
	private readonly logger = new Logger(SyncRunnerService.name);
	private isProcessing = false;
	private readonly enabled =
		(process.env.SYNC_RUNNER_ENABLED ?? 'true').toLowerCase() !== 'false';
	private readonly batchSize = Math.max(
		1,
		Math.min(
			100,
			Number.parseInt(process.env.SYNC_RUNNER_BATCH_SIZE ?? '10', 10) || 10,
		),
	);

	constructor(private readonly syncService: SyncService) {}

	@Interval(30_000)
	async processPendingTasks() {
		if (!this.enabled || this.isProcessing) {
			return;
		}

		this.isProcessing = true;
		try {
			const tasks = this.syncService.claimPendingTasks(this.batchSize);
			for (const task of tasks) {
				try {
					this.syncService.processPendingTask(task);
				} catch (error) {
					const detail =
						error instanceof Error
							? error.message
							: 'Unknown sync runner error';
					this.logger.error(
						`Sync task ${task.task_id} failed in runner: ${detail}`,
					);
				}
			}
		} finally {
			this.isProcessing = false;
		}
	}
}
