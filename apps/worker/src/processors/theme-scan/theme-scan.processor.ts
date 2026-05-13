import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { StepTracker } from '../../services/step-tracker';
import { createRemoteExecutor } from '@bedrock-forge/remote-executor';
import {
	QUEUES,
	JOB_TYPES,
	ThemeInfo,
	ThemeManagePayload,
	ThemeScanRunPayload,
} from '@bedrock-forge/shared';
import { ConfigService } from '@nestjs/config';
import { buildWpCliPrefix } from '../../utils/processor-utils';

/** Wrap a string in single quotes for safe shell embedding on the remote host. */
function shellQuote(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

type RawThemeInfo = Record<string, unknown>;

function isInvalidWpCliFieldError(result: {
	stderr?: string;
	stdout?: string;
}) {
	const output = `${result.stderr ?? ''}\n${result.stdout ?? ''}`.toLowerCase();
	return output.includes('invalid field') || output.includes('unknown field');
}

export function normalizeThemeInfo(raw: RawThemeInfo): ThemeInfo | null {
	const name = typeof raw.name === 'string' ? raw.name.trim() : '';
	if (!name) return null;

	const rawStatus = typeof raw.status === 'string' ? raw.status : 'inactive';
	const status: ThemeInfo['status'] =
		rawStatus === 'active' ? 'active' : 'inactive';
	const update =
		raw.update === 'available'
			? 'available'
			: raw.update === 'none available'
				? 'none available'
				: 'none';
	const updateVersion =
		typeof raw.update_version === 'string' && raw.update_version.trim()
			? raw.update_version.trim()
			: null;

	return {
		name,
		slug: name,
		status,
		version: typeof raw.version === 'string' ? raw.version : '',
		update_version: updateVersion,
		update,
		title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : name,
		description:
			typeof raw.description === 'string' && raw.description.trim()
				? raw.description
				: null,
		author:
			typeof raw.author === 'string' && raw.author.trim() ? raw.author : null,
	};
}

export function parseThemeListJson(stdout: string): ThemeInfo[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		throw new Error(`wp theme list returned invalid JSON: ${detail}`);
	}

	if (!Array.isArray(parsed)) {
		throw new Error('wp theme list returned invalid JSON: expected an array');
	}

	return parsed
		.map(row => normalizeThemeInfo(row as RawThemeInfo))
		.filter((theme): theme is ThemeInfo => theme !== null);
}

// concurrency=2: theme scans are SSH+wp-cli — moderate I/O, two at a time is safe.
@Processor(QUEUES.THEME_SCANS, { concurrency: 2 })
export class ThemeScanProcessor extends WorkerHost {
	private readonly logger = new Logger(ThemeScanProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly config: ConfigService,
		private readonly sshKey: SshKeyService,
	) {
		super();
	}

	async process(job: Job) {
		if (job.name === JOB_TYPES.THEME_MANAGE) {
			return this.processManage(job);
		}
		return this.processScan(job);
	}

	// ─────────────────────────────────────────────────────────────────────────
	// Theme scan — wp theme list --format=json
	// ─────────────────────────────────────────────────────────────────────────

	private async processScan(job: Job) {
		const { environmentId, jobExecutionId } = job.data as ThemeScanRunPayload;

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
				step: 'Theme scan started',
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

			const fields =
				'name,status,version,update_version,update,title,description,author';
			let cmd = buildWpCmd(
				`theme list --format=json --fields=${fields} --path=${shellQuote(wpPath)}`,
			);

			await tracker.track({
				step: 'Running wp theme list',
				level: 'info',
				detail: `path=${wpPath}`,
			});

			let scanStart = Date.now();
			let result = await executor.execute(cmd, { timeout: 3 * 60 * 1_000 });
			await tracker.trackCommand(
				'wp theme list',
				cmd,
				result,
				Date.now() - scanStart,
			);

			if (result.code !== 0 && isInvalidWpCliFieldError(result)) {
				await tracker.track({
					step: 'Retrying wp theme list without field filter',
					level: 'warn',
					detail: 'WP-CLI rejected one or more requested fields',
				});
				cmd = buildWpCmd(
					`theme list --format=json --path=${shellQuote(wpPath)}`,
				);
				scanStart = Date.now();
				result = await executor.execute(cmd, { timeout: 3 * 60 * 1_000 });
				await tracker.trackCommand(
					'wp theme list fallback',
					cmd,
					result,
					Date.now() - scanStart,
				);
			}

			if (result.code !== 0) {
				throw new Error(
					`wp theme list failed (exit ${result.code}): ${result.stderr}`,
				);
			}

			await tracker.track({ step: 'Parsing theme results', level: 'info' });
			const themes = parseThemeListJson(result.stdout);

			// Fetch WP version — best-effort, does not fail the scan
			let wpVersion = '';
			try {
				const versionResult = await executor.execute(
					buildWpCmd(`core version --path=${shellQuote(wpPath)}`),
					{ timeout: 15_000 },
				);
				wpVersion = versionResult.stdout.trim();
				if (wpVersion) {
					await tracker.track({
						step: 'WP version',
						level: 'info',
						detail: wpVersion,
					});
				}
			} catch {
				// non-fatal — continue without version
			}

			await job.updateProgress(80);

			await this.prisma.themeScan.create({
				data: {
					environment_id: env.id,
					themes: themes as never,
					scanned_at: new Date(),
				},
			});

			await tracker.track({
				step: 'Storing scan results',
				level: 'info',
				detail: `${themes.length} themes found`,
			});

			await job.updateProgress(100);

			await this.prisma.jobExecution.update({
				where: { id: BigInt(jobExecutionId) },
				data: { status: 'completed', completed_at: new Date(), progress: 100 },
			});

			await tracker.track({
				step: 'Theme scan complete',
				level: 'info',
				detail: wpVersion
					? `${themes.length} themes · WP ${wpVersion}`
					: `${themes.length} themes`,
			});

			this.logger.log(
				`[${job.id}] Theme scan complete. ${themes.length} themes found.`,
			);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`Theme scan job ${job.id} failed: ${msg}`);
			await tracker
				.track({ step: 'Theme scan failed', level: 'error', detail: msg })
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

	// ─────────────────────────────────────────────────────────────────────────
	// Theme manage — activate / install / delete / update / update-all
	// ─────────────────────────────────────────────────────────────────────────

	private async processManage(job: Job) {
		const payload = job.data as ThemeManagePayload;
		const { environmentId, jobExecutionId, action, slug } = payload;

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

			// Detect Bedrock layout (same as processScan)
			const wpPathResult = await executor.execute(
				`[ -d ${shellQuote(env.root_path + '/web/wp')} ] && echo bedrock || echo standard`,
				{ timeout: 10_000 },
			);
			const isBedrockLayout = wpPathResult.stdout.trim() === 'bedrock';
			const wpPath = isBedrockLayout
				? `${env.root_path}/web/wp`
				: env.root_path;

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

			let cmd: string;
			switch (action) {
				case 'activate':
					if (!slug) throw new Error('slug required for theme activate');
					cmd = buildWpCmd(
						`theme activate ${shellQuote(slug)} --path=${shellQuote(wpPath)}`,
					);
					break;
				case 'install':
					if (!slug) throw new Error('slug required for theme install');
					cmd = buildWpCmd(
						`theme install ${shellQuote(slug)} --path=${shellQuote(wpPath)}`,
					);
					break;
				case 'delete':
					if (!slug) throw new Error('slug required for theme delete');
					cmd = buildWpCmd(
						`theme delete ${shellQuote(slug)} --path=${shellQuote(wpPath)}`,
					);
					break;
				case 'update':
					if (!slug) throw new Error('slug required for theme update');
					cmd = buildWpCmd(
						`theme update ${shellQuote(slug)} --path=${shellQuote(wpPath)}`,
					);
					break;
				case 'update-all':
					cmd = buildWpCmd(`theme update --all --path=${shellQuote(wpPath)}`);
					break;
				default:
					throw new Error(`Unknown theme action: ${String(action)}`);
			}

			await tracker.track({
				step: `Running wp theme ${action}`,
				level: 'info',
				detail: slug ?? 'all themes',
			});

			await job.updateProgress(20);

			const manageStart = Date.now();
			const manageResult = await executor.execute(cmd, {
				timeout: 5 * 60 * 1_000,
			});
			await tracker.trackCommand(
				`wp theme ${action}`,
				cmd,
				manageResult,
				Date.now() - manageStart,
			);

			if (manageResult.code !== 0) {
				throw new Error(
					`wp theme ${action} failed (exit ${manageResult.code}): ${manageResult.stderr}`,
				);
			}

			await job.updateProgress(70);

			// Trigger a fresh theme scan after any action so the stored list reflects
			// the updated state.
			await tracker.track({
				step: 'Triggering fresh theme scan',
				level: 'info',
			});

			const { randomUUID } = await import('crypto');
			const scanBullJobId = randomUUID();
			const scanExec = await this.prisma.jobExecution.create({
				data: {
					environment_id: BigInt(environmentId),
					queue_name: QUEUES.THEME_SCANS,
					job_type: JOB_TYPES.THEME_SCAN_RUN,
					bull_job_id: scanBullJobId,
				},
			});

			const { Queue } = await import('bullmq');
			const redisUrl = this.config.get<string>('redis.url')!;
			const scanQueue = new Queue(QUEUES.THEME_SCANS, {
				connection: { url: redisUrl },
			});
			await scanQueue.add(
				JOB_TYPES.THEME_SCAN_RUN,
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
				step: `wp theme ${action} complete`,
				level: 'info',
			});
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.error(`Theme manage job ${job.id} failed: ${msg}`);
			await tracker
				.track({
					step: `theme ${action} failed`,
					level: 'error',
					detail: msg,
				})
				.catch(() => {});
			await this.prisma.jobExecution
				.update({
					where: { id: BigInt(jobExecutionId) },
					data: { status: 'failed', last_error: msg, completed_at: new Date() },
				})
				.catch(() => {});
			throw err;
		}
	}
}
