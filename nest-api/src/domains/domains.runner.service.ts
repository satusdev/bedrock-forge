import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DomainsService } from './domains.service';

@Injectable()
export class DomainsRunnerService {
	private readonly logger = new Logger(DomainsRunnerService.name);
	private isProcessing = false;
	private readonly enabled =
		(process.env.DOMAIN_RUNNER_ENABLED ?? 'true').toLowerCase() !== 'false';
	private readonly batchSize = Math.max(
		1,
		Math.min(
			100,
			Number.parseInt(process.env.DOMAIN_RUNNER_BATCH_SIZE ?? '10', 10) || 10,
		),
	);

	constructor(private readonly domainsService: DomainsService) {}

	@Interval(300_000)
	async runDomainMaintenance() {
		if (!this.enabled || this.isProcessing) {
			return;
		}

		this.isProcessing = true;
		let claimedCount = 0;
		let whoisSucceeded = 0;
		let whoisFailed = 0;
		let remindersProcessed = 0;
		let remindersSent = 0;
		let errorDetail: string | null = null;
		try {
			const claims = await this.domainsService.claimWhoisDueDomains(
				this.batchSize,
			);
			claimedCount = claims.length;
			for (const claim of claims) {
				try {
					await this.domainsService.runWhoisRefresh(claim.id);
					whoisSucceeded += 1;
				} catch (error) {
					whoisFailed += 1;
					const detail =
						error instanceof Error
							? error.message
							: 'Unknown domain runner error';
					this.logger.error(
						`Domain ${claim.id} WHOIS refresh failed in runner: ${detail}`,
					);
				}
			}

			try {
				const reminderResult = await this.domainsService.processExpiryReminders(
					this.batchSize * 5,
				);
				remindersProcessed = reminderResult.processed ?? 0;
				remindersSent = reminderResult.reminders_sent ?? 0;
			} catch (error) {
				const detail =
					error instanceof Error
						? error.message
						: 'Unknown reminder runner error';
				this.logger.error(`Domain reminder sweep failed in runner: ${detail}`);
			}
		} catch (error) {
			errorDetail =
				error instanceof Error
					? error.message
					: 'Unknown domain maintenance error';
			this.logger.error(`Domain maintenance run failed: ${errorDetail}`);
		} finally {
			this.domainsService.recordRunnerSnapshot({
				claimed: claimedCount,
				whois_succeeded: whoisSucceeded,
				whois_failed: whoisFailed,
				reminders_processed: remindersProcessed,
				reminders_sent: remindersSent,
				error: errorDetail,
			});
			this.isProcessing = false;
		}
	}
}
