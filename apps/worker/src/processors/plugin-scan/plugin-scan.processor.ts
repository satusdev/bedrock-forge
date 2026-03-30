import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { readFileSync } from 'fs';
import { PrismaService } from '../../prisma/prisma.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { StepTracker } from '../../services/step-tracker';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import { QUEUES, PluginInfo } from '@bedrock-forge/shared';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';

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
		const { environmentId, jobExecutionId } = job.data;

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
			const plugins: PluginInfo[] = JSON.parse(result.stdout);

			await job.updateProgress(80);

			await this.prisma.pluginScan.create({
				data: {
					environment_id: env.id,
					plugins: plugins as never,
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
}
