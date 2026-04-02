import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { readFileSync } from 'fs';
import { PrismaService } from '../../prisma/prisma.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { StepTracker } from '../../services/step-tracker';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import {
	QUEUES,
	JOB_TYPES,
	PluginInfo,
	PluginScanOutput,
	PluginManagePayload,
} from '@bedrock-forge/shared';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';

/** Wrap a string in single quotes for safe shell embedding on the remote host. */
function shellQuote(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

@Processor(QUEUES.PLUGIN_SCANS)
export class PluginScanProcessor extends WorkerHost {
	private readonly logger = new Logger(PluginScanProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly config: ConfigService,
		private readonly sshKey: SshKeyService,
	) {
		super();
	}

	async process(job: Job) {
		if (job.name === JOB_TYPES.PLUGIN_MANAGE) {
			return this.processManage(job);
		}
		return this.processScan(job);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Plugin scan (existing logic, updated to parse new PHP output format)
	// ─────────────────────────────────────────────────────────────────────────

	private async processScan(job: Job) {
		const { environmentId, jobExecutionId } = job.data as {
			environmentId: number;
			jobExecutionId: number;
		};

		const tracker = new StepTracker(
			this.prisma,
			BigInt(jobExecutionId),
			this.logger,
			job.id ?? '',
		);

		try {
			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'active', started_at: new Date() },
			});

			await tracker.track({
				step: 'Plugin scan started',
				level: 'info',
				detail: `env=${environmentId}`,
			});

			const env = await this.prisma.environment.findUniqueOrThrow({
				where: { id: BigInt(environmentId) },
				include: { server: true },
			});

			const server = env.server;
			await tracker.track({
				step: 'Connecting to server',
				level: 'info',
				detail: server.ip_address,
			});
			const privateKey = await this.sshKey.resolvePrivateKey(server);
			const executor = createRemoteExecutor({
				host: server.ip_address,
				port: server.ssh_port,
				username: server.ssh_user,
				privateKey,
			});

			await job.updateProgress(10);

			const scriptsPath = this.config.get<string>('scriptsPath')!;
			const remoteScript = `/tmp/plugin_scan_${job.id}.php`;
			await tracker.track({
				step: 'Uploading plugin-scan script',
				level: 'info',
				detail: `${join(scriptsPath, 'plugin-scan.php')} → ${remoteScript}`,
			});
			const scriptContent = readFileSync(join(scriptsPath, 'plugin-scan.php'));
			await executor.pushFile({
				remotePath: remoteScript,
				content: scriptContent,
			});

			await job.updateProgress(30);

			await tracker.track({
				step: 'Executing plugin scan',
				level: 'info',
				detail: `docroot=${env.root_path}`,
			});
			const scanStart = Date.now();
			const result = await executor.execute(
				`php ${remoteScript} --docroot=${env.root_path}`,
				{ timeout: 5 * 60 * 1000 },
			);
			await tracker.trackCommand(
				'plugin-scan.php',
				`php ${remoteScript} --docroot=${env.root_path}`,
				result,
				Date.now() - scanStart,
			);

			if (result.code !== 0) {
				throw new Error(
					`plugin-scan.php failed (exit ${result.code}): ${result.stderr}`,
				);
			}

			await tracker.track({ step: 'Parsing plugin results', level: 'info' });
			// Handle both legacy array output and new { is_bedrock, plugins } format
			const rawParsed: PluginScanOutput | PluginInfo[] = JSON.parse(
				result.stdout,
			);
			const scanOutput: PluginScanOutput = Array.isArray(rawParsed)
				? { is_bedrock: false, plugins: rawParsed }
				: (rawParsed as PluginScanOutput);
			const plugins = scanOutput.plugins;

			await job.updateProgress(80);

			await this.prisma.pluginScan.create({
				data: {
					environment_id: env.id,
					plugins: scanOutput as never,
					scanned_at: new Date(),
				},
			});

			await tracker.track({
				step: 'Storing scan results',
				level: 'info',
				detail: `${plugins.length} plugins found`,
			});
			await executor.execute(`rm -f ${remoteScript}`);
			await job.updateProgress(100);

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'completed', completed_at: new Date(), progress: 100 },
			});

			await tracker.track({
				step: 'Plugin scan complete',
				level: 'info',
				detail: `${plugins.length} plugins`,
			});
			this.logger.log(
				`[${job.id}] Plugin scan complete. ${plugins.length} plugins found.`,
			);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`Plugin scan job ${job.id} failed: ${msg}`);
			await tracker
				.track({ step: 'Plugin scan failed', level: 'error', detail: msg })
				.catch(() => {});
			await this.prisma.jobExecution
				.update({
					where: { id: BigInt(jobExecutionId) },
					data: {
						status: 'failed',
						last_error: msg,
						completed_at: new Date(),
					},
				})
				.catch(e =>
					this.logger.error(
						`Failed to mark JobExecution ${jobExecutionId} as failed: ${e}`,
					),
				);
			throw err;
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Plugin manage (add / remove / update / update-all via composer)
	// ─────────────────────────────────────────────────────────────────────────

	private async processManage(job: Job) {
		const payload = job.data as PluginManagePayload;
		const { environmentId, jobExecutionId, action, slug, version } = payload;

		const tracker = new StepTracker(
			this.prisma,
			BigInt(jobExecutionId),
			this.logger,
			job.id ?? '',
		);

		try {
			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'active', started_at: new Date() },
			});

			const env = await this.prisma.environment.findUniqueOrThrow({
				where: { id: BigInt(environmentId) },
				include: { server: true },
			});

			await tracker.track({
				step: 'Connecting to server',
				level: 'info',
				detail: env.server.ip_address,
			});

			const privateKey = await this.sshKey.resolvePrivateKey(env.server);
			const executor = createRemoteExecutor({
				host: env.server.ip_address,
				port: env.server.ssh_port,
				username: env.server.ssh_user,
				privateKey,
			});

			await job.updateProgress(10);

			const scriptsPath = this.config.get<string>('scriptsPath')!;
			const remoteScript = `/tmp/composer_mgr_${job.id}.php`;

			await tracker.track({
				step: 'Uploading composer-manager script',
				level: 'info',
			});
			const scriptContent = readFileSync(
				join(scriptsPath, 'composer-manager.php'),
			);
			await executor.pushFile({
				remotePath: remoteScript,
				content: scriptContent,
			});

			await job.updateProgress(20);

			const pkgArg = slug ? ` --package=wpackagist-plugin/${slug}` : '';
			const versionArg = version ? ` --version=${version}` : '';
			const constraintArg = payload.constraint
				? ` --constraint=${shellQuote(payload.constraint)}`
				: '';
			const cmd = `php ${remoteScript} --docroot=${env.root_path} --action=${action}${pkgArg}${versionArg}${constraintArg}`;

			await tracker.track({
				step: `Running composer ${action}`,
				level: 'info',
				detail: slug ?? 'all packages',
			});

			const manageStart = Date.now();
			const manageResult = await executor.execute(cmd, {
				// composer install can take a while on first run
				timeout: 10 * 60 * 1000,
			});
			await tracker.trackCommand(
				`composer ${action}`,
				cmd,
				manageResult,
				Date.now() - manageStart,
			);

			if (manageResult.code !== 0) {
				throw new Error(
					`composer ${action} failed (exit ${manageResult.code}): ${manageResult.stderr}`,
				);
			}

			await job.updateProgress(70);
			await executor.execute(`rm -f ${remoteScript}`);

			if (action === 'read') {
				// Store the full JSON response as a retrievable log entry.
				// The frontend fetches GET /plugin-scans/execution/:id and parses
				// the 'composer-read-result' step to display the composer.json viewer.
				await tracker.track({
					step: 'composer-read-result',
					level: 'info',
					detail: manageResult.stdout,
				});
			} else {
				// Always trigger a fresh plugin scan after any mutation so the stored
				// plugin list reflects the updated composer state.
				await tracker.track({
					step: 'Triggering fresh plugin scan',
					level: 'info',
				});

				const { randomUUID } = await import('crypto');
				const scanBullJobId = randomUUID();
				const scanExec = await this.prisma.jobExecution.create({
					data: {
						environment_id: BigInt(environmentId),
						queue_name: QUEUES.PLUGIN_SCANS,
						job_type: JOB_TYPES.PLUGIN_SCAN_RUN,
						bull_job_id: scanBullJobId,
					},
				});

				// Import the queue lazily to avoid circular DI — the worker already
				// has the queue registered globally.
				const { Queue } = await import('bullmq');
				const redisUrl = this.config.get<string>('redis.url')!;
				const scanQueue = new Queue(QUEUES.PLUGIN_SCANS, {
					connection: { url: redisUrl },
				});
				await scanQueue.add(
					JOB_TYPES.PLUGIN_SCAN_RUN,
					{ environmentId, jobExecutionId: Number(scanExec.id) },
					{ jobId: scanBullJobId },
				);
				await scanQueue.close();
			}

			await job.updateProgress(100);
			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'completed', completed_at: new Date(), progress: 100 },
			});

			await tracker.track({
				step: `composer ${action} complete`,
				level: 'info',
			});
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`Plugin manage job ${job.id} failed: ${msg}`);
			await tracker
				.track({
					step: `composer ${action} failed`,
					level: 'error',
					detail: msg,
				})
				.catch(() => {});
			await this.prisma.jobExecution
				.update({
					where: { id: BigInt(jobExecutionId) },
					data: {
						status: 'failed',
						last_error: msg,
						completed_at: new Date(),
					},
				})
				.catch(() => {});
			throw err;
		}
	}
}
