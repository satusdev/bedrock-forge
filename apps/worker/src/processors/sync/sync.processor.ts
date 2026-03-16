import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../encryption/encryption.service';
import {
	createRemoteExecutor,
	CredentialParserService,
} from '@bedrock-forge/remote-executor';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';

@Processor(QUEUES.SYNC)
export class SyncProcessor extends WorkerHost {
	private readonly logger = new Logger(SyncProcessor.name);
	private readonly credParser = new CredentialParserService();

	constructor(
		private readonly prisma: PrismaService,
		private readonly enc: EncryptionService,
	) {
		super();
	}

	async process(job: Job) {
		const { jobExecutionId } = job.data;
		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'running', started_at: new Date() },
		});

		try {
			if (job.name === JOB_TYPES.SYNC_CLONE) {
				await this.processClone(job);
			} else {
				await this.processPush(job);
			}

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'completed', completed_at: new Date() },
			});
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
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

	private async processClone(job: Job) {
		const { sourceEnvironmentId, targetEnvironmentId, searchReplace } =
			job.data;

		const [sourceEnv, targetEnv] = await Promise.all([
			this.prisma.environment.findUniqueOrThrow({
				where: { id: BigInt(sourceEnvironmentId) },
				include: { project: { include: { server: true } } },
			}),
			this.prisma.environment.findUniqueOrThrow({
				where: { id: BigInt(targetEnvironmentId) },
				include: { project: { include: { server: true } } },
			}),
		]);

		const sourceServer = sourceEnv.project.server;
		const sourceExecutor = createRemoteExecutor({
			serverId: Number(sourceServer.id),
			host: sourceServer.ip_address,
			port: sourceServer.ssh_port,
			username: sourceServer.ssh_username,
			privateKey: this.enc.decrypt(sourceServer.ssh_private_key),
			passphrase: sourceServer.ssh_passphrase
				? this.enc.decrypt(sourceServer.ssh_passphrase)
				: undefined,
		});

		await job.updateProgress(10);

		// Pull source wp-config to get DB credentials
		const sourceWpConfig = await sourceExecutor.pullFile(
			`${sourceEnv.docroot}/wp-config.php`,
		);
		const sourceCreds = this.credParser.parseWpConfig(
			sourceWpConfig.toString('utf8'),
		);

		// Dump DB from source
		const dumpCmd = `mysqldump -h${sourceCreds.DB_HOST} -u${sourceCreds.DB_USER} -p${sourceCreds.DB_PASSWORD} ${sourceCreds.DB_NAME} > /tmp/sync_${job.id}.sql`;
		await sourceExecutor.execute(dumpCmd);
		await job.updateProgress(40);

		const dumpBuffer = await sourceExecutor.pullFile(`/tmp/sync_${job.id}.sql`);
		await sourceExecutor.execute(`rm -f /tmp/sync_${job.id}.sql`);

		await job.updateProgress(60);

		// Push to target
		const targetServer = targetEnv.project.server;
		const targetExecutor = createRemoteExecutor({
			serverId: Number(targetServer.id),
			host: targetServer.ip_address,
			port: targetServer.ssh_port,
			username: targetServer.ssh_username,
			privateKey: this.enc.decrypt(targetServer.ssh_private_key),
			passphrase: targetServer.ssh_passphrase
				? this.enc.decrypt(targetServer.ssh_passphrase)
				: undefined,
		});

		const targetWpConfig = await targetExecutor.pullFile(
			`${targetEnv.docroot}/wp-config.php`,
		);
		const targetCreds = this.credParser.parseWpConfig(
			targetWpConfig.toString('utf8'),
		);

		await targetExecutor.pushFile({
			remotePath: `/tmp/sync_${job.id}.sql`,
			content: dumpBuffer,
		});
		const importCmd = `mysql -h${targetCreds.DB_HOST} -u${targetCreds.DB_USER} -p${targetCreds.DB_PASSWORD} ${targetCreds.DB_NAME} < /tmp/sync_${job.id}.sql`;
		await targetExecutor.execute(importCmd);
		await targetExecutor.execute(`rm -f /tmp/sync_${job.id}.sql`);

		if (searchReplace) {
			await targetExecutor.execute(
				`mysql -h${targetCreds.DB_HOST} -u${targetCreds.DB_USER} -p${targetCreds.DB_PASSWORD} ${targetCreds.DB_NAME} -e "UPDATE wp_options SET option_value = REPLACE(option_value, '${sourceEnv.domain}', '${targetEnv.domain}') WHERE option_name IN ('siteurl','home')"`,
			);
		}

		await job.updateProgress(100);
	}

	private async processPush(job: Job) {
		// Placeholder for files-based sync (rsync)
		const { environmentId, scope } = job.data;
		this.logger.log(`Sync push for env ${environmentId}, scope: ${scope}`);
		await job.updateProgress(100);
	}
}
