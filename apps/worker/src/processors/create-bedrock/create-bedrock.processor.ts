import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import { QUEUES } from '@bedrock-forge/shared';

/**
 * CreateBedrockProcessor
 * Sets up a Bedrock WordPress installation on a remote server.
 * Steps:
 *  1. Install Composer globally if missing
 *  2. Run composer create-project roots/bedrock in the docroot
 *  3. Write .env with DB credentials
 *  4. Generate salts
 */
@Processor(QUEUES.PROJECTS)
export class CreateBedrockProcessor extends WorkerHost {
	private readonly logger = new Logger(CreateBedrockProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly sshKey: SshKeyService,
	) {
		super();
	}

	async process(job: Job) {
		const { environmentId, jobExecutionId } = job.data;

		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'active', started_at: new Date() },
		});

		try {
			const env = await this.prisma.environment.findUniqueOrThrow({
				where: { id: BigInt(environmentId) },
				include: { server: true },
			});

			const server = env.server;
			const executor = createRemoteExecutor({
				host: server.ip_address,
				port: server.ssh_port,
				username: server.ssh_user,
				privateKey: await this.sshKey.resolvePrivateKey(server),
			});

			await job.updateProgress(5);

			// Verify/install composer
			await executor.execute(
				"command -v composer || php -r \"copy('https://getcomposer.org/installer', '/tmp/composer-setup.php');\" && php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer",
			);
			await job.updateProgress(20);

			// Create project
			await executor.execute(
				`composer create-project roots/bedrock ${env.root_path} --no-interaction`,
			);
			await job.updateProgress(70);

			// Generate salts
			const salts = await executor.execute(
				'php -r "echo base64_encode(random_bytes(64));"',
			);

			// Write .env
			const envContent = `
DB_NAME=wordpress
DB_USER=wordpress
DB_PASSWORD=change_me
DB_HOST=localhost
WP_ENV=${env.type}
WP_HOME=${env.url}
WP_SITEURL=\${WP_HOME}/wp
AUTH_KEY='${salts.stdout.slice(0, 64)}'
SECURE_AUTH_KEY='${salts.stdout.slice(64, 128)}'
`.trim();

			await executor.pushFile({
				remotePath: `${env.root_path}/.env`,
				content: Buffer.from(envContent),
			});
			await job.updateProgress(100);

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'completed', completed_at: new Date() },
			});

			this.logger.log(
				`Bedrock created at ${env.root_path} on server ${server.name}`,
			);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`CreateBedrock job failed: ${msg}`);
			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: {
					status: 'failed',
					last_error: msg,
					completed_at: new Date(),
				},
			});
			throw err;
		}
	}
}
