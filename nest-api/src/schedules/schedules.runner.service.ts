import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SchedulesService } from './schedules.service';

@Injectable()
export class SchedulesRunnerService {
	private readonly logger = new Logger(SchedulesRunnerService.name);
	private isProcessing = false;
	private readonly enabled =
		(process.env.SCHEDULE_RUNNER_ENABLED ?? 'true').toLowerCase() !== 'false';
	private readonly batchSize = Math.max(
		1,
		Math.min(
			100,
			Number.parseInt(process.env.SCHEDULE_RUNNER_BATCH_SIZE ?? '5', 10) || 5,
		),
	);

	constructor(private readonly schedulesService: SchedulesService) {}

	@Interval(60_000)
	async runDueSchedules() {
		if (!this.enabled || this.isProcessing) {
			return;
		}

		this.isProcessing = true;
		try {
			const claims = await this.schedulesService.claimDueSchedules(
				this.batchSize,
			);
			for (const claim of claims) {
				try {
					await this.schedulesService.runScheduleNow(
						claim.id,
						claim.created_by_id,
					);
				} catch (error) {
					const detail =
						error instanceof Error
							? error.message
							: 'Unknown schedule runner error';
					this.logger.error(`Schedule ${claim.id} failed in runner: ${detail}`);
				}
			}
		} finally {
			this.isProcessing = false;
		}
	}
}
