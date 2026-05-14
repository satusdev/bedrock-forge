import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import { QUEUES, JOB_TYPES, DEFAULT_JOB_OPTIONS } from '@bedrock-forge/shared';
import type {
	SecurityServerScanPayload,
	SecurityEnvironmentScanPayload,
	SecurityServerHardeningPayload,
	SecurityEnvironmentHardeningPayload,
	SecurityScanType,
	SecurityScanSummary,
} from '@bedrock-forge/shared';
import { calculateScore, buildSummary } from './scoring';
import {
	runSshAudit,
	runServerHardening,
	runMalwareScan,
} from './server-checks';
import { runWpAudit, runProjectMalware } from './environment-checks';
import {
	applyServerHardeningActions,
	applyEnvironmentHardeningActions,
} from './hardening-actions';

/** Fires every 15 minutes to check which security schedules are due. */
const TICK_JOB_ID = 'security-schedule-tick';
const TICK_EVERY_MS = 15 * 60 * 1_000;
const ALERT_TICK_JOB_ID = 'security-alert-poll-tick';
const ALERT_TICK_EVERY_MS = 60 * 1_000;
const FAILED_LOGIN_SPIKE_THRESHOLD = 10;
const MAX_RAW_LOG_EXCERPT = 500;

type FileSnapshotEntry = {
	hash: string;
	size: number;
	mtime: number;
};

type FileSnapshot = Record<string, FileSnapshotEntry>;

type FileChangeBatch = {
	added: string[];
	modified: string[];
	deleted: string[];
};

/**
 * Unified security queue processor.
 *
 * Having multiple @Processor classes on the same queue creates a race condition:
 * BullMQ workers compete for every job regardless of type, and a worker returning
 * undefined on a mismatched job silently marks it as completed without executing it.
 */
@Processor(QUEUES.SECURITY, { concurrency: 4, lockDuration: 20 * 60 * 1_000 })
export class SecurityScanProcessor
	extends WorkerHost
	implements OnApplicationBootstrap
{
	private readonly logger = new Logger(SecurityScanProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly sshKey: SshKeyService,
		@InjectQueue(QUEUES.SECURITY) private readonly securityQueue: Queue,
		@InjectQueue(QUEUES.NOTIFICATIONS)
		private readonly notificationsQueue: Queue,
	) {
		super();
	}

	async onApplicationBootstrap() {
		await this.securityQueue.add(
			JOB_TYPES.SECURITY_SCHEDULED_SCAN,
			{},
			{
				repeat: { every: TICK_EVERY_MS },
				jobId: TICK_JOB_ID,
				removeOnComplete: 10,
				removeOnFail: 5,
			},
		);
		await this.securityQueue.add(
			JOB_TYPES.SECURITY_ATTACK_WATCH,
			{},
			{
				repeat: { every: 5 * 60 * 1_000 },
				jobId: 'security-attack-watch',
				removeOnComplete: 10,
				removeOnFail: 5,
			},
		);
		await this.securityQueue.add(
			JOB_TYPES.SECURITY_ALERT_POLL,
			{},
			{
				repeat: { every: ALERT_TICK_EVERY_MS },
				jobId: ALERT_TICK_JOB_ID,
				removeOnComplete: 10,
				removeOnFail: 5,
			},
		);
		this.logger.log('Security attack watcher registered (every 5 min)');
		this.logger.log('Security alert poller registered (every 1 min)');
	}

	// ─── Dispatcher ───────────────────────────────────────────────────────────

	async process(job: Job) {
		switch (job.name) {
			case JOB_TYPES.SECURITY_SERVER_SCAN:
				return this.processServerScan(job);
			case JOB_TYPES.SECURITY_ENVIRONMENT_SCAN:
				return this.processEnvironmentScan(job);
			case JOB_TYPES.SECURITY_SCHEDULED_SCAN:
				return this.processScheduleTick();
			case JOB_TYPES.SECURITY_SERVER_HARDEN:
				return this.processServerHardening(job);
			case JOB_TYPES.SECURITY_ENVIRONMENT_HARDEN:
				return this.processEnvironmentHardening(job);
			case JOB_TYPES.SECURITY_ATTACK_WATCH:
				return this.processAttackWatcher();
			case JOB_TYPES.SECURITY_ALERT_POLL:
				return this.processAlertPoll(job);
			default:
				this.logger.warn(`Unknown security job type: ${job.name}`);
		}
	}

	// ─── Server Scan ──────────────────────────────────────────────────────────

	private async processServerScan(job: Job) {
		const { serverId, scanTypes, jobExecutionId, scanIds } =
			job.data as SecurityServerScanPayload & { scheduleId?: number };

		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'active', started_at: new Date() },
		});

		const server = await this.prisma.server.findUnique({
			where: { id: BigInt(serverId) },
		});
		if (!server) {
			await this.failExecution(jobExecutionId, `Server ${serverId} not found`);
			return;
		}

		let privateKey: string;
		try {
			privateKey = await this.sshKey.resolvePrivateKey(server);
		} catch (err) {
			await this.failExecution(
				jobExecutionId,
				`SSH key resolution failed: ${err instanceof Error ? err.message : String(err)}`,
			);
			for (const scanId of scanIds) {
				await this.prisma.securityScan.update({
					where: { id: BigInt(scanId) },
					data: { status: 'failed', error: 'SSH key unavailable' },
				});
			}
			return;
		}

		const remoteExecutor = createRemoteExecutor({
			host: server.ip_address,
			port: server.ssh_port,
			username: server.ssh_user,
			privateKey,
		});

		for (let i = 0; i < scanTypes.length; i++) {
			const scanType = scanTypes[i] as SecurityScanType;
			const scanId = scanIds[i];

			await this.prisma.securityScan.update({
				where: { id: BigInt(scanId) },
				data: { status: 'running', started_at: new Date() },
			});

			try {
				const findings = await this.runServerCheck(scanType, remoteExecutor);
				const score = calculateScore(findings);
				const summary = buildSummary(findings);

				await this.prisma.securityScan.update({
					where: { id: BigInt(scanId) },
					data: {
						status: 'completed',
						score,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						summary: summary as any,
						findings: findings as unknown as Parameters<
							typeof this.prisma.securityScan.update
						>[0]['data']['findings'],
						completed_at: new Date(),
					},
				});

				this.logger.log(
					`[Server ${serverId}] ${scanType} completed — score: ${score}, findings: ${findings.length}`,
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				this.logger.error(`[Server ${serverId}] ${scanType} failed: ${msg}`);
				await this.prisma.securityScan.update({
					where: { id: BigInt(scanId) },
					data: { status: 'failed', error: msg, completed_at: new Date() },
				});
			}

			await job.updateProgress(Math.round(((i + 1) / scanTypes.length) * 100));
		}

		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'completed', completed_at: new Date(), progress: 100 },
		});

		const scheduleId = (job.data as { scheduleId?: number }).scheduleId;
		if (scheduleId) {
			await this.maybeNotify('server', serverId, scanIds);
		}
	}

	// ─── Environment Scan ─────────────────────────────────────────────────────

	private async processEnvironmentScan(job: Job) {
		const { environmentId, scanTypes, jobExecutionId, scanIds } =
			job.data as SecurityEnvironmentScanPayload & { scheduleId?: number };

		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'active', started_at: new Date() },
		});

		const environment = await this.prisma.environment.findUnique({
			where: { id: BigInt(environmentId) },
			include: { server: true },
		});
		if (!environment) {
			await this.failExecution(
				jobExecutionId,
				`Environment ${environmentId} not found`,
			);
			return;
		}

		let privateKey: string;
		try {
			privateKey = await this.sshKey.resolvePrivateKey(environment.server);
		} catch (err) {
			await this.failExecution(
				jobExecutionId,
				`SSH key resolution failed: ${err instanceof Error ? err.message : String(err)}`,
			);
			for (const scanId of scanIds) {
				await this.prisma.securityScan.update({
					where: { id: BigInt(scanId) },
					data: { status: 'failed', error: 'SSH key unavailable' },
				});
			}
			return;
		}

		const remoteExecutor = createRemoteExecutor({
			host: environment.server.ip_address,
			port: environment.server.ssh_port,
			username: environment.server.ssh_user,
			privateKey,
		});

		for (let i = 0; i < scanTypes.length; i++) {
			const scanType = scanTypes[i] as SecurityScanType;
			const scanId = scanIds[i];

			await this.prisma.securityScan.update({
				where: { id: BigInt(scanId) },
				data: { status: 'running', started_at: new Date() },
			});

			try {
				const findings = await this.runEnvironmentCheck(
					scanType,
					remoteExecutor,
					environment.root_path,
				);
				const score = calculateScore(findings);
				const summary = buildSummary(findings);

				await this.prisma.securityScan.update({
					where: { id: BigInt(scanId) },
					data: {
						status: 'completed',
						score,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						summary: summary as any,
						findings: findings as unknown as Parameters<
							typeof this.prisma.securityScan.update
						>[0]['data']['findings'],
						completed_at: new Date(),
					},
				});

				this.logger.log(
					`[Env ${environmentId}] ${scanType} completed — score: ${score}, findings: ${findings.length}`,
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				this.logger.error(`[Env ${environmentId}] ${scanType} failed: ${msg}`);
				await this.prisma.securityScan.update({
					where: { id: BigInt(scanId) },
					data: { status: 'failed', error: msg, completed_at: new Date() },
				});
			}

			await job.updateProgress(Math.round(((i + 1) / scanTypes.length) * 100));
		}

		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'completed', completed_at: new Date(), progress: 100 },
		});

		const scheduleId = (job.data as { scheduleId?: number }).scheduleId;
		if (scheduleId) {
			await this.maybeNotify('environment', environmentId, scanIds);
		}
	}

	// ─── Schedule Tick ────────────────────────────────────────────────────────

	private async processScheduleTick() {
		const now = new Date();
		const schedules = await this.prisma.securityScanSchedule.findMany({
			where: { enabled: true },
		});

		this.logger.debug(
			`Schedule tick: checking ${schedules.length} enabled schedule(s)`,
		);

		for (const schedule of schedules) {
			if (!this.isDue(schedule, now)) continue;

			try {
				if (schedule.server_id) {
					const scanTypes = schedule.scan_types as string[];
					const server = await this.prisma.server.findUnique({
						where: { id: schedule.server_id },
						select: { id: true },
					});
					if (!server) continue;

					const execution = await this.prisma.jobExecution.create({
						data: {
							queue_name: QUEUES.SECURITY,
							bull_job_id: 'pending',
							job_type: JOB_TYPES.SECURITY_SERVER_SCAN,
							server_id: schedule.server_id,
							status: 'queued',
							payload: {
								serverId: Number(schedule.server_id),
								types: scanTypes,
							},
						},
					});

					const scanIds: number[] = [];
					for (const scanType of scanTypes) {
						const scan = await this.prisma.securityScan.create({
							data: {
								scan_type: scanType as Parameters<
									typeof this.prisma.securityScan.create
								>[0]['data']['scan_type'],
								server_id: schedule.server_id,
								job_execution_id: execution.id,
							},
						});
						scanIds.push(Number(scan.id));
					}

					const bullJob = await this.securityQueue.add(
						JOB_TYPES.SECURITY_SERVER_SCAN,
						{
							serverId: Number(schedule.server_id),
							scanTypes,
							jobExecutionId: Number(execution.id),
							scanIds,
							scheduleId: Number(schedule.id),
						},
						{
							...DEFAULT_JOB_OPTIONS,
							jobId: `security-server-${Number(schedule.server_id)}-sched-${Date.now()}`,
						},
					);

					await this.prisma.jobExecution.update({
						where: { id: execution.id },
						data: { bull_job_id: String(bullJob.id) },
					});

					this.logger.log(
						`Enqueued scheduled server scan for server ${Number(schedule.server_id)}, types: ${scanTypes.join(', ')}`,
					);
				} else if (schedule.environment_id) {
					const scanTypes = schedule.scan_types as string[];
					const env = await this.prisma.environment.findUnique({
						where: { id: schedule.environment_id },
						select: { id: true, server_id: true },
					});
					if (!env) continue;

					const execution = await this.prisma.jobExecution.create({
						data: {
							queue_name: QUEUES.SECURITY,
							bull_job_id: 'pending',
							job_type: JOB_TYPES.SECURITY_ENVIRONMENT_SCAN,
							environment_id: schedule.environment_id,
							server_id: env.server_id,
							status: 'queued',
							payload: {
								environmentId: Number(schedule.environment_id),
								types: scanTypes,
							},
						},
					});

					const scanIds: number[] = [];
					for (const scanType of scanTypes) {
						const scan = await this.prisma.securityScan.create({
							data: {
								scan_type: scanType as Parameters<
									typeof this.prisma.securityScan.create
								>[0]['data']['scan_type'],
								environment_id: schedule.environment_id,
								job_execution_id: execution.id,
							},
						});
						scanIds.push(Number(scan.id));
					}

					const bullJob = await this.securityQueue.add(
						JOB_TYPES.SECURITY_ENVIRONMENT_SCAN,
						{
							environmentId: Number(schedule.environment_id),
							scanTypes,
							jobExecutionId: Number(execution.id),
							scanIds,
							scheduleId: Number(schedule.id),
						},
						{
							...DEFAULT_JOB_OPTIONS,
							jobId: `security-env-${Number(schedule.environment_id)}-sched-${Date.now()}`,
						},
					);

					await this.prisma.jobExecution.update({
						where: { id: execution.id },
						data: { bull_job_id: String(bullJob.id) },
					});

					this.logger.log(
						`Enqueued scheduled env scan for env ${Number(schedule.environment_id)}, types: ${scanTypes.join(', ')}`,
					);
				}

				await this.prisma.securityScanSchedule.update({
					where: { id: schedule.id },
					data: { last_run_at: now },
				});
			} catch (err) {
				this.logger.error(
					`Failed to enqueue scheduled scan for schedule ${Number(schedule.id)}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	// ─── Notifications ────────────────────────────────────────────────────────

	private async maybeNotify(
		type: 'server' | 'environment',
		id: number,
		scanIds: number[],
	) {
		try {
			const schedule = await this.prisma.securityScanSchedule.findUnique({
				where:
					type === 'server'
						? { server_id: BigInt(id) }
						: { environment_id: BigInt(id) },
			});
			if (!schedule || !schedule.notify_enabled) return;

			const scans = await this.prisma.securityScan.findMany({
				where: { id: { in: scanIds.map(BigInt) }, status: 'completed' },
				select: { summary: true, score: true },
			});

			const agg: SecurityScanSummary = {
				critical: 0,
				high: 0,
				medium: 0,
				low: 0,
				info: 0,
			};
			let minScore = 100;
			for (const scan of scans) {
				const s = scan.summary as SecurityScanSummary | null;
				if (s) {
					agg.critical += s.critical ?? 0;
					agg.high += s.high ?? 0;
					agg.medium += s.medium ?? 0;
					agg.low += s.low ?? 0;
					agg.info += s.info ?? 0;
				}
				if (scan.score !== null && scan.score < minScore) minScore = scan.score;
			}

			// Each threshold requires at least one finding at that severity or above.
			// Fixed: previously 'low' and 'info' were bare string comparisons (always true).
			const severityOrder: Array<keyof SecurityScanSummary> = [
				'info',
				'low',
				'medium',
				'high',
				'critical',
			];
			const thresholdIdx = severityOrder.indexOf(
				schedule.notify_threshold as keyof SecurityScanSummary,
			);
			const shouldNotify =
				thresholdIdx !== -1 &&
				severityOrder.slice(thresholdIdx).some(sev => agg[sev] > 0);

			if (!shouldNotify) return;

			const eventType =
				agg.critical > 0
					? 'security.critical_found'
					: agg.high > 0
						? 'security.high_found'
						: 'security.scan_completed';

			await this.notificationsQueue.add(
				JOB_TYPES.NOTIFICATION_SEND,
				{
					eventType,
					payload:
						type === 'server'
							? { serverId: id, score: minScore, summary: agg }
							: { environmentId: id, score: minScore, summary: agg },
				},
				{ removeOnComplete: 100, removeOnFail: 100 },
			);
		} catch (err) {
			this.logger.error(
				`Failed to dispatch security notification for ${type} ${id}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	// ─── Schedule Helpers ─────────────────────────────────────────────────────

	/**
	 * Returns true if this schedule should fire now.
	 *
	 * Uses UTC so schedules behave consistently regardless of server timezone.
	 * Previously used local time (getHours/getMinutes) which caused incorrect
	 * firing on non-UTC servers.
	 */
	private isDue(
		schedule: {
			frequency: string;
			hour: number;
			minute: number;
			day_of_week: number | null;
			day_of_month: number | null;
			last_run_at: Date | null;
		},
		now: Date,
	): boolean {
		const h = now.getUTCHours();
		const m = now.getUTCMinutes();
		const dow = now.getUTCDay();
		const dom = now.getUTCDate();

		const scheduledMinutesOfDay = schedule.hour * 60 + schedule.minute;
		const nowMinutesOfDay = h * 60 + m;
		const diff = Math.abs(nowMinutesOfDay - scheduledMinutesOfDay);
		if (diff > 15) return false;

		if (schedule.last_run_at) {
			const msSinceLastRun = now.getTime() - schedule.last_run_at.getTime();
			const minGapMs: Record<string, number> = {
				daily: 23 * 60 * 60 * 1_000,
				weekly: 6 * 24 * 60 * 60 * 1_000,
				monthly: 27 * 24 * 60 * 60 * 1_000,
			};
			const gap = minGapMs[schedule.frequency] ?? 23 * 60 * 60 * 1_000;
			if (msSinceLastRun < gap) return false;
		}

		if (schedule.frequency === 'weekly') {
			return schedule.day_of_week === null || schedule.day_of_week === dow;
		}
		if (schedule.frequency === 'monthly') {
			return schedule.day_of_month === null || schedule.day_of_month === dom;
		}
		return true;
	}

	// ─── Job Check Runners ────────────────────────────────────────────────────

	private async runServerCheck(
		scanType: SecurityScanType,
		executor: ReturnType<typeof createRemoteExecutor>,
	) {
		switch (scanType) {
			case 'SSH_AUDIT':
				return runSshAudit(executor);
			case 'SERVER_HARDENING':
				return runServerHardening(executor);
			case 'MALWARE_SCAN':
				return runMalwareScan(executor);
			default:
				return [];
		}
	}

	private async runEnvironmentCheck(
		scanType: SecurityScanType,
		executor: ReturnType<typeof createRemoteExecutor>,
		rootPath: string,
	) {
		switch (scanType) {
			case 'WP_AUDIT':
				return runWpAudit(executor, rootPath);
			case 'PROJECT_MALWARE':
				return runProjectMalware(executor, rootPath);
			default:
				return [];
		}
	}

	private async failExecution(jobExecutionId: number, error: string) {
		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'failed', last_error: error, completed_at: new Date() },
		});
	}

	// ─── Server Alert Polling ─────────────────────────────────────────────────

	private async processAlertPoll(job: Job) {
		const data = job.data as { serverId?: number; force?: boolean };
		const now = new Date();
		const settings = await this.prisma.serverSecurityAlertSetting.findMany({
			where: data.serverId
				? { server_id: BigInt(data.serverId) }
				: { enabled: true },
			include: {
				server: {
					include: {
						environments: { select: { root_path: true } },
					},
				},
			},
		});

		for (const setting of settings) {
			if (!data.force && (!setting.enabled || !this.isAlertDue(setting, now))) {
				continue;
			}

			try {
				const privateKey = await this.sshKey.resolvePrivateKey(setting.server);
				const executor = createRemoteExecutor({
					host: setting.server.ip_address,
					port: setting.server.ssh_port,
					username: setting.server.ssh_user,
					privateKey,
				});

				const windowStart =
					setting.last_checked_at ??
					new Date(now.getTime() - setting.interval_minutes * 60_000);

				if (setting.ssh_login_alerts_enabled) {
					await this.pollAuthLogs(setting, executor, windowStart, now);
				}

				if (setting.file_change_alerts_enabled) {
					await this.pollFileChanges(setting, executor, windowStart, now);
				}

				await this.prisma.serverSecurityAlertSetting.update({
					where: { id: setting.id },
					data: {
						last_checked_at: now,
						last_auth_cursor: now.toISOString(),
					},
				});
			} catch (err) {
				this.logger.error(
					`Security alert poll failed for server ${Number(setting.server_id)}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	private isAlertDue(
		setting: { last_checked_at: Date | null; interval_minutes: number },
		now: Date,
	): boolean {
		if (!setting.last_checked_at) return true;
		const intervalMs = Math.max(1, setting.interval_minutes) * 60_000;
		return now.getTime() - setting.last_checked_at.getTime() >= intervalMs;
	}

	private async pollAuthLogs(
		setting: {
			server_id: bigint;
			server: { name: string; ip_address: string };
		},
		executor: ReturnType<typeof createRemoteExecutor>,
		windowStart: Date,
		windowEnd: Date,
	) {
		const result = await executor.execute(this.buildAuthLogCommand(windowStart), {
			timeout: 30_000,
		});
		const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
		if (!output.trim()) return;

		const successful = this.parseSuccessfulLogins(output);
		for (const login of successful) {
			await this.notificationsQueue.add(
				JOB_TYPES.NOTIFICATION_SEND,
				{
					eventType: 'security.ssh_login',
					payload: {
						serverId: Number(setting.server_id),
						serverName: setting.server.name,
						serverIp: setting.server.ip_address,
						user: login.user,
						sourceIp: login.sourceIp,
						authMethod: login.authMethod,
						timestamp: login.timestamp,
						rawExcerpt: login.rawExcerpt,
					},
				},
				{ removeOnComplete: 100, removeOnFail: 100 },
			);
		}

		const failuresBySource = this.parseFailedLoginCounts(output);
		for (const [sourceIp, count] of failuresBySource.entries()) {
			if (count < FAILED_LOGIN_SPIKE_THRESHOLD) continue;
			await this.notificationsQueue.add(
				JOB_TYPES.NOTIFICATION_SEND,
				{
					eventType: 'security.ssh_failed_login_spike',
					payload: {
						serverId: Number(setting.server_id),
						serverName: setting.server.name,
						serverIp: setting.server.ip_address,
						sourceIp,
						count,
						threshold: FAILED_LOGIN_SPIKE_THRESHOLD,
						windowStart: windowStart.toISOString(),
						windowEnd: windowEnd.toISOString(),
					},
				},
				{ removeOnComplete: 100, removeOnFail: 100 },
			);
		}
	}

	private async pollFileChanges(
		setting: {
			id: bigint;
			server_id: bigint;
			file_watch_paths: string[];
			file_snapshot: unknown;
			server: {
				name: string;
				ip_address: string;
				environments: { root_path: string }[];
			};
		},
		executor: ReturnType<typeof createRemoteExecutor>,
		windowStart: Date,
		windowEnd: Date,
	) {
		const watchPaths = this.expandWatchPaths(
			setting.file_watch_paths,
			setting.server.environments.map(env => env.root_path),
		);
		if (watchPaths.length === 0) return;

		const result = await executor.execute(
			this.buildFileSnapshotCommand(watchPaths),
			{ timeout: 120_000 },
		);
		const nextSnapshot = this.parseFileSnapshot(result.stdout);
		const previousSnapshot = this.asFileSnapshot(setting.file_snapshot);
		const changes = this.compareSnapshots(previousSnapshot, nextSnapshot);

		await this.prisma.serverSecurityAlertSetting.update({
			where: { id: setting.id },
			data: {
				file_snapshot: nextSnapshot as Parameters<
					typeof this.prisma.serverSecurityAlertSetting.update
				>[0]['data']['file_snapshot'],
			},
		});

		if (!previousSnapshot || !this.hasFileChanges(changes)) return;

		await this.notificationsQueue.add(
			JOB_TYPES.NOTIFICATION_SEND,
			{
				eventType: 'security.file_changes',
				payload: {
					serverId: Number(setting.server_id),
					serverName: setting.server.name,
					serverIp: setting.server.ip_address,
					windowStart: windowStart.toISOString(),
					windowEnd: windowEnd.toISOString(),
					addedCount: changes.added.length,
					modifiedCount: changes.modified.length,
					deletedCount: changes.deleted.length,
					topChangedPaths: [
						...changes.added,
						...changes.modified,
						...changes.deleted,
					].slice(0, 12),
				},
			},
			{ removeOnComplete: 100, removeOnFail: 100 },
		);
	}

	private buildAuthLogCommand(windowStart: Date): string {
		const since = this.shellQuote(windowStart.toISOString());
		return [
			'if command -v journalctl >/dev/null 2>&1; then',
			`journalctl -u ssh -u sshd --since ${since} --no-pager -o short-iso 2>/dev/null || true;`,
			'else',
			'tail -n 2500 /var/log/auth.log /var/log/secure 2>/dev/null || true;',
			'fi',
		].join(' ');
	}

	private buildFileSnapshotCommand(paths: string[]): string {
		const args = paths.map(path => this.shellGlobArg(path)).join(' ');
		const excludes = [
			'*/vendor/*',
			'*/node_modules/*',
			'*/cache/*',
			'*/.cache/*',
			'*/backups/*',
			'*/backup/*',
			'*/logs/*',
			'*/log/*',
			'*/uploads/*',
			'*/wp-content/uploads/*',
		]
			.map(pattern => `-path ${this.shellQuote(pattern)}`)
			.join(' -o ');

		return [
			'bash -lc',
			this.shellQuote(`
shopt -s nullglob
for target in ${args}; do
  [ -e "$target" ] || continue
  if [ -d "$target" ]; then
    find "$target" \\( ${excludes} \\) -prune -o -type f -size -5M -exec sh -c '
      for file do
        hash=$(sha256sum "$file" 2>/dev/null | awk "{print \\$1}") || continue
        meta=$(stat -c "%s	%Y" "$file" 2>/dev/null) || continue
        printf "%s	%s	%s\\n" "$hash" "$meta" "$file"
      done
    ' sh {} +
  elif [ -f "$target" ]; then
    hash=$(sha256sum "$target" 2>/dev/null | awk "{print \\$1}") || continue
    meta=$(stat -c "%s	%Y" "$target" 2>/dev/null) || continue
    printf "%s	%s	%s\\n" "$hash" "$meta" "$target"
  fi
done
`),
		].join(' ');
	}

	private parseSuccessfulLogins(output: string) {
		return output
			.split('\n')
			.map(line => line.trim())
			.filter(Boolean)
			.map(line => {
				const match = line.match(
					/Accepted\s+(\S+)\s+for\s+(\S+)\s+from\s+([^\s]+)\s+port/i,
				);
				if (!match) return null;
				return {
					authMethod: match[1],
					user: match[2],
					sourceIp: match[3],
					timestamp: this.extractLogTimestamp(line),
					rawExcerpt: line.slice(0, MAX_RAW_LOG_EXCERPT),
				};
			})
			.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
	}

	private parseFailedLoginCounts(output: string): Map<string, number> {
		const counts = new Map<string, number>();
		for (const line of output.split('\n')) {
			const match = line.match(/Failed\s+\S+\s+for\s+(?:invalid user\s+)?\S+\s+from\s+([^\s]+)\s+port/i);
			if (!match) continue;
			counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
		}
		return counts;
	}

	private parseFileSnapshot(output: string): FileSnapshot {
		const snapshot: FileSnapshot = {};
		for (const line of output.split('\n')) {
			if (!line.trim()) continue;
			const [hash, sizeRaw, mtimeRaw, ...pathParts] = line.split('\t');
			const path = pathParts.join('\t');
			const size = Number(sizeRaw);
			const mtime = Number(mtimeRaw);
			if (!hash || !path || Number.isNaN(size) || Number.isNaN(mtime)) continue;
			snapshot[path] = { hash, size, mtime };
		}
		return snapshot;
	}

	private compareSnapshots(
		previous: FileSnapshot | null,
		next: FileSnapshot,
	): FileChangeBatch {
		const added: string[] = [];
		const modified: string[] = [];
		const deleted: string[] = [];
		if (!previous) return { added, modified, deleted };

		for (const [path, nextEntry] of Object.entries(next)) {
			const prevEntry = previous[path];
			if (!prevEntry) {
				added.push(path);
			} else if (
				prevEntry.hash !== nextEntry.hash ||
				prevEntry.size !== nextEntry.size ||
				prevEntry.mtime !== nextEntry.mtime
			) {
				modified.push(path);
			}
		}

		for (const path of Object.keys(previous)) {
			if (!next[path]) deleted.push(path);
		}

		return { added, modified, deleted };
	}

	private hasFileChanges(changes: FileChangeBatch): boolean {
		return (
			changes.added.length > 0 ||
			changes.modified.length > 0 ||
			changes.deleted.length > 0
		);
	}

	private asFileSnapshot(value: unknown): FileSnapshot | null {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
		return value as FileSnapshot;
	}

	private expandWatchPaths(paths: string[], environmentRoots: string[]): string[] {
		const expanded = new Set(paths.filter(path => path.trim().length > 0));
		for (const root of environmentRoots) {
			expanded.add(`${root}/wp-config.php`);
			expanded.add(`${root}/web/wp-config.php`);
			expanded.add(`${root}/web/app/plugins`);
			expanded.add(`${root}/web/app/themes`);
			expanded.add(`${root}/wp-content/plugins`);
			expanded.add(`${root}/wp-content/themes`);
		}
		return [...expanded];
	}

	private extractLogTimestamp(line: string): string {
		const iso = line.match(/\d{4}-\d{2}-\d{2}T[^\s]+/);
		return iso?.[0] ?? new Date().toISOString();
	}

	private shellQuote(value: string): string {
		return `'${value.replace(/'/g, `'\\''`)}'`;
	}

	private shellGlobArg(value: string): string {
		return value
			.split('*')
			.map(part => this.shellQuote(part))
			.join('*');
	}

	// ─── Server Hardening ────────────────────────────────────────────────────

	private async processServerHardening(job: Job) {
		const payload = job.data as SecurityServerHardeningPayload;
		const { serverId, jobExecutionId, actions } = payload;

		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'active', started_at: new Date() },
		});

		try {
			const server = await this.prisma.server.findUnique({
				where: { id: BigInt(serverId) },
			});
			if (!server) throw new Error(`Server ${serverId} not found`);

			const privateKey = await this.sshKey.resolvePrivateKey(server);
			const executor = createRemoteExecutor({
				host: server.ip_address,
				port: server.ssh_port,
				username: server.ssh_user,
				privateKey,
			});

			const results = await applyServerHardeningActions(executor, actions);

			const logEntries = results.map(r => ({
				ts: new Date().toISOString(),
				step: r.action,
				level:
					r.status === 'failed'
						? 'error'
						: r.status === 'skipped'
							? 'warn'
							: 'info',
				detail: r.detail,
				hardenStatus: r.status,
			}));

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: {
					status: 'completed',
					completed_at: new Date(),
					execution_log: logEntries as object[],
				},
			});

			this.logger.log(
				`Server hardening ${jobExecutionId} completed — ${results.length} action(s)`,
			);
			return results;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(
				`Server hardening ${jobExecutionId} failed: ${message}`,
			);
			await this.failExecution(jobExecutionId, message);
			throw err;
		}
	}

	// ─── Environment Hardening ───────────────────────────────────────────────

	private async processEnvironmentHardening(job: Job) {
		const payload = job.data as SecurityEnvironmentHardeningPayload;
		const { environmentId, jobExecutionId, actions } = payload;

		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'active', started_at: new Date() },
		});

		try {
			const env = await this.prisma.environment.findUnique({
				where: { id: BigInt(environmentId) },
				include: { server: true },
			});
			if (!env) throw new Error(`Environment ${environmentId} not found`);

			const privateKey = await this.sshKey.resolvePrivateKey(env.server);
			const executor = createRemoteExecutor({
				host: env.server.ip_address,
				port: env.server.ssh_port,
				username: env.server.ssh_user,
				privateKey,
			});

			const rootPath = env.root_path;
			const results = await applyEnvironmentHardeningActions(
				executor,
				rootPath,
				actions,
			);

			const logEntries = results.map(r => ({
				ts: new Date().toISOString(),
				step: r.action,
				level:
					r.status === 'failed'
						? 'error'
						: r.status === 'skipped'
							? 'warn'
							: 'info',
				detail: r.detail,
				hardenStatus: r.status,
			}));

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: {
					status: 'completed',
					completed_at: new Date(),
					execution_log: logEntries as object[],
				},
			});

			this.logger.log(
				`Environment hardening ${jobExecutionId} completed — ${results.length} action(s)`,
			);
			return results;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(
				`Environment hardening ${jobExecutionId} failed: ${message}`,
			);
			await this.failExecution(jobExecutionId, message);
			throw err;
		}
	}
	// ─── Attack Watcher ───────────────────────────────────────────────────────

	private async processAttackWatcher() {
		this.logger.debug('Running security attack watcher...');
		const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1_000);

		// 1. Find all completed scans in the last 5 minutes
		const recentScans = await this.prisma.securityScan.findMany({
			where: {
				completed_at: { gte: fiveMinutesAgo },
				status: 'completed',
			},
			include: { environment: { include: { project: true } }, server: true },
		});

		if (recentScans.length === 0) return;

		// 2. Identify "Attack" patterns: same backdoor or mass findings
		const findingsBySignature = new Map<string, Array<{ env?: string; server?: string; title: string }>>();
		let totalCritical = 0;

		for (const scan of recentScans) {
			const findings = (scan.findings as any[]) || [];
			for (const f of findings) {
				if (f.severity === 'critical' || f.severity === 'high') {
					if (f.severity === 'critical') totalCritical++;
					
					// Signature is title + resource (e.g. path)
					const sig = `${f.title}:${f.resource || 'global'}`;
					const list = findingsBySignature.get(sig) || [];
					list.push({
						env: scan.environment?.project?.name ? `${scan.environment.project.name} (${scan.environment.type})` : undefined,
						server: scan.server?.name ?? undefined,
						title: f.title,
					});
					findingsBySignature.set(sig, list);
				}
			}
		}

		// 3. Detect "Batch Attack": same signature on multiple targets
		const attacks: any[] = [];
		for (const [sig, targets] of findingsBySignature.entries()) {
			if (targets.length >= 2) {
				attacks.push({
					signature: sig,
					targets: Array.from(new Set(targets.map(t => t.env || t.server))),
					title: targets[0].title,
					count: targets.length,
				});
			}
		}

		// 4. Also detect "Mass Infection": spike in critical findings
		if (totalCritical >= 5) {
			attacks.push({
				type: 'mass_infection',
				criticalCount: totalCritical,
				targetCount: new Set(recentScans.map(s => s.environment_id || s.server_id)).size,
			});
		}

		if (attacks.length > 0) {
			this.logger.warn(`🚨 Security Attack Detected! ${attacks.length} attack pattern(s) identified.`);
			await this.notificationsQueue.add(
				JOB_TYPES.NOTIFICATION_SEND,
				{
					eventType: 'security.attack_detected',
					payload: {
						timestamp: new Date().toISOString(),
						attacks,
					},
				},
				{ removeOnComplete: 100, removeOnFail: 100 },
			);
		}
	}
}

// Backwards-compatible alias: security-processor.module.ts imports this name.
export { SecurityScanProcessor as SecurityServerScanProcessor };
