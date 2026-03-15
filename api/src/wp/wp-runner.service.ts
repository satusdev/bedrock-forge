import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { WpRepository } from './wp.repository';
import { WpService } from './wp.service';

@Injectable()
export class WpRunnerService {
	private readonly logger = new Logger(WpRunnerService.name);

	private readonly enabled =
		(process.env.WP_SCAN_RUNNER_ENABLED ?? 'true').toLowerCase() !== 'false';

	private readonly batchSize = Math.max(
		1,
		Math.min(
			20,
			Number.parseInt(process.env.WP_SCAN_RUNNER_BATCH_SIZE ?? '3', 10) || 3,
		),
	);

	private readonly staleHours = Math.max(
		1,
		Number.parseInt(process.env.WP_SCAN_STALE_HOURS ?? '6', 10) || 6,
	);

	/** IDs currently being scanned — prevents duplicate concurrent scans. */
	private readonly inFlight = new Set<number>();

	private isProcessing = false;

	constructor(
		private readonly wpService: WpService,
		private readonly wpRepository: WpRepository,
	) {}

	@Interval(300_000) // 5 minutes — override with WP_SCAN_RUNNER_INTERVAL_MS logic via setInterval if needed
	async runStaleSiteScans() {
		if (!this.enabled || this.isProcessing) {
			return;
		}

		this.isProcessing = true;
		try {
			const staleIds = await this.wpRepository.getStaleProjectServerIds(
				this.batchSize,
				this.staleHours,
			);

			const candidates = staleIds.filter(id => !this.inFlight.has(id));
			if (candidates.length === 0) {
				return;
			}

			this.logger.log(
				`WP runner: scanning ${candidates.length} stale project-server(s)`,
			);

			await Promise.allSettled(
				candidates.map(async id => {
					this.inFlight.add(id);
					try {
						await this.wpService.triggerSiteScanForRunner(id);
					} catch (error) {
						const detail =
							error instanceof Error ? error.message : String(error);
						this.logger.warn(
							`WP runner: scan failed for project_server ${id}: ${detail}`,
						);
					} finally {
						this.inFlight.delete(id);
					}
				}),
			);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			this.logger.error(`WP runner: unexpected error: ${detail}`);
		} finally {
			this.isProcessing = false;
		}
	}
}
