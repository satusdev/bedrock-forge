import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import * as https from 'https';
import * as http from 'http';
import { PrismaService } from '../../prisma/prisma.service';
import { JOB_TYPES, QUEUES } from '@bedrock-forge/shared';

@Processor(QUEUES.MONITORS)
export class MonitorProcessor extends WorkerHost {
	private readonly logger = new Logger(MonitorProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		@InjectQueue(QUEUES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
	) {
		super();
	}

	async process(job: Job) {
		const { monitorId } = job.data;
		const timeout = 30_000;
		const checkedAt = new Date();
		let statusCode: number | null = null;
		let responseTimeMs: number | null = null;
		let isUp = false;

		const monitor = await this.prisma.monitor.findUnique({
			where: { id: BigInt(monitorId) },
			include: { environment: { select: { id: true, url: true } } },
		});
		if (!monitor) return;

		// Create a JobExecution row so monitor checks appear in the activity feed
		const execution = await this.prisma.jobExecution.create({
			data: {
				queue_name: QUEUES.MONITORS,
				bull_job_id: String(job.id),
				job_type: JOB_TYPES.MONITOR_CHECK,
				environment_id: monitor.environment_id,
				status: 'active',
				started_at: checkedAt,
				payload: { monitorId },
			},
		});

		// Capture previous state before running the check
		const prevIsUp =
			monitor.last_checked_at !== null && monitor.last_status !== null
				? monitor.last_status >= 200 && monitor.last_status < 400
				: null;

		const url = monitor.environment.url;
		const start = Date.now();

		try {
			const result = await this.checkHttp(url, timeout);
			statusCode = result.statusCode;
			responseTimeMs = Date.now() - start;
			isUp = result.statusCode >= 200 && result.statusCode < 400;
		} catch {
			isUp = false;
			responseTimeMs = Date.now() - start;
		}

		await this.prisma.monitorResult.create({
			data: {
				monitor_id: BigInt(monitorId),
				is_up: isUp,
				status_code: statusCode ?? 0,
				response_ms: responseTimeMs ?? 0,
				checked_at: checkedAt,
			},
		});

		// Prune results older than 30 days
		const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		await this.prisma.monitorResult.deleteMany({
			where: { monitor_id: BigInt(monitorId), checked_at: { lt: cutoff } },
		});

		// Update monitor uptime % — use aggregate COUNT queries instead of fetching all rows
		const [totalCount, upCount] = await Promise.all([
			this.prisma.monitorResult.count({
				where: { monitor_id: BigInt(monitorId) },
			}),
			this.prisma.monitorResult.count({
				where: { monitor_id: BigInt(monitorId), is_up: true },
			}),
		]);
		const uptime = totalCount > 0 ? (upCount / totalCount) * 100 : 100;

		await this.prisma.monitor.update({
			where: { id: BigInt(monitorId) },
			data: {
				last_checked_at: checkedAt,
				last_status: statusCode,
				last_response_ms: responseTimeMs,
				uptime_pct: uptime,
			},
		});

		// Persist state-transition log and fire notification on change (up→down or down→up)
		if (prevIsUp !== null && prevIsUp !== isUp) {
			const eventType = isUp ? 'monitor.up' : 'monitor.down';
			this.logger.log(
				`Monitor ${monitorId} state transition: ${prevIsUp ? 'up' : 'down'} → ${isUp ? 'up' : 'down'}`,
			);

			if (isUp) {
				// Site recovered — resolve the latest open DOWN log and create an UP log
				await this.prisma.monitorLog.create({
					data: {
						monitor_id: BigInt(monitorId),
						event_type: 'up',
						status_code: statusCode,
						response_ms: responseTimeMs,
					},
				});
				// Find and close the open DOWN log
				const openDownLog = await this.prisma.monitorLog.findFirst({
					where: {
						monitor_id: BigInt(monitorId),
						event_type: 'down',
						resolved_at: null,
					},
					orderBy: { occurred_at: 'desc' },
				});
				if (openDownLog) {
					const resolvedAt = checkedAt;
					const durationSeconds = Math.floor(
						(resolvedAt.getTime() - openDownLog.occurred_at.getTime()) / 1000,
					);
					await this.prisma.monitorLog.update({
						where: { id: openDownLog.id },
						data: { resolved_at: resolvedAt, duration_seconds: durationSeconds },
					});
				}
			} else {
				// Site went down — create a DOWN log
				await this.prisma.monitorLog.create({
					data: {
						monitor_id: BigInt(monitorId),
						event_type: 'down',
						status_code: statusCode,
						response_ms: responseTimeMs,
						message:
							statusCode === 0
								? 'Request timed out or connection refused'
								: `HTTP ${statusCode} — site unreachable`,
					},
				});
			}

			await this.notificationsQueue.add(
				JOB_TYPES.NOTIFICATION_SEND,
				{
					eventType,
					payload: {
						monitorId: Number(monitorId),
						environmentId: Number(monitor.environment.id),
						url,
						statusCode: statusCode ?? 0,
						responseMs: responseTimeMs ?? 0,
						transition: isUp ? 'recovered' : 'went_down',
						checkedAt: checkedAt.toISOString(),
					},
				},
				{ attempts: 3, removeOnComplete: 100, removeOnFail: 1000 },
			);
		}

		// Mark JobExecution as completed
		await this.prisma.jobExecution.update({
			where: { id: execution.id },
			data: {
				status: isUp ? 'completed' : 'failed',
				last_error: isUp
					? null
					: `HTTP ${statusCode ?? 0} — site unreachable`,
				progress: 100,
				completed_at: new Date(),
			},
		});
	}

	private checkHttp(
		url: string,
		timeout: number,
	): Promise<{ statusCode: number; body: string }> {
		return new Promise((resolve, reject) => {
			const mod = url.startsWith('https') ? https : http;
			const chunks: Buffer[] = [];
			const req = mod.get(url, { timeout }, res => {
				res.on('data', (c: Buffer) => chunks.push(c));
				res.on('end', () =>
					resolve({
						statusCode: res.statusCode ?? 0,
						body: Buffer.concat(chunks).toString(),
					}),
				);
			});
			req.on('error', reject);
			req.on('timeout', () => {
				req.destroy();
				reject(new Error('Request timed out'));
			});
		});
	}
}
