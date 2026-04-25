import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import * as https from 'https';
import * as http from 'http';
import * as tls from 'tls';
import * as dns from 'dns';
import { PrismaService } from '../../prisma/prisma.service';
import { JOB_TYPES, QUEUES } from '@bedrock-forge/shared';

interface HttpCheckResult {
	statusCode: number;
	body: string;
	responseMs: number;
}

interface SslCheckResult {
	daysRemaining: number;
	expiresAt: Date;
	issuer: string | null;
}

// concurrency=3: HTTP pings are I/O-bound and fast — 3 concurrent is safe.
@Processor(QUEUES.MONITORS, { concurrency: 3 })
export class MonitorProcessor extends WorkerHost {
	private readonly logger = new Logger(MonitorProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		@InjectQueue(QUEUES.NOTIFICATIONS)
		private readonly notificationsQueue: Queue,
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
		let responseBody = '';

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
			responseTimeMs = result.responseMs;
			responseBody = result.body;
			isUp = result.statusCode >= 200 && result.statusCode < 400;
		} catch {
			isUp = false;
			responseTimeMs = Date.now() - start;
		}

		// Confirmation retry: if first check failed, wait 5 s then try once more
		if (!isUp) {
			this.logger.warn(
				`Monitor ${monitorId}: first check failed (HTTP ${statusCode ?? 0}) — retrying in 5 s`,
			);
			await new Promise(resolve => setTimeout(resolve, 5_000));
			const retryStart = Date.now();
			try {
				const retryResult = await this.checkHttp(url, timeout);
				statusCode = retryResult.statusCode;
				responseTimeMs = retryResult.responseMs;
				responseBody = retryResult.body;
				isUp = retryResult.statusCode >= 200 && retryResult.statusCode < 400;
				if (isUp) {
					this.logger.log(
						`Monitor ${monitorId}: retry succeeded (HTTP ${statusCode}) — not marking as down`,
					);
				}
			} catch {
				isUp = false;
				responseTimeMs = Date.now() - retryStart;
				this.logger.warn(
					`Monitor ${monitorId}: retry also failed — confirming down`,
				);
			}
		}

		// ── Advanced checks (run in parallel after HTTP check) ─────────────────
		let sslResult: SslCheckResult | null = null;
		let dnsResolves: boolean | null = null;
		let keywordFound: boolean | null = null;

		try {
			const hostname = new URL(url).hostname;
			const [ssl, dns_] = await Promise.all([
				monitor.check_ssl ? this.checkSsl(hostname) : Promise.resolve(null),
				monitor.check_dns ? this.checkDns(hostname) : Promise.resolve(null),
			]);
			sslResult = ssl;
			dnsResolves = dns_;
		} catch (err) {
			this.logger.warn(`Monitor ${monitorId}: advanced check error: ${err}`);
		}

		if (monitor.check_keyword && monitor.keyword && responseBody) {
			keywordFound = responseBody.includes(monitor.keyword);
		}

		// ── Persist result ──────────────────────────────────────────────────────
		await this.prisma.monitorResult.create({
			data: {
				monitor_id: BigInt(monitorId),
				is_up: isUp,
				status_code: statusCode ?? 0,
				response_ms: responseTimeMs ?? 0,
				checked_at: checkedAt,
				...(sslResult !== null && {
					ssl_days_remaining: sslResult.daysRemaining,
				}),
				...(dnsResolves !== null && { dns_resolves: dnsResolves }),
				...(keywordFound !== null && { keyword_found: keywordFound }),
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
				// Cache latest advanced check results on the monitor
				...(sslResult !== null && {
					ssl_expires_at: sslResult.expiresAt,
					ssl_issuer: sslResult.issuer,
					ssl_days_remaining: sslResult.daysRemaining,
				}),
				...(dnsResolves !== null && { dns_resolves: dnsResolves }),
				...(keywordFound !== null && { keyword_found: keywordFound }),
			},
		});

		// ── Notifications: advanced check failures ──────────────────────────────
		if (
			sslResult !== null &&
			monitor.ssl_alert_days !== null &&
			monitor.ssl_alert_days !== undefined
		) {
			if (sslResult.daysRemaining <= monitor.ssl_alert_days) {
				this.logger.warn(
					`Monitor ${monitorId}: SSL expiring in ${sslResult.daysRemaining} days (threshold: ${monitor.ssl_alert_days})`,
				);
				await this.prisma.monitorLog.create({
					data: {
						monitor_id: BigInt(monitorId),
						event_type: 'ssl_expiry',
						message: `SSL certificate expires in ${sslResult.daysRemaining} days (${sslResult.expiresAt.toISOString().slice(0, 10)})`,
					},
				});
				await this.dispatchNotification('monitor.ssl_expiry', {
					monitorId: Number(monitorId),
					environmentId: Number(monitor.environment.id),
					url,
					daysRemaining: sslResult.daysRemaining,
					expiresAt: sslResult.expiresAt.toISOString(),
					issuer: sslResult.issuer,
				});
			}
		}

		if (dnsResolves === false) {
			this.logger.warn(
				`Monitor ${monitorId}: DNS resolution failed for ${url}`,
			);
			await this.prisma.monitorLog.create({
				data: {
					monitor_id: BigInt(monitorId),
					event_type: 'dns_failed',
					message: `DNS resolution failed for hostname`,
				},
			});
			await this.dispatchNotification('monitor.dns_failed', {
				monitorId: Number(monitorId),
				environmentId: Number(monitor.environment.id),
				url,
				checkedAt: checkedAt.toISOString(),
			});
		}

		if (keywordFound === false) {
			this.logger.warn(
				`Monitor ${monitorId}: keyword "${monitor.keyword}" not found in response`,
			);
			await this.prisma.monitorLog.create({
				data: {
					monitor_id: BigInt(monitorId),
					event_type: 'keyword_missing',
					message: `Keyword "${monitor.keyword}" not found in response body`,
				},
			});
			await this.dispatchNotification('monitor.keyword_missing', {
				monitorId: Number(monitorId),
				environmentId: Number(monitor.environment.id),
				url,
				keyword: monitor.keyword,
				checkedAt: checkedAt.toISOString(),
			});
		}

		// Detect degraded state: site responded but is slower than 5 s threshold
		const isDegraded = isUp && (responseTimeMs ?? 0) > 5_000;
		if (isDegraded) {
			this.logger.warn(
				`Monitor ${monitorId}: site is degraded — ${responseTimeMs}ms response time`,
			);
			await this.prisma.monitorLog.create({
				data: {
					monitor_id: BigInt(monitorId),
					event_type: 'degraded',
					status_code: statusCode,
					response_ms: responseTimeMs,
					message: `Site responding slowly: ${responseTimeMs}ms (threshold: 5000ms)`,
				},
			});
			await this.dispatchNotification('monitor.degraded', {
				monitorId: Number(monitorId),
				environmentId: Number(monitor.environment.id),
				url,
				statusCode: statusCode ?? 0,
				responseMs: responseTimeMs ?? 0,
				checkedAt: checkedAt.toISOString(),
			});
		}

		// Persist state-transition log and fire notification on change (up→down or down→up)
		if (prevIsUp !== null && prevIsUp !== isUp) {
			const eventType = isUp ? 'monitor.up' : 'monitor.down';
			this.logger.log(
				`Monitor ${monitorId} state transition: ${prevIsUp ? 'up' : 'down'} → ${isUp ? 'up' : 'down'}`,
			);

			if (isUp) {
				await this.prisma.monitorLog.create({
					data: {
						monitor_id: BigInt(monitorId),
						event_type: 'up',
						status_code: statusCode,
						response_ms: responseTimeMs,
					},
				});
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
						data: {
							resolved_at: resolvedAt,
							duration_seconds: durationSeconds,
						},
					});
				}
			} else {
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

			await this.dispatchNotification(eventType, {
				monitorId: Number(monitorId),
				environmentId: Number(monitor.environment.id),
				url,
				statusCode: statusCode ?? 0,
				responseMs: responseTimeMs ?? 0,
				transition: isUp ? 'recovered' : 'went_down',
				checkedAt: checkedAt.toISOString(),
			});
		}

		// Mark JobExecution as completed
		await this.prisma.jobExecution.update({
			where: { id: execution.id },
			data: {
				status: isUp ? 'completed' : 'failed',
				last_error: isUp ? null : `HTTP ${statusCode ?? 0} — site unreachable`,
				progress: 100,
				completed_at: new Date(),
			},
		});
	}

	// ── Private helpers ───────────────────────────────────────────────────────

	private checkHttp(url: string, timeout: number): Promise<HttpCheckResult> {
		return new Promise((resolve, reject) => {
			const mod = url.startsWith('https') ? https : http;
			const chunks: Buffer[] = [];
			const start = Date.now();
			const req = mod.get(url, { timeout }, res => {
				res.on('data', (c: Buffer) => chunks.push(c));
				res.on('end', () =>
					resolve({
						statusCode: res.statusCode ?? 0,
						body: Buffer.concat(chunks).toString(),
						responseMs: Date.now() - start,
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

	private checkSsl(hostname: string): Promise<SslCheckResult | null> {
		return new Promise(resolve => {
			const socket = tls.connect(
				{
					host: hostname,
					port: 443,
					servername: hostname,
					rejectUnauthorized: false,
				},
				() => {
					const cert = socket.getPeerCertificate();
					socket.destroy();
					if (!cert || !Object.keys(cert).length) {
						resolve(null);
						return;
					}
					const expiresAt = cert.valid_to ? new Date(cert.valid_to) : null;
					if (!expiresAt || isNaN(expiresAt.getTime())) {
						resolve(null);
						return;
					}
					const msRemaining = expiresAt.getTime() - Date.now();
					const daysRemaining = Math.max(
						0,
						Math.floor(msRemaining / (1000 * 60 * 60 * 24)),
					);
					const issuer =
						(cert.issuer as Record<string, string> | undefined)?.O ?? null;
					resolve({ daysRemaining, expiresAt, issuer });
				},
			);
			socket.on('error', () => {
				socket.destroy();
				resolve(null);
			});
			socket.setTimeout(15_000, () => {
				socket.destroy();
				resolve(null);
			});
		});
	}

	private async checkDns(hostname: string): Promise<boolean> {
		try {
			const addresses = await dns.promises.resolve4(hostname);
			return addresses.length > 0;
		} catch {
			return false;
		}
	}

	private async dispatchNotification(
		eventType: string,
		payload: Record<string, unknown>,
	) {
		try {
			await this.notificationsQueue.add(
				JOB_TYPES.NOTIFICATION_SEND,
				{ eventType, payload },
				{ attempts: 3, removeOnComplete: 100, removeOnFail: 1000 },
			);
		} catch (err) {
			this.logger.warn(`Failed to enqueue ${eventType} notification: ${err}`);
		}
	}
}
