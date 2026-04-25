import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { StepTracker } from '../../services/step-tracker';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import {
	QUEUES,
	JOB_TYPES,
	CustomPluginManagePayload,
} from '@bedrock-forge/shared';
import { ConfigService } from '@nestjs/config';

/** Wrap a string in single quotes for safe shell embedding on the remote host. */
function shellQuote(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

@Processor(QUEUES.CUSTOM_PLUGINS, { concurrency: 1 })
export class CustomPluginProcessor extends WorkerHost {
	private readonly logger = new Logger(CustomPluginProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly config: ConfigService,
		private readonly sshKey: SshKeyService,
	) {
		super();
	}

	async process(job: Job) {
		return this.processManage(job);
	}

	private async processManage(job: Job) {
		const payload = job.data as CustomPluginManagePayload;
		const {
			environmentId,
			jobExecutionId,
			action,
			customPluginId,
			slug,
			repoUrl,
			repoPath,
			type,
		} = payload;

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
				step: `Custom plugin ${action} started`,
				level: 'info',
				detail: `slug=${slug}, env=${environmentId}`,
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

			// Retrieve optional GitHub token from app settings
			const tokenSetting = await this.prisma.appSetting.findUnique({
				where: { key: 'GITHUB_API_TOKEN' },
			});
			const githubToken = tokenSetting?.value ?? null;

			const scriptsPath = this.config.get<string>('scriptsPath')!;
			const remoteScript = `/tmp/custom_plugin_${job.id}.php`;

			await tracker.track({
				step: 'Uploading custom-plugin-manager script',
				level: 'info',
			});

			const scriptContent = readFileSync(
				join(scriptsPath, 'custom-plugin-manager.php'),
			);
			await executor.pushFile({
				remotePath: remoteScript,
				content: scriptContent,
			});

			await job.updateProgress(20);

			const tokenArg = githubToken
				? ` --github-token=${shellQuote(githubToken)}`
				: '';

			const cmd = [
				`php ${remoteScript}`,
				`--action=${action}`,
				`--docroot=${shellQuote(env.root_path)}`,
				`--slug=${shellQuote(slug)}`,
				`--repo-url=${shellQuote(repoUrl)}`,
				`--repo-path=${shellQuote(repoPath)}`,
				`--type=${shellQuote(type)}`,
				tokenArg,
			]
				.filter(Boolean)
				.join(' ');

			await tracker.track({
				step: `Running custom-plugin-manager --action=${action}`,
				level: 'info',
				detail: slug,
			});

			const manageStart = Date.now();
			const manageResult = await executor.execute(cmd, {
				// composer install can take a while on first run
				timeout: 10 * 60 * 1000,
			});
			await tracker.trackCommand(
				`custom-plugin ${action}`,
				cmd,
				manageResult,
				Date.now() - manageStart,
			);

			if (manageResult.code !== 0) {
				throw new Error(
					`custom-plugin-manager ${action} failed (exit ${manageResult.code}): ${manageResult.stderr}`,
				);
			}

			// Parse output to confirm success
			let output: { success: boolean; error?: string } = { success: true };
			try {
				output = JSON.parse(manageResult.stdout);
			} catch {
				// best-effort parse; non-zero exit already handled above
			}
			if (!output.success) {
				throw new Error(
					output.error ?? `custom-plugin-manager ${action} reported failure`,
				);
			}

			await job.updateProgress(70);
			await executor.execute(`rm -f ${remoteScript}`);

			// Update EnvironmentCustomPlugin junction table
			if (action === 'add') {
				// Fetch latest GitHub tag to record as installed_version
				let installedVersion: string | null = null;
				try {
					const tagRes = await fetch(
						`https://api.github.com/repos/${this.parseOwnerRepo(repoUrl)}/releases/latest`,
						{
							headers: {
								Accept: 'application/vnd.github+json',
								'X-GitHub-Api-Version': '2022-11-28',
								'User-Agent': 'bedrock-forge',
								...(githubToken
									? { Authorization: `Bearer ${githubToken}` }
									: {}),
							},
						},
					);
					if (tagRes.ok) {
						const data = (await tagRes.json()) as { tag_name?: string };
						installedVersion = data.tag_name ?? null;
					}
				} catch {
					// non-fatal: version tracking is best-effort
				}

				await this.prisma.environmentCustomPlugin.upsert({
					where: {
						environment_id_custom_plugin_id: {
							environment_id: BigInt(environmentId),
							custom_plugin_id: BigInt(customPluginId),
						},
					},
					update: {
						installed_version: installedVersion,
					},
					create: {
						environment_id: BigInt(environmentId),
						custom_plugin_id: BigInt(customPluginId),
						installed_version: installedVersion,
					},
				});
			} else if (action === 'remove') {
				await this.prisma.environmentCustomPlugin
					.delete({
						where: {
							environment_id_custom_plugin_id: {
								environment_id: BigInt(environmentId),
								custom_plugin_id: BigInt(customPluginId),
							},
						},
					})
					.catch(() => {
						// already deleted or never existed — safe to ignore
					});
			}

			// Trigger a fresh plugin scan to update the stored plugin list
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

			await job.updateProgress(100);
			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'completed', completed_at: new Date(), progress: 100 },
			});

			await tracker.track({
				step: `Custom plugin ${action} complete`,
				level: 'info',
			});
			this.logger.log(`[${job.id}] Custom plugin ${action} complete: ${slug}`);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`Custom plugin ${action} job ${job.id} failed: ${msg}`);
			await tracker
				.track({
					step: `Custom plugin ${action} failed`,
					level: 'error',
					detail: msg,
				})
				.catch(() => {});
			await this.prisma.jobExecution
				.update({
					where: { id: BigInt(jobExecutionId) },
					data: { status: 'failed', last_error: msg, completed_at: new Date() },
				})
				.catch(e =>
					this.logger.error(
						`Failed to mark JobExecution ${jobExecutionId} as failed: ${e}`,
					),
				);
			throw err;
		}
	}

	/** Extract "owner/repo" from a GitHub URL for the Releases API. */
	private parseOwnerRepo(repoUrl: string): string {
		const sshMatch = repoUrl.match(
			/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/,
		);
		if (sshMatch) return sshMatch[1];
		const httpsMatch = repoUrl.match(
			/^https:\/\/github\.com\/([^/]+\/[^/.]+?)(?:\.git)?$/,
		);
		if (httpsMatch) return httpsMatch[1];
		return '';
	}
}
