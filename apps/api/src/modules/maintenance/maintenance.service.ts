import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * MaintenanceService
 *
 * Runs nightly cleanup jobs to prevent unbounded table growth:
 * - Expired / revoked refresh tokens
 * - Notification logs older than 90 days
 * - Audit logs older than 180 days
 * - Completed/failed JobExecution records older than 90 days
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap {
	private readonly logger = new Logger(MaintenanceService.name);

	constructor(private readonly prisma: PrismaService) {}

	/**
	 * On startup, mark any job_executions that are still 'active' as failed.
	 * They were interrupted by a process restart and will never complete.
	 */
	async onApplicationBootstrap(): Promise<void> {
		try {
			const recovered = await this.prisma.jobExecution.updateMany({
				where: { status: 'active' },
				data: {
					status: 'failed',
					last_error: 'Process interrupted — forge was restarted',
					completed_at: new Date(),
				},
			});
			if (recovered.count > 0) {
				this.logger.warn(
					`Startup recovery: marked ${recovered.count} interrupted job(s) as failed`,
				);
			}
		} catch (e) {
			this.logger.error('Startup recovery failed', e);
		}
	}

	@Cron(CronExpression.EVERY_DAY_AT_3AM)
	async runCleanup(): Promise<void> {
		this.logger.log('Starting nightly maintenance cleanup');

		const now = new Date();
		const days90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000);
		const days180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1_000);

		const results = await Promise.allSettled([
			// Expired or revoked refresh tokens
			this.prisma.refreshToken.deleteMany({
				where: {
					OR: [{ expires_at: { lt: now } }, { revoked_at: { not: null } }],
				},
			}),
			// Old notification logs
			this.prisma.notificationLog.deleteMany({
				where: { created_at: { lt: days90 } },
			}),
			// Old audit logs
			this.prisma.auditLog.deleteMany({
				where: { created_at: { lt: days180 } },
			}),
			// Completed / failed job executions — keep 90 days for debugging
			this.prisma.jobExecution.deleteMany({
				where: {
					status: { in: ['completed', 'failed', 'dead_letter'] },
					completed_at: { lt: days90 },
				},
			}),
		]);

		const labels = [
			'refresh tokens',
			'notification logs',
			'audit logs',
			'job executions',
		];
		results.forEach((r, i) => {
			if (r.status === 'fulfilled') {
				this.logger.log(`Maintenance: deleted ${r.value.count} ${labels[i]}`);
			} else {
				this.logger.error(
					`Maintenance: failed to clean ${labels[i]}`,
					r.reason,
				);
			}
		});
	}
}
