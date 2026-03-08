import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { MonitorsService } from './monitors.service';

@Injectable()
export class MonitorsRunnerService {
	private readonly logger = new Logger(MonitorsRunnerService.name);
	private isProcessing = false;
	private readonly enabled =
		(process.env.MONITOR_RUNNER_ENABLED ?? 'true').toLowerCase() !== 'false';
	private readonly batchSize = Math.max(
		1,
		Math.min(
			100,
			Number.parseInt(process.env.MONITOR_RUNNER_BATCH_SIZE ?? '10', 10) || 10,
		),
	);

	constructor(private readonly monitorsService: MonitorsService) {}

	@Interval(60_000)
	async processDueMonitors() {
		if (!this.enabled || this.isProcessing) {
			return;
		}

		this.isProcessing = true;
		let claimedCount = 0;
		let checksSucceeded = 0;
		let checksFailed = 0;
		let errorDetail: string | null = null;
		try {
			const claimed = await this.monitorsService.claimDueMonitors(
				this.batchSize,
			);
			claimedCount = claimed.length;
			for (const monitor of claimed) {
				try {
					await this.monitorsService.runMonitorCheck(monitor.id);
					checksSucceeded += 1;
				} catch (error) {
					checksFailed += 1;
					const detail =
						error instanceof Error
							? error.message
							: 'Unknown monitor runner error';
					this.logger.error(
						`Monitor ${monitor.id} failed in runner: ${detail}`,
					);
				}
			}
		} catch (error) {
			errorDetail =
				error instanceof Error
					? error.message
					: 'Unknown monitor maintenance error';
			this.logger.error(`Monitor maintenance run failed: ${errorDetail}`);
		} finally {
			this.monitorsService.recordRunnerSnapshot({
				claimed: claimedCount,
				checks_succeeded: checksSucceeded,
				checks_failed: checksFailed,
				error: errorDetail,
			});
			this.isProcessing = false;
		}
	}
}
