import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';

@Processor(QUEUES.BACKUPS)
export class BackupProcessor extends WorkerHost {
	private readonly logger = new Logger(BackupProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly enc: EncryptionService,
		private readonly config: ConfigService,
	) {
		super();
	}

	async process(job: Job) {
		const { environmentId, type, label, jobExecutionId, backupId } = job.data;
		const isRestore = job.name === JOB_TYPES.BACKUP_RESTORE;

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
			const privateKey = this.enc.decrypt(server.ssh_private_key);
			const passphrase = server.ssh_passphrase
				? this.enc.decrypt(server.ssh_passphrase)
				: undefined;

			const executor = createRemoteExecutor({
				serverId: Number(server.id),
				host: server.ip_address,
				port: server.ssh_port,
				username: server.ssh_username,
				privateKey,
				passphrase,
			});

			const scriptsPath = this.config.get<string>('scriptsPath')!;
			const remoteScript = `/tmp/backup_${job.id}.php`;

			await job.updateProgress(10);

			if (!isRestore) {
				// Push backup.php script and run it
				const scriptContent = require('fs').readFileSync(
					join(scriptsPath, 'backup.php'),
				);
				await executor.pushFile({
					remotePath: remoteScript,
					content: scriptContent,
				});

				const result = await executor.execute(
					`php ${remoteScript} --docroot=${env.docroot} --type=${type} --output=/tmp/backup_${job.id}.tar.gz`,
				);
				await job.updateProgress(70);

				const output = JSON.parse(result.stdout) as {
					size: number;
					filename: string;
				};

				await this.prisma.backup.create({
					data: {
						environment_id: env.id,
						type: type as never,
						status: 'completed',
						file_path: output.filename,
						file_size: output.size,
						label: label ?? `${type} backup`,
						completed_at: new Date(),
					},
				});

				// Cleanup remote script
				await executor.execute(`rm -f ${remoteScript}`);
				await job.updateProgress(100);
			} else {
				// Restore flow
				const backup = await this.prisma.backup.findUniqueOrThrow({
					where: { id: BigInt(backupId) },
				});
				await executor.execute(
					`php ${remoteScript} --restore --file=${backup.file_path} --docroot=${env.docroot}`,
				);
				await job.updateProgress(100);
			}

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'completed', completed_at: new Date() },
			});
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`Backup job ${job.id} failed: ${msg}`);
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
