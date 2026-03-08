import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { TaskStatusService } from './task-status.service';

@Injectable()
export class TaskStatusRunnerService {
	private readonly logger = new Logger(TaskStatusRunnerService.name);
	private isProcessing = false;
	private readonly enabled =
		(process.env.TASK_STATUS_RUNNER_ENABLED ?? 'true').toLowerCase() !==
		'false';
	private readonly maxAgeMinutes = Math.max(
		1,
		Math.min(
			7 * 24 * 60,
			Number.parseInt(process.env.TASK_STATUS_RETENTION_MINUTES ?? '180', 10) ||
				180,
		),
	);

	constructor(private readonly taskStatusService: TaskStatusService) {}

	@Interval(60_000)
	runCleanup() {
		if (!this.enabled || this.isProcessing) {
			return;
		}

		this.isProcessing = true;
		try {
			const removed = this.taskStatusService.pruneTerminalStatuses(
				this.maxAgeMinutes,
			);
			if (removed > 0) {
				this.logger.log(`Pruned ${removed} terminal task status record(s)`);
			}
		} finally {
			this.isProcessing = false;
		}
	}
}
