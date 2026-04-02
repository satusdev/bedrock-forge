import { Injectable, Logger } from '@nestjs/common';
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
export class MaintenanceService {
	private readonly logger = new Logger(MaintenanceService.name);

	constructor(private readonly prisma: PrismaService) {}

	@Cron(CronExpression.EVERY_DAY_AT_3AM)
	async runCleanup(): Promise<void> {
		this.logger.log('Starting nightly maintenance cleanup');

		const now = new Date();
		const days90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1_000);
		const days180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1_000);

		const [rt, nl, al, je] = await Promise.all([
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

		this.logger.log(
			`Maintenance complete — deleted: ${rt.count} refresh tokens, ` +
				`${nl.count} notification logs, ${al.count} audit logs, ` +
				`${je.count} job executions`,
		);
	}
}
