import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SubscriptionsService } from './subscriptions.service';

@Injectable()
export class SubscriptionsRunnerService {
	private readonly logger = new Logger(SubscriptionsRunnerService.name);
	private isProcessing = false;
	private readonly enabled =
		(process.env.SUBSCRIPTION_RUNNER_ENABLED ?? 'true').toLowerCase() !==
		'false';
	private readonly batchSize = Math.max(
		1,
		Math.min(
			100,
			Number.parseInt(process.env.SUBSCRIPTION_RUNNER_BATCH_SIZE ?? '5', 10) ||
				5,
		),
	);

	constructor(private readonly subscriptionsService: SubscriptionsService) {}

	@Interval(300_000)
	async runSubscriptionMaintenance() {
		if (!this.enabled || this.isProcessing) {
			return;
		}

		this.isProcessing = true;
		let claimedCount = 0;
		let renewalsSucceeded = 0;
		let renewalsFailed = 0;
		let remindersSent = 0;
		let errorDetail: string | null = null;
		try {
			const claims = await this.subscriptionsService.claimDueAutoRenewals(
				this.batchSize,
			);
			claimedCount = claims.length;
			for (const claim of claims) {
				try {
					await this.subscriptionsService.processAutoRenewal(claim.id);
					renewalsSucceeded += 1;
				} catch (error) {
					renewalsFailed += 1;
					const detail =
						error instanceof Error
							? error.message
							: 'Unknown subscription runner error';
					this.logger.error(
						`Subscription ${claim.id} renewal failed in runner: ${detail}`,
					);
				}
			}

			try {
				const reminders =
					await this.subscriptionsService.processRenewalReminders(
						this.batchSize * 5,
					);
				remindersSent = reminders.reminders_sent ?? 0;
			} catch (error) {
				const detail =
					error instanceof Error
						? error.message
						: 'Unknown reminder runner error';
				this.logger.error(
					`Subscription reminder sweep failed in runner: ${detail}`,
				);
			}
		} catch (error) {
			errorDetail =
				error instanceof Error
					? error.message
					: 'Unknown subscription maintenance error';
			this.logger.error(`Subscription maintenance run failed: ${errorDetail}`);
		} finally {
			this.subscriptionsService.recordRunnerSnapshot({
				claimed: claimedCount,
				renewals_succeeded: renewalsSucceeded,
				renewals_failed: renewalsFailed,
				reminders_sent: remindersSent,
				error: errorDetail,
			});
			this.isProcessing = false;
		}
	}
}
