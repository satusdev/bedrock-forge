import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SslService } from './ssl.service';

@Injectable()
export class SslRunnerService {
	private readonly logger = new Logger(SslRunnerService.name);
	private isProcessing = false;
	private readonly enabled =
		(process.env.SSL_RUNNER_ENABLED ?? 'true').toLowerCase() !== 'false';
	private readonly batchSize = Math.max(
		1,
		Math.min(
			100,
			Number.parseInt(process.env.SSL_RUNNER_BATCH_SIZE ?? '5', 10) || 5,
		),
	);

	constructor(private readonly sslService: SslService) {}

	@Interval(300_000)
	async runDueRenewals() {
		if (!this.enabled || this.isProcessing) {
			return;
		}

		this.isProcessing = true;
		try {
			const claims = await this.sslService.claimDueRenewals(this.batchSize);
			for (const claim of claims) {
				try {
					await this.sslService.runAutoRenewal(claim.id);
				} catch (error) {
					const detail =
						error instanceof Error ? error.message : 'Unknown SSL runner error';
					this.logger.error(
						`Certificate ${claim.id} renewal failed in runner: ${detail}`,
					);
				}
			}
		} finally {
			this.isProcessing = false;
		}
	}
}
