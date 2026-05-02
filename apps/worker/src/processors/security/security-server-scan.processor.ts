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

/** Fires every 15 minutes to check which security schedules are due. */
const TICK_JOB_ID = 'security-schedule-tick';
const TICK_EVERY_MS = 15 * 60 * 1_000;

/**
 * Unified security queue processor.
 *
 * Having multiple @Processor classes on the same queue creates a race condition:
 * BullMQ workers compete for every job regardless of type, and a worker returning
 * undefined on a mismatched job silently marks it as completed without executing it.
 */
@Processor(QUEUES.SECURITY, { concurrency: 2, lockDuration: 20 * 60 * 1_000 })
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
		this.logger.log('Security schedule tick registered (every 15 min)');
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
}

// Backwards-compatible alias: security-processor.module.ts imports this name.
export { SecurityScanProcessor as SecurityServerScanProcessor };
