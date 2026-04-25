import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';

interface NotificationJob {
	eventType: string;
	payload: Record<string, unknown>;
}

// concurrency=3: Slack API calls are lightweight network I/O.
@Processor(QUEUES.NOTIFICATIONS, { concurrency: 3, lockDuration: 30_000 })
export class NotificationProcessor extends WorkerHost {
	private readonly logger = new Logger(NotificationProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly encryption: EncryptionService,
	) {
		super();
	}

	async process(job: Job<NotificationJob>) {
		if (job.name !== JOB_TYPES.NOTIFICATION_SEND) return;

		const { eventType, payload } = job.data;
		this.logger.debug(`Dispatching notification for event: ${eventType}`);

		// Always create in-app notifications for alert events, regardless of Slack config
		await this.createInAppNotification(eventType, payload);

		const channels = await this.prisma.notificationChannel.findMany({
			where: {
				active: true,
				events: { has: eventType },
			},
		});

		if (channels.length === 0) return;

		const { WebClient } = await import('@slack/web-api');

		for (const channel of channels) {
			let status: 'sent' | 'failed' = 'failed';
			let error: string | undefined;

			try {
				if (!channel.slack_bot_token_enc || !channel.slack_channel_id) {
					throw new Error('Missing bot token or channel ID');
				}

				const token = this.encryption.decrypt(channel.slack_bot_token_enc);
				const slack = new WebClient(token);

				const text = this.buildMessage(eventType, payload);

				await slack.chat.postMessage({
					channel: channel.slack_channel_id,
					text,
				});

				status = 'sent';
				this.logger.log(
					`Slack notification sent to channel ${channel.name} for ${eventType}`,
				);
			} catch (err: unknown) {
				const raw = err instanceof Error ? err.message : String(err);
				error = raw.includes('channel_not_found')
					? `channel_not_found: Bot is not a member of the private channel "${channel.slack_channel_id}". Invite the bot via /invite @BotName in Slack.`
					: raw;
				this.logger.error(
					`Failed to send Slack notification to channel ${channel.name}: ${error}`,
				);
			}

			// Always log result regardless of success/failure
			await this.prisma.notificationLog.create({
				data: {
					channel_id: channel.id,
					event_type: eventType,
					payload: payload as Record<string, never>,
					status,
					error: error ?? null,
				},
			});
		}
	}

	private async createInAppNotification(
		eventType: string,
		payload: Record<string, unknown>,
	): Promise<void> {
		const ALERT_EVENTS = new Set([
			'backup.failed',
			'plugin-update.failed',
			'sync.failed',
			'monitor.down',
			'monitor.ssl_expiry',
			'monitor.dns_failed',
			'invoice.overdue',
		]);

		if (!ALERT_EVENTS.has(eventType)) return;

		try {
			const users = await this.prisma.user.findMany({
				where: {
					user_roles: {
						some: { role: { name: { in: ['admin', 'manager'] } } },
					},
				},
				select: { id: true },
			});

			if (users.length === 0) return;

			const { title, message } = this.buildInAppContent(eventType, payload);

			await this.prisma.userNotification.createMany({
				data: users.map(u => ({
					user_id: u.id,
					type: eventType,
					title,
					message,
					action_url: null,
				})),
			});
		} catch (err: unknown) {
			this.logger.error(`Failed to create in-app notification: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private buildInAppContent(
		eventType: string,
		payload: Record<string, unknown>,
	): { title: string; message: string } {
		switch (eventType) {
			case 'backup.failed':
				return {
					title: 'Backup failed',
					message: `Backup for environment #${payload.environmentId ?? '?'} failed: ${payload.error ?? 'Unknown error'}`,
				};
			case 'plugin-update.failed':
				return {
					title: 'Plugin update failed',
					message: `Plugin update for environment #${payload.environmentId ?? '?'} failed`,
				};
			case 'sync.failed':
				return {
					title: 'Sync failed',
					message: `Sync operation failed: ${payload.error ?? 'Unknown error'}`,
				};
			case 'monitor.down':
				return {
					title: 'Site is down',
					message: `${payload.url ?? 'Unknown site'} returned HTTP ${payload.statusCode ?? '?'}`,
				};
			case 'monitor.ssl_expiry':
				return {
					title: 'SSL certificate expiring',
					message: `SSL certificate for ${payload.url ?? 'unknown'} expires in ${payload.daysRemaining ?? '?'} days`,
				};
			case 'monitor.dns_failed':
				return {
					title: 'DNS resolution failed',
					message: `DNS lookup failed for ${payload.url ?? 'unknown'}`,
				};
			case 'invoice.overdue':
				return {
					title: 'Invoice overdue',
					message: `Invoice ${payload.invoiceNumber ?? '?'} is overdue (€${payload.totalAmount ?? '?'})`,
				};
			default:
				return { title: eventType, message: JSON.stringify(payload).slice(0, 200) };
		}
	}

	private buildMessage(
		eventType: string,
		payload: Record<string, unknown>,
	): string {
		const lines: string[] = [`*[Bedrock Forge]* Event: \`${eventType}\``];

		switch (eventType) {
			case 'backup.completed':
				lines.push(
					`✅ Backup completed for environment #${payload.environmentId ?? '?'}`,
					`Type: ${payload.backupType ?? '?'} | Size: ${this.formatBytes(payload.sizeBytes as number)}`,
				);
				break;
			case 'backup.failed':
				lines.push(
					`❌ Backup failed for environment #${payload.environmentId ?? '?'}`,
					`Error: ${payload.error ?? 'Unknown error'}`,
				);
				break;
			case 'sync.completed':
				lines.push(`✅ Sync completed`);
				break;
			case 'sync.failed':
				lines.push(`❌ Sync failed: ${payload.error ?? 'Unknown error'}`);
				break;
			case 'plugin-scan.completed':
				lines.push(
					`🔍 Plugin scan completed for environment #${payload.environmentId ?? '?'}`,
					`Found ${payload.pluginCount ?? '?'} plugins`,
				);
				break;
			case 'monitor.down':
				lines.push(
					`🔴 Site is DOWN: ${payload.url ?? '?'}`,
					`Status: ${payload.statusCode ?? '?'} | Response: ${payload.responseMs ?? '?'}ms`,
				);
				break;
			case 'monitor.up':
				lines.push(
					`🟢 Site is back UP: ${payload.url ?? '?'}`,
					`Response: ${payload.responseMs ?? '?'}ms`,
				);
				break;
			case 'monitor.degraded':
				lines.push(
					`🟡 Site is DEGRADED (slow): ${payload.url ?? '?'}`,
					`Response time: ${payload.responseMs ?? '?'}ms (threshold: 5000ms) | Status: ${payload.statusCode ?? '?'}`,
				);
				break;
			case 'invoice.created':
				lines.push(
					`📄 Invoice ${payload.invoiceNumber ?? '?'} created`,
					`Project: ${payload.projectName ?? '?'} | Client: ${payload.clientName ?? '?'}`,
					`Total: €${payload.totalAmount ?? '?'} (${payload.year ?? '?'})`,
				);
				break;
			case 'invoice.overdue':
				lines.push(
					`⚠️ Invoice ${payload.invoiceNumber ?? '?'} is overdue`,
					`Client: ${payload.clientName ?? '?'} | Amount: €${payload.totalAmount ?? '?'}`,
				);
				break;
			case 'user.registered':
				lines.push(`👤 New user registered: ${payload.email ?? '?'}`);
				break;
			case 'user.login':
				lines.push(
					`🔑 User logged in: ${payload.email ?? '?'} from ${payload.ip ?? '?'}`,
				);
				break;
			case 'server.created':
				lines.push(
					`🖥️ New server added: ${payload.serverName ?? '?'} (${payload.ip ?? '?'})`,
				);
				break;
			case 'server.deleted':
				lines.push(`🗑️ Server removed: ${payload.serverName ?? '?'}`);
				break;
			case 'report.weekly':
				lines.push(
					`📊 Weekly report generated`,
					`Period: ${payload.dateRange ?? '?'} | Backups: ${payload.successfulBackups ?? '?'} ok / ${payload.failedBackups ?? '?'} failed | Monitors down: ${payload.monitorsDown ?? '?'}`,
				);
				break;
			default:
				lines.push(JSON.stringify(payload, null, 2).slice(0, 500));
		}

		return lines.join('\n');
	}

	private formatBytes(bytes?: number): string {
		if (!bytes) return '?';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024)
			return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}
}
