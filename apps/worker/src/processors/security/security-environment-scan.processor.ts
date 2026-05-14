import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import {
	QUEUES,
	JOB_TYPES,
	checkPluginVulnerability,
} from '@bedrock-forge/shared';
import type {
	SecurityEnvironmentScanPayload,
	SecurityScanType,
	SecurityScanSummary,
	SecurityFinding,
} from '@bedrock-forge/shared';
import { calculateScore, buildSummary, makeFinding } from './scoring';
import {
	runWpAudit,
	runProjectMalware,
	runBackdoorSearch,
} from './environment-checks';

export class SecurityEnvironmentScanProcessor {
	private readonly logger = new Logger(SecurityEnvironmentScanProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly sshKey: SshKeyService,
		@InjectQueue(QUEUES.NOTIFICATIONS)
		private readonly notificationsQueue: Queue,
	) {}

	async process(job: Job) {
		if (job.name !== JOB_TYPES.SECURITY_ENVIRONMENT_SCAN) return;

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
				const findings = await this.runCheck(
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

		// Dispatch notification if this was a scheduled scan
		const scheduleId = (job.data as { scheduleId?: number }).scheduleId;
		if (scheduleId) {
			await this.maybeNotify(environmentId, scanIds);
		}
	}

	private async maybeNotify(environmentId: number, scanIds: number[]) {
		try {
			const schedule = await this.prisma.securityScanSchedule.findUnique({
				where: { environment_id: BigInt(environmentId) },
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

			const threshold = schedule.notify_threshold;
			const shouldNotify =
				(threshold === 'critical' && agg.critical > 0) ||
				(threshold === 'high' && (agg.critical > 0 || agg.high > 0)) ||
				(threshold === 'medium' &&
					(agg.critical > 0 || agg.high > 0 || agg.medium > 0)) ||
				threshold === 'low' ||
				threshold === 'info';

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
					payload: { environmentId, score: minScore, summary: agg },
				},
				{ removeOnComplete: 100, removeOnFail: 100 },
			);
		} catch (err) {
			this.logger.error(
				`Failed to dispatch security notification for env ${environmentId}: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	private async runCheck(
		scanType: SecurityScanType,
		executor: ReturnType<typeof createRemoteExecutor>,
		rootPath: string,
	) {
		switch (scanType) {
			case 'WP_AUDIT':
				return runWpAudit(executor, rootPath);
			case 'PROJECT_MALWARE':
				return runProjectMalware(executor, rootPath);
			case 'BACKDOOR_SEARCH':
				return runBackdoorSearch(executor, rootPath);
			case 'PLUGIN_AUDIT':
				return this.runPluginAudit(executor, rootPath);
			default:
				return [];
		}
	}

	private async runPluginAudit(
		executor: ReturnType<typeof createRemoteExecutor>,
		rootPath: string,
	): Promise<SecurityFinding[]> {
		const findings: SecurityFinding[] = [];

		// 1. Get plugin list via remote script (reuse existing logic if possible, or just run wp-cli)
		const { stdout: pluginListRaw } = await executor.execute(
			`wp plugin list --format=json --path=${rootPath} 2>/dev/null || true`,
			{ timeout: 30000 },
		);

		let plugins: {
			name: string;
			status: string;
			update: string;
			version: string;
		}[] = [];
		try {
			plugins = JSON.parse(pluginListRaw.trim());
		} catch {
			return findings; // WP-CLI not available or error
		}

		for (const plugin of plugins) {
			// Check for updates
			if (plugin.update === 'available') {
				findings.push(
					makeFinding(
						'medium',
						'SUSPICIOUS_FILES',
						`Plugin update available: ${plugin.name}`,
						`Version ${plugin.version} is installed, but an update is available. Outdated plugins are a common attack vector.`,
						{
							remediation: `Update the plugin via the dashboard or run: wp plugin update ${plugin.name} --path=${rootPath}`,
							resource: plugin.name,
							metadata: { current_version: plugin.version },
						},
					),
				);
			}

			// Check for inactive plugins
			if (plugin.status === 'inactive') {
				findings.push(
					makeFinding(
						'low',
						'SUSPICIOUS_FILES',
						`Inactive plugin: ${plugin.name}`,
						'Inactive plugins should be removed to reduce the attack surface.',
						{
							remediation: `Delete the plugin if not needed: wp plugin delete ${plugin.name} --path=${rootPath}`,
							resource: plugin.name,
						},
					),
				);
			}

			// 3. Vulnerability check (Shared logic + extensible for API)
			const vuln = checkPluginVulnerability(plugin.name, plugin.version);
			if (vuln) {
				findings.push(
					makeFinding(
						'critical',
						'MALWARE',
						`Vulnerability detected in ${plugin.name}`,
						`The version ${plugin.version} of ${plugin.name} has a known critical vulnerability: ${vuln.title}.`,
						{
							remediation: `Immediately update ${plugin.name} to version ${vuln.fixed_in} or later.`,
							resource: plugin.name,
							metadata: { cve: vuln.cve, fixed_in: vuln.fixed_in },
						},
					),
				);
			}
		}

		return findings;
	}

	private async failExecution(jobExecutionId: number, error: string) {
		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'failed', last_error: error, completed_at: new Date() },
		});
	}
}
