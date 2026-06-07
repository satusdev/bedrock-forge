import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { SshKeyService } from '../../../services/ssh-key.service';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';
import type {
	SecurityServerScanPayload,
	SecurityEnvironmentScanPayload,
	SecurityScanType,
	SecurityScanSummary,
} from '@bedrock-forge/shared';
import { calculateScore, buildSummary } from '../scoring';
import {
	runSshAudit,
	runServerHardening,
	runMalwareScan,
} from '../server-checks';
import { runWpAudit, runProjectMalware } from '../environment-checks';

@Injectable()
export class SecurityScanRunnerService {
	private readonly logger = new Logger(SecurityScanRunnerService.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly sshKey: SshKeyService,
		@InjectQueue(QUEUES.NOTIFICATIONS)
		private readonly notificationsQueue: Queue,
	) {}

	async processServerScan(job: Job) {
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

	async processEnvironmentScan(job: Job) {
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

	async failExecution(jobExecutionId: number, error: string) {
		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'failed', last_error: error, completed_at: new Date() },
		});
	}

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

			const severityOrder: Array<keyof SecurityScanSummary> = [
				'info',
				'low',
				'medium',
				'high',
				'critical',
				'info', // Safe fallback
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
}
