import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
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
import { buildWpCliPrefix } from '../../utils/processor-utils';

/** Wrap a string in single quotes for safe shell embedding on the remote host. */
function shellQuote(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

function normalizeGithubRepoUrl(
	value: string | null | undefined,
): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	const ssh = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
	if (ssh) return `${ssh[1].toLowerCase()}/${ssh[2].toLowerCase()}`;
	const https = trimmed.match(
		/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/i,
	);
	if (https) return `${https[1].toLowerCase()}/${https[2].toLowerCase()}`;
	return trimmed.replace(/\.git$/i, '').toLowerCase();
}

// concurrency=2: plugin scans are SSH+PHP — moderate I/O, two at a time is safe.
@Processor(QUEUES.PLUGIN_SCANS, { concurrency: 2 })
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

			await this.reconcileCustomPluginCatalog(env.id, plugins);

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
				.catch((e) =>
					this.logger.error(
						`Failed to mark JobExecution ${jobExecutionId} as failed: ${e}`,
					),
				);
			throw err;
		}
	}

	private async reconcileCustomPluginCatalog(
		environmentId: bigint,
		plugins: PluginInfo[],
	) {
		const catalog = await this.prisma.customPlugin.findMany({
			where: { type: 'plugin' },
			select: { id: true, slug: true, repo_url: true },
		});
		if (catalog.length === 0 || plugins.length === 0) return;

		const catalogBySlug = new Map(
			catalog.map((plugin) => [plugin.slug, plugin]),
		);
		for (const plugin of plugins) {
			if (plugin.is_mu_plugin) continue;
			const catalogPlugin = catalogBySlug.get(plugin.slug);
			if (!catalogPlugin) continue;

			const scannedRepo = normalizeGithubRepoUrl(plugin.monorepo_repo_url);
			const catalogRepo = normalizeGithubRepoUrl(catalogPlugin.repo_url);
			if (scannedRepo && catalogRepo && scannedRepo !== catalogRepo) continue;

			await this.prisma.environmentCustomPlugin.upsert({
				where: {
					environment_id_custom_plugin_id: {
						environment_id: environmentId,
						custom_plugin_id: catalogPlugin.id,
					},
				},
				update: {
					installed_version: plugin.version || null,
				},
				create: {
					environment_id: environmentId,
					custom_plugin_id: catalogPlugin.id,
					installed_version: plugin.version || null,
				},
			});
		}
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Plugin manage (add / remove / update / update-all via composer)
	// ─────────────────────────────────────────────────────────────────────────

	private async processManage(job: Job) {
		const payload = job.data as PluginManagePayload & { workflow?: 'composer' | 'manual' };
		const {
			environmentId,
			jobExecutionId,
			action,
			slug,
			version,
			skipSafetyBackup,
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

			const env = await this.prisma.environment.findUniqueOrThrow({
				where: { id: BigInt(environmentId) },
				include: { server: true },
			});

			// PRE-FLIGHT BACKUP LOGIC
			if (action !== 'read' && !skipSafetyBackup) {
				if (!env.google_drive_folder_id) {
					throw new Error(
						'Google Drive not configured for this environment. Cannot perform safety backup. Please configure Google Drive or check "Skip safety backup".',
					);
				}

				await tracker.track({
					step: 'Queueing pre-flight backup',
					level: 'info',
				});

				const backupExec = await this.prisma.jobExecution.create({
					data: {
						environment_id: BigInt(environmentId),
						queue_name: QUEUES.BACKUPS,
						job_type: JOB_TYPES.BACKUP_CREATE,
						bull_job_id: '',
						status: 'queued',
					},
				});

				const backup = await this.prisma.backup.create({
					data: {
						environment_id: BigInt(environmentId),
						type: 'db_only',
						status: 'running',
						size_bytes: 0,
						file_path: 'temp',
						job_execution_id: backupExec.id,
					},
				});

				const redisUrl = this.config.get<string>('redis.url')!;
				const backupQueue = new Queue(QUEUES.BACKUPS, {
					connection: { url: redisUrl },
				});
				const { randomUUID } = await import('crypto');
				const backupBullJobId = randomUUID();

				await backupQueue.add(
					JOB_TYPES.BACKUP_CREATE,
					{
						environmentId,
						type: 'db_only',
						jobExecutionId: Number(backupExec.id),
						backupId: Number(backup.id),
					},
					{ jobId: backupBullJobId },
				);
				await backupQueue.close();

				await this.prisma.jobExecution.update({
					where: { id: backupExec.id },
					data: { bull_job_id: backupBullJobId },
				});

				let attempts = 0;
				let backupFailed = false;
				while (attempts < 120) {
					// wait up to 20 minutes (10s intervals)
					const exec = await this.prisma.jobExecution.findUnique({
						where: { id: backupExec.id },
					});
					if (exec?.status === 'completed') break;
					if (exec?.status === 'failed') {
						backupFailed = true;
						throw new Error('Pre-flight backup failed: ' + exec.last_error);
					}
					await new Promise((r) => setTimeout(r, 10000));
					attempts++;
				}
				if (attempts >= 120 && !backupFailed) {
					throw new Error('Pre-flight backup timed out after 20 minutes');
				}

				await tracker.track({
					step: 'Pre-flight backup completed successfully',
					level: 'info',
				});
				await job.updateProgress(5);
			}

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

			// WP-CLI resolves the docroot via --path; for Bedrock the core is at
			// <root_path>/web/wp — detect by checking if that subdirectory exists.
			const wpPathResult = await executor.execute(
				`[ -d ${shellQuote(env.root_path + '/web/wp')} ] && echo bedrock || echo standard`,
				{ timeout: 10_000 },
			);
			const isBedrockLayout = wpPathResult.stdout.trim() === 'bedrock';
			const wpPath = isBedrockLayout
				? `${env.root_path}/web/wp`
				: env.root_path;

			await tracker.track({
				step: 'Detected WP layout',
				level: 'info',
				detail: `${isBedrockLayout ? 'Bedrock (web/wp)' : 'Standard'} at ${wpPath}`,
			});

			const {
				prefix: wpPrefix,
				allowRootFlag,
				lsphpBin,
				wpBin,
			} = await buildWpCliPrefix(executor, wpPath);

			const buildWpCmd = (args: string): string => {
				let phpAndWp: string;
				if (lsphpBin && wpBin) {
					phpAndWp = `${shellQuote(lsphpBin)} ${shellQuote(wpBin)}`;
				} else if (lsphpBin) {
					phpAndWp = `env WP_CLI_PHP=${shellQuote(lsphpBin)} wp`;
				} else {
					phpAndWp = 'wp';
				}
				return [wpPrefix, phpAndWp, args.trim(), allowRootFlag]
					.filter(Boolean)
					.join(' ');
			};

			// Fetch the latest scan to check plugin attributes (like managed_by_composer)
			const latestScan = await this.prisma.pluginScan.findFirst({
				where: { environment_id: BigInt(environmentId) },
				orderBy: { scanned_at: 'desc' },
			});
			let isComposerManaged = false;
			if (latestScan && latestScan.plugins) {
				const output = latestScan.plugins as any;
				const pluginsList = Array.isArray(output) ? output : (output.plugins || []);
				const matchedPlugin = pluginsList.find((p: any) => p.slug === slug);
				if (matchedPlugin && matchedPlugin.managed_by_composer) {
					isComposerManaged = true;
				}
			}

			let useComposer = false;
			if (action === 'update-all' || action === 'change-constraint' || action === 'read' || action === 'update') {
				useComposer = true;
			} else if (action === 'remove') {
				useComposer = true;
			} else if (action === 'add') {
				useComposer = isBedrockLayout && (!payload.workflow || payload.workflow === 'composer');
			} else if (action === 'delete') {
				useComposer = isBedrockLayout && isComposerManaged;
			} else if (action === 'migrate-to-composer') {
				useComposer = true;
			}

			let manageResult: { code: number; stdout: string; stderr: string };
			const manageStart = Date.now();

			if (useComposer) {
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

				if (action === 'migrate-to-composer') {
					if (!isBedrockLayout) {
						throw new Error('Migration to Composer is only supported in Bedrock environments.');
					}
					if (!slug) {
						throw new Error('Plugin slug is required for migration.');
					}

					await tracker.track({
						step: 'Renaming manual plugin directory for backup',
						level: 'info',
						detail: slug,
					});

					const backupDirCmd = `mv ${shellQuote(env.root_path + '/web/app/plugins/' + slug)} ${shellQuote(env.root_path + '/web/app/plugins/' + slug + '_backup')}`;
					await executor.execute(backupDirCmd);

					const composerCmd = `php ${remoteScript} --docroot=${shellQuote(env.root_path)} --action=add --package=${shellQuote('wpackagist-plugin/' + slug)}`;
					await tracker.track({
						step: 'Requiring package via composer',
						level: 'info',
						detail: `wpackagist-plugin/${slug}`,
					});

					manageResult = await executor.execute(composerCmd, { timeout: 10 * 60 * 1000 });
					await tracker.trackCommand(
						`composer add wpackagist-plugin/${slug}`,
						composerCmd,
						manageResult,
						Date.now() - manageStart,
					);

					if (manageResult.code === 0) {
						await tracker.track({
							step: 'Cleaning up manual backup',
							level: 'info',
						});
						await executor.execute(`rm -rf ${shellQuote(env.root_path + '/web/app/plugins/' + slug + '_backup')}`);
					} else {
						await tracker.track({
							step: 'Composer failed. Restoring manual plugin backup',
							level: 'warn',
							detail: manageResult.stderr,
						});
						await executor.execute(`mv ${shellQuote(env.root_path + '/web/app/plugins/' + slug + '_backup')} ${shellQuote(env.root_path + '/web/app/plugins/' + slug)}`);
						throw new Error(`composer migration failed: ${manageResult.stderr}`);
					}
				} else {
					const pkgArg = slug
						? ` --package=${shellQuote(`wpackagist-plugin/${slug}`)}`
						: '';
					const versionArg = version ? ` --version=${shellQuote(version)}` : '';
					const constraintArg = payload.constraint
						? ` --constraint=${shellQuote(payload.constraint)}`
						: '';
					const composerAction = action === 'delete' ? 'remove' : action;
					const cmd =
						`php ${remoteScript} --docroot=${shellQuote(env.root_path)}` +
						` --action=${shellQuote(composerAction)}${pkgArg}${versionArg}${constraintArg}`;

					await tracker.track({
						step: `Running composer ${composerAction}`,
						level: 'info',
						detail: slug ?? 'all packages',
					});

					manageResult = await executor.execute(cmd, {
						timeout: 10 * 60 * 1000,
					});
					await tracker.trackCommand(
						`composer ${composerAction}`,
						cmd,
						manageResult,
						Date.now() - manageStart,
					);
				}

				await executor.execute(`rm -f ${remoteScript}`);
			} else {
				// WP-CLI Action
				let cliArgs = '';
				if (action === 'add') {
					if (!slug) throw new Error('Plugin slug is required to install.');
					const wpVer = version ? ` --version=${shellQuote(version)}` : '';
					cliArgs = `plugin install ${shellQuote(slug)}${wpVer}`;
				} else if (action === 'delete') {
					if (!slug) throw new Error('Plugin slug is required to delete.');
					cliArgs = `plugin delete ${shellQuote(slug)}`;
				} else if (action === 'activate') {
					if (!slug) throw new Error('Plugin slug is required to activate.');
					cliArgs = `plugin activate ${shellQuote(slug)}`;
				} else if (action === 'deactivate') {
					if (!slug) throw new Error('Plugin slug is required to deactivate.');
					cliArgs = `plugin deactivate ${shellQuote(slug)}`;
				} else {
					throw new Error(`Unsupported WP-CLI action: ${action}`);
				}

				const cmd = buildWpCmd(`${cliArgs} --path=${shellQuote(wpPath)}`);

				await tracker.track({
					step: `Running wp-cli ${action}`,
					level: 'info',
					detail: slug,
				});

				manageResult = await executor.execute(cmd, { timeout: 2 * 60 * 1000 });
				await tracker.trackCommand(
					`wp-cli ${action}`,
					cmd,
					manageResult,
					Date.now() - manageStart,
				);
			}

			if (manageResult.code !== 0) {
				throw new Error(
					`Action ${action} failed (exit ${manageResult.code}): ${manageResult.stderr}`,
				);
			}

			await job.updateProgress(70);

			if (action === 'read') {
				// Store the full JSON response as a retrievable log entry.
				await tracker.track({
					step: 'composer-read-result',
					level: 'info',
					detail: manageResult.stdout,
				});
			} else {
				// Always trigger a fresh plugin scan after any mutation so the stored
				// plugin list reflects the updated state.
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
			}

			await job.updateProgress(100);
			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'completed', completed_at: new Date(), progress: 100 },
			});

			await tracker.track({
				step: `Action ${action} complete`,
				level: 'info',
			});
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`Plugin manage job ${job.id} failed: ${msg}`);
			await tracker
				.track({
					step: `Action ${action} failed`,
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
