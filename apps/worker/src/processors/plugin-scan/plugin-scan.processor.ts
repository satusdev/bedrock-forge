import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import { CredentialParserService } from '@bedrock-forge/remote-executor';
import { QUEUES, JOB_TYPES, PluginInfo } from '@bedrock-forge/shared';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';

@Processor(QUEUES.PLUGIN_SCANS)
export class PluginScanProcessor extends WorkerHost {
	private readonly logger = new Logger(PluginScanProcessor.name);
	private readonly credParser = new CredentialParserService();

	constructor(
		private readonly prisma: PrismaService,
		private readonly enc: EncryptionService,
		private readonly config: ConfigService,
	) {
		super();
	}

	async process(job: Job) {
		const { environmentId, jobExecutionId } = job.data;

		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'running', started_at: new Date() },
		});

		try {
			const env = await this.prisma.environment.findUniqueOrThrow({
				where: { id: BigInt(environmentId) },
				include: { project: { include: { server: true } } },
			});

			const server = env.project.server;
			const executor = createRemoteExecutor({
				serverId: Number(server.id),
				host: server.ip_address,
				port: server.ssh_port,
				username: server.ssh_username,
				privateKey: this.enc.decrypt(server.ssh_private_key),
				passphrase: server.ssh_passphrase
					? this.enc.decrypt(server.ssh_passphrase)
					: undefined,
			});

			await job.updateProgress(10);

			const scriptsPath = this.config.get<string>('scriptsPath')!;
			const remoteScript = `/tmp/plugin_scan_${job.id}.php`;
			const scriptContent = require('fs').readFileSync(
				join(scriptsPath, 'plugin-scan.php'),
			);
			await executor.pushFile({
				remotePath: remoteScript,
				content: scriptContent,
			});

			await job.updateProgress(30);

			// Pull wp-config.php to extract DB creds for version checking
			const wpConfigContent = await executor.pullFile(
				`${env.docroot}/wp-config.php`,
			);
			const creds = this.credParser.parseWpConfig(
				wpConfigContent.toString('utf8'),
			);

			const result = await executor.execute(
				`php ${remoteScript} --docroot=${env.docroot}`,
			);
			const plugins: PluginInfo[] = JSON.parse(result.stdout);

			await job.updateProgress(80);

			await this.prisma.pluginScan.create({
				data: {
					environment_id: env.id,
					plugins: plugins as never,
					plugin_count: plugins.length,
					outdated_count: plugins.filter(p => p.update_available).length,
					scanned_at: new Date(),
				},
			});

			await executor.execute(`rm -f ${remoteScript}`);
			await job.updateProgress(100);

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'completed', completed_at: new Date() },
			});
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`Plugin scan job ${job.id} failed: ${msg}`);
			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: {
					status: 'failed',
					error_message: msg,
					completed_at: new Date(),
				},
			});
			throw err;
		}
	}
}
