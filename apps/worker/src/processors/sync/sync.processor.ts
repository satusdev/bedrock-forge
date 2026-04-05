import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { mkdir, rm, mkdtemp } from 'fs/promises';
import { createReadStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PrismaService } from '../../prisma/prisma.service';
import { SshKeyService } from '../../services/ssh-key.service';
import { RcloneService } from '../../services/rclone.service';
import { EncryptionService } from '../../encryption/encryption.service';
import { StepTracker } from '../../services/step-tracker';
import {
	createRemoteExecutor,
	CredentialParserService,
} from '@bedrock-forge/remote-executor';
import { QUEUES, JOB_TYPES } from '@bedrock-forge/shared';
import { escapeMysql } from '../../utils/cyberpanel-http';
import { shellQuote, flipProtocol } from '../../utils/processor-utils';

const STAGING_DIR = '/tmp/forge-sync';

type Creds = {
	dbHost: string;
	dbUser: string;
	dbPassword: string;
	dbName: string;
};
type Executor = Awaited<ReturnType<typeof createRemoteExecutor>>;

// concurrency=1: sync jobs do SSH+mysqldump+rsync — serialised to avoid
// saturating CPU/network on concurrent large file transfers.
@Processor(QUEUES.SYNC, { concurrency: 1, lockDuration: 90 * 60 * 1_000 })
export class SyncProcessor extends WorkerHost {
	private readonly logger = new Logger(SyncProcessor.name);
	private readonly credParser = new CredentialParserService();

	constructor(
		private readonly prisma: PrismaService,
		private readonly sshKey: SshKeyService,
		private readonly rclone: RcloneService,
		private readonly encryption: EncryptionService,
		@InjectQueue(QUEUES.SYNC) private readonly syncQueue: Queue,
	) {
		super();
	}

	private async isCancelled(jobId: string | undefined): Promise<boolean> {
		if (!jobId) return false;
		const redis = await this.syncQueue.client;
		return (await redis.get(`forge:cancel:${jobId}`)) === '1';
	}

	async process(job: Job) {
		const { jobExecutionId } = job.data;
		await this.prisma.jobExecution.update({
			where: { id: BigInt(jobExecutionId) },
			data: { status: 'active', started_at: new Date() },
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
					last_error: msg,
					completed_at: new Date(),
				},
			});
			throw err;
		}
	}

	// ── Clone ──────────────────────────────────────────────────────────────────

	private async processClone(job: Job) {
		const { sourceEnvironmentId, targetEnvironmentId, jobExecutionId } =
			job.data;

		const tracker = new StepTracker(
			this.prisma,
			BigInt(jobExecutionId),
			this.logger,
			job.id ?? '',
		);

		await tracker.track({
			step: 'Database sync started',
			level: 'info',
			detail: `source env ${sourceEnvironmentId} → target env ${targetEnvironmentId}`,
		});

		// Load environments
		const [sourceEnv, targetEnv] = await Promise.all([
			this.prisma.environment.findUniqueOrThrow({
				where: { id: BigInt(sourceEnvironmentId) },
				include: { server: true, project: true },
			}),
			this.prisma.environment.findUniqueOrThrow({
				where: { id: BigInt(targetEnvironmentId) },
				include: { server: true, project: true },
			}),
		]);

		// Connect to both servers
		await tracker.track({
			step: 'Connecting to source server',
			level: 'info',
			detail: sourceEnv.server.ip_address,
		});
		const sourceExecutor = createRemoteExecutor({
			host: sourceEnv.server.ip_address,
			port: sourceEnv.server.ssh_port,
			username: sourceEnv.server.ssh_user,
			privateKey: await this.sshKey.resolvePrivateKey(sourceEnv.server),
		});

		await tracker.track({
			step: 'Connecting to target server',
			level: 'info',
			detail: targetEnv.server.ip_address,
		});
		const targetExecutor = createRemoteExecutor({
			host: targetEnv.server.ip_address,
			port: targetEnv.server.ssh_port,
			username: targetEnv.server.ssh_user,
			privateKey: await this.sshKey.resolvePrivateKey(targetEnv.server),
		});

		await job.updateProgress({ value: 5, step: 'Connected to servers' });

		// Resolve credentials
		await tracker.track({
			step: 'Reading source database credentials',
			level: 'info',
			detail: sourceEnv.root_path,
		});
		const sourceCreds = await this.resolveCredentials(
			sourceExecutor,
			sourceEnv.root_path,
			tracker,
			'source',
			sourceEnv.id,
		);

		await tracker.track({
			step: 'Reading target database credentials',
			level: 'info',
			detail: targetEnv.root_path,
		});
		const targetCreds = await this.resolveCredentials(
			targetExecutor,
			targetEnv.root_path,
			tracker,
			'target',
			targetEnv.id,
		);

		await job.updateProgress({ value: 15, step: 'Credentials resolved' });

		// Auto-detect URLs for search-replace — no manual input required
		const sourceUrl = await this.resolveWpUrl(
			sourceExecutor,
			sourceCreds,
			tracker,
			'source',
			sourceEnv.url,
		);
		const targetUrl = await this.resolveWpUrl(
			targetExecutor,
			targetCreds,
			tracker,
			'target',
			targetEnv.url,
		);

		await job.updateProgress({ value: 20, step: 'URLs resolved' });

		// Safety backup of target (optional if skipSafetyBackup=true, mandatory otherwise)
		if (job.data.skipSafetyBackup) {
			await tracker.track({
				step: 'Safety backup SKIPPED — data loss risk accepted by user',
				level: 'warn',
				detail:
					'skipSafetyBackup=true was passed. The target database will be overwritten without a prior backup.',
			});
		} else {
			await this.createSafetyBackup(
				job,
				targetEnv,
				targetExecutor,
				targetCreds,
				tracker,
			);
		}
		await job.updateProgress({ value: 40, step: 'Safety backup complete' });

		if (await this.isCancelled(job.id)) throw new Error('Cancelled by user');

		// Dump source DB
		// Use --defaults-extra-file (temp .my.cnf) instead of MYSQL_PWD.
		// MariaDB 10.6+ (CyberPanel) silently ignores MYSQL_PWD; this approach
		// mirrors backup.php and works on all MySQL/MariaDB versions.
		const dumpRemote = `/tmp/sync_${job.id}.sql`;
		const srcMycnf = `/tmp/forge_sync_src_${job.id}.cnf`;
		await sourceExecutor.pushFile({
			remotePath: srcMycnf,
			content: Buffer.from(
				`[client]\nuser=${sourceCreds.dbUser}\npassword=${sourceCreds.dbPassword}\nhost=${sourceCreds.dbHost}\n`,
			),
		});
		await sourceExecutor.execute(`chmod 600 ${srcMycnf}`);
		const maskedDump = `mysqldump --defaults-extra-file=*** --single-transaction --quick ${sourceCreds.dbName}`;

		await tracker.track({
			step: 'Dumping source database',
			level: 'info',
			command: maskedDump,
		});
		const dumpStart = Date.now();
		const dumpResult = await sourceExecutor.execute(
			`mysqldump --defaults-extra-file=${srcMycnf} --single-transaction --quick ${sourceCreds.dbName} > ${dumpRemote}`,
		);
		await sourceExecutor.execute(`rm -f ${srcMycnf}`);
		await tracker.trackCommand(
			'mysqldump source database',
			maskedDump,
			dumpResult,
			Date.now() - dumpStart,
		);

		if (dumpResult.code !== 0) {
			throw new Error(
				`mysqldump failed (exit ${dumpResult.code}): ${dumpResult.stderr}`,
			);
		}

		await job.updateProgress({ value: 55, step: 'Source database dumped' });

		if (await this.isCancelled(job.id)) throw new Error('Cancelled by user');

		// Transfer dump to target via worker disk relay (avoids buffering in process memory)
		await tracker.track({
			step: 'Transferring database dump to target',
			level: 'info',
		});
		const localDumpDir = await mkdtemp(join(tmpdir(), 'forge-sync-'));
		const localDumpPath = join(localDumpDir, `sync_${job.id}.sql`);
		try {
			await sourceExecutor.pullFileToPath(dumpRemote, localDumpPath);
			const cleanSrcResult = await sourceExecutor.execute(
				`rm -f ${dumpRemote}`,
			);
			await tracker.trackCommand(
				'Source temp cleanup',
				`rm -f ${dumpRemote}`,
				cleanSrcResult,
				0,
			);

			const readStream = createReadStream(localDumpPath);
			await targetExecutor.pushFileFromStream(dumpRemote, readStream);
		} finally {
			await rm(localDumpDir, { recursive: true, force: true });
		}
		await job.updateProgress({ value: 65, step: 'Dump transferred to target' });

		// Import on target
		const tgtMycnf = `/tmp/forge_sync_imp_${job.id}.cnf`;
		await targetExecutor.pushFile({
			remotePath: tgtMycnf,
			content: Buffer.from(
				`[client]\nuser=${targetCreds.dbUser}\npassword=${targetCreds.dbPassword}\nhost=${targetCreds.dbHost}\n`,
			),
		});
		await targetExecutor.execute(`chmod 600 ${tgtMycnf}`);
		const maskedImport = `mysql --defaults-extra-file=*** ${targetCreds.dbName}`;

		await tracker.track({
			step: 'Importing database on target',
			level: 'info',
			command: maskedImport,
		});
		const importStart = Date.now();
		const importResult = await targetExecutor.execute(
			`mysql --defaults-extra-file=${tgtMycnf} ${targetCreds.dbName} < ${dumpRemote}`,
		);
		await targetExecutor.execute(`rm -f ${tgtMycnf}`);
		await tracker.trackCommand(
			'mysql import on target',
			maskedImport,
			importResult,
			Date.now() - importStart,
		);

		const cleanTgtResult = await targetExecutor.execute(`rm -f ${dumpRemote}`);
		await tracker.trackCommand(
			'Target temp cleanup',
			`rm -f ${dumpRemote}`,
			cleanTgtResult,
			0,
		);

		if (importResult.code !== 0) {
			throw new Error(
				`mysql import failed (exit ${importResult.code}): ${importResult.stderr}`,
			);
		}

		await job.updateProgress({
			value: 80,
			step: 'Database imported on target',
		});

		// URL search-replace (auto-detected — no user input)
		await this.runUrlSearchReplace(
			sourceUrl,
			targetUrl,
			targetExecutor,
			targetCreds,
			targetEnv.root_path,
			tracker,
			job,
			'sync',
		);

		await job.updateProgress({ value: 100, step: 'Database sync complete' });
		await tracker.track({
			step: 'Sync complete',
			level: 'info',
			detail:
				sourceUrl && targetUrl && sourceUrl !== targetUrl
					? `URL changed: ${sourceUrl} → ${targetUrl}`
					: 'Database cloned successfully',
		});
	}

	// ── Push ────────────────────────────────────────────────────────────────────

	private async processPush(job: Job) {
		const {
			sourceEnvironmentId,
			targetEnvironmentId,
			scope,
			jobExecutionId,
			skipSafetyBackup,
		} = job.data;

		const tracker = new StepTracker(
			this.prisma,
			BigInt(jobExecutionId),
			this.logger,
			job.id ?? '',
		);

		await tracker.track({
			step: 'Sync push started',
			level: 'info',
			detail: `source env ${sourceEnvironmentId} → target env ${targetEnvironmentId}, scope=${scope}`,
		});

		// Load environments
		const [sourceEnv, targetEnv] = await Promise.all([
			this.prisma.environment.findUniqueOrThrow({
				where: { id: BigInt(sourceEnvironmentId) },
				include: { server: true, project: true },
			}),
			this.prisma.environment.findUniqueOrThrow({
				where: { id: BigInt(targetEnvironmentId) },
				include: { server: true, project: true },
			}),
		]);

		await tracker.track({
			step: 'Connecting to source server',
			level: 'info',
			detail: sourceEnv.server.ip_address,
		});
		const sourceExecutor = createRemoteExecutor({
			host: sourceEnv.server.ip_address,
			port: sourceEnv.server.ssh_port,
			username: sourceEnv.server.ssh_user,
			privateKey: await this.sshKey.resolvePrivateKey(sourceEnv.server),
		});

		await tracker.track({
			step: 'Connecting to target server',
			level: 'info',
			detail: targetEnv.server.ip_address,
		});
		const targetExecutor = createRemoteExecutor({
			host: targetEnv.server.ip_address,
			port: targetEnv.server.ssh_port,
			username: targetEnv.server.ssh_user,
			privateKey: await this.sshKey.resolvePrivateKey(targetEnv.server),
		});

		await job.updateProgress({ value: 5, step: 'Connected to servers' });

		// Safety backup of target before overwrite (database scopes only)
		if (scope !== 'files') {
			if (skipSafetyBackup) {
				await tracker.track({
					step: 'Safety backup SKIPPED — data loss risk accepted by user',
					level: 'warn',
					detail: 'skipSafetyBackup=true was passed.',
				});
			} else {
				await this.createSafetyBackup(
					job,
					targetEnv,
					targetExecutor,
					await this.resolveCredentials(
						targetExecutor,
						targetEnv.root_path,
						tracker,
						'target-preflight',
						targetEnv.id,
					),
					tracker,
				);
			}
		}

		await job.updateProgress({ value: 20, step: 'Safety backup complete' });

		if (await this.isCancelled(job.id)) throw new Error('Cancelled by user');

		if (scope === 'database' || scope === 'both') {
			await this.pushDatabase(
				job,
				sourceEnv,
				targetEnv,
				sourceExecutor,
				targetExecutor,
				tracker,
			);
		}

		await job.updateProgress({
			value: scope === 'database' ? 100 : 60,
			step: scope === 'database' ? 'Push complete' : 'Database pushed',
		});

		if (scope === 'files' || scope === 'both') {
			await this.pushFiles(
				job,
				sourceEnv,
				targetEnv,
				sourceExecutor,
				targetExecutor,
				tracker,
			);

			// Replace hardcoded URLs inside wp-content files (CSS, JS, etc.)
			// Resolve URLs here if we haven't already (files-only scope skips pushDatabase).
			const targetContent = `${targetEnv.root_path}/wp-content`;
			let filesSrcUrl: string | null = null;
			let filesTgtUrl: string | null = null;
			try {
				// For files-only we must resolve credentials just to query siteurl.
				// For 'both', pushDatabase already ran; re-resolving is cheap (cached in wpDbCredentials).
				const srcCreds = await this.resolveCredentials(
					sourceExecutor,
					sourceEnv.root_path,
					tracker,
					'source (file-replace)',
					sourceEnv.id,
				);
				const tgtCreds = await this.resolveCredentials(
					targetExecutor,
					targetEnv.root_path,
					tracker,
					'target (file-replace)',
					targetEnv.id,
				);
				filesSrcUrl = await this.resolveWpUrl(
					sourceExecutor,
					srcCreds,
					tracker,
					'source (file-replace)',
					sourceEnv.url,
				);
				filesTgtUrl = await this.resolveWpUrl(
					targetExecutor,
					tgtCreds,
					tracker,
					'target (file-replace)',
					targetEnv.url,
				);
			} catch (e) {
				await tracker.track({
					step: 'Could not resolve URLs for file search-replace — skipping',
					level: 'warn',
					detail: e instanceof Error ? e.message : String(e),
				});
			}

			if (filesSrcUrl && filesTgtUrl && filesSrcUrl !== filesTgtUrl) {
				await this.replaceUrlsInFiles(
					filesSrcUrl,
					filesTgtUrl,
					targetContent,
					targetExecutor,
					tracker,
					job,
				);
			}
		}

		await job.updateProgress({ value: 100, step: 'Push complete' });
		await tracker.track({
			step: 'Sync push complete',
			level: 'info',
			detail: `scope=${scope}`,
		});
	}

	/** Push database from sourceEnv → targetEnv (same algorithm as processClone). */
	private async pushDatabase(
		job: Job,
		sourceEnv: { id: bigint; root_path: string; url?: string | null },
		targetEnv: {
			id: bigint;
			root_path: string;
			url?: string | null;
			server: { ip_address: string };
		},
		sourceExecutor: Executor,
		targetExecutor: Executor,
		tracker: StepTracker,
	) {
		await tracker.track({
			step: 'Resolving source database credentials',
			level: 'info',
		});
		const sourceCreds = await this.resolveCredentials(
			sourceExecutor,
			sourceEnv.root_path,
			tracker,
			'source',
			sourceEnv.id,
		);

		await tracker.track({
			step: 'Resolving target database credentials',
			level: 'info',
		});
		const targetCreds = await this.resolveCredentials(
			targetExecutor,
			targetEnv.root_path,
			tracker,
			'target',
			targetEnv.id,
		);

		const sourceUrl = await this.resolveWpUrl(
			sourceExecutor,
			sourceCreds,
			tracker,
			'source',
			sourceEnv.url,
		);
		const targetUrl = await this.resolveWpUrl(
			targetExecutor,
			targetCreds,
			tracker,
			'target',
			targetEnv.url,
		);

		// Dump source
		const dumpRemote = `/tmp/forge_push_${job.id}.sql`;
		const srcMycnf = `/tmp/forge_push_src_${job.id}.cnf`;
		await sourceExecutor.pushFile({
			remotePath: srcMycnf,
			content: Buffer.from(
				`[client]\nuser=${sourceCreds.dbUser}\npassword=${sourceCreds.dbPassword}\nhost=${sourceCreds.dbHost}\n`,
			),
		});
		await sourceExecutor.execute(`chmod 600 ${srcMycnf}`);
		const maskedDump = `mysqldump --defaults-extra-file=*** --single-transaction --quick ${sourceCreds.dbName}`;

		await tracker.track({
			step: 'Dumping source database',
			level: 'info',
			command: maskedDump,
		});
		const dumpStart = Date.now();
		const dumpResult = await sourceExecutor.execute(
			`mysqldump --defaults-extra-file=${srcMycnf} --single-transaction --quick ${sourceCreds.dbName} > ${dumpRemote}`,
		);
		await sourceExecutor.execute(`rm -f ${srcMycnf}`);
		await tracker.trackCommand(
			'mysqldump source database',
			maskedDump,
			dumpResult,
			Date.now() - dumpStart,
		);
		if (dumpResult.code !== 0) {
			throw new Error(
				`mysqldump failed (exit ${dumpResult.code}): ${dumpResult.stderr}`,
			);
		}

		// Transfer via worker disk relay (avoids buffering entire dump in process memory)
		await tracker.track({
			step: 'Transferring database dump to target',
			level: 'info',
		});
		const localPushDir = await mkdtemp(join(tmpdir(), 'forge-push-'));
		const localPushPath = join(localPushDir, `push_${job.id}.sql`);
		try {
			await sourceExecutor.pullFileToPath(dumpRemote, localPushPath);
			await sourceExecutor.execute(`rm -f ${dumpRemote}`).catch(() => {});

			const readStream = createReadStream(localPushPath);
			await targetExecutor.pushFileFromStream(dumpRemote, readStream);
		} finally {
			await rm(localPushDir, { recursive: true, force: true });
		}

		// Import on target
		const tgtMycnf = `/tmp/forge_push_imp_${job.id}.cnf`;
		await targetExecutor.pushFile({
			remotePath: tgtMycnf,
			content: Buffer.from(
				`[client]\nuser=${targetCreds.dbUser}\npassword=${targetCreds.dbPassword}\nhost=${targetCreds.dbHost}\n`,
			),
		});
		await targetExecutor.execute(`chmod 600 ${tgtMycnf}`);
		const maskedImport = `mysql --defaults-extra-file=*** ${targetCreds.dbName}`;

		await tracker.track({
			step: 'Importing database on target',
			level: 'info',
			command: maskedImport,
		});
		const importStart = Date.now();
		const importResult = await targetExecutor.execute(
			`mysql --defaults-extra-file=${tgtMycnf} ${targetCreds.dbName} < ${dumpRemote}`,
		);
		await targetExecutor
			.execute(`rm -f ${tgtMycnf} ${dumpRemote}`)
			.catch(() => {});
		await tracker.trackCommand(
			'mysql import on target',
			maskedImport,
			importResult,
			Date.now() - importStart,
		);
		if (importResult.code !== 0) {
			throw new Error(
				`mysql import failed (exit ${importResult.code}): ${importResult.stderr}`,
			);
		}

		// URL search-replace
		await this.runUrlSearchReplace(
			sourceUrl,
			targetUrl,
			targetExecutor,
			targetCreds,
			targetEnv.root_path,
			tracker,
			job,
			'push',
		);
	}

	/**
	 * Sync wp-content/ files from source → target via rsync over SSH.
	 *
	 * Strategy: rsync is called on the source server with SSH tunnel to the
	 * target. The worker uploads its private key to source temporarily, then
	 * invokes rsync with the remote target. Falls back to a tar pipe relay
	 * through the worker if rsync is unavailable.
	 */
	private async pushFiles(
		job: Job,
		sourceEnv: { root_path: string },
		targetEnv: {
			root_path: string;
			server: {
				ip_address: string;
				ssh_port: number;
				ssh_user: string;
				name: string;
				ssh_private_key_encrypted: string | null;
			};
		},
		sourceExecutor: Executor,
		targetExecutor: Executor,
		tracker: StepTracker,
	) {
		const sourceContent = `${sourceEnv.root_path}/wp-content`;
		const targetContent = `${targetEnv.root_path}/wp-content`;

		await tracker.track({
			step: 'Checking source wp-content directory',
			level: 'info',
			detail: sourceContent,
		});

		// Verify wp-content exists on source
		const checkResult = await sourceExecutor.execute(
			`test -d ${shellQuote(sourceContent)} && echo ok || echo missing`,
		);
		if (checkResult.code !== 0 || checkResult.stdout.trim() === 'missing') {
			await tracker.track({
				step: 'wp-content not found on source — skipping file sync',
				level: 'warn',
				detail: `${sourceContent} does not exist`,
			});
			return;
		}

		// Check if rsync is available on source
		const rsyncCheck = await sourceExecutor.execute(
			'which rsync 2>/dev/null && echo ok || echo missing',
		);
		const hasRsync = rsyncCheck.stdout.trim() === 'ok';

		if (hasRsync) {
			await this.pushFilesViaRsync(
				job,
				sourceContent,
				targetContent,
				targetEnv,
				sourceExecutor,
				tracker,
			);
		} else {
			await tracker.track({
				step: 'rsync not available on source — using tar pipe relay',
				level: 'warn',
				detail: 'Falling back to tar + pull + push through worker',
			});
			await this.pushFilesViaTarRelay(
				job,
				sourceContent,
				targetContent,
				sourceExecutor,
				targetExecutor,
				tracker,
			);
		}
	}

	/** rsync source → target using SSH, executed on the source server. */
	private async pushFilesViaRsync(
		job: Job,
		sourceContent: string,
		targetContent: string,
		targetEnv: {
			server: {
				ip_address: string;
				ssh_port: number;
				ssh_user: string;
				name: string;
				ssh_private_key_encrypted: string | null;
			};
		},
		sourceExecutor: Executor,
		tracker: StepTracker,
	) {
		// Upload worker's private key to source as a temp file
		const keyPath = `/tmp/forge_push_key_${job.id}`;
		const rawKey = await this.sshKey.resolvePrivateKey(targetEnv.server);
		await sourceExecutor.pushFile({
			remotePath: keyPath,
			content: Buffer.from(rawKey),
		});
		await sourceExecutor.execute(`chmod 600 ${keyPath}`);

		const rsyncCmd = [
			'rsync',
			'-az',
			'--delete',
			'--timeout=300',
			`-e "ssh -i ${keyPath} -p ${targetEnv.server.ssh_port} -o StrictHostKeyChecking=no -o ConnectTimeout=30"`,
			`${shellQuote(sourceContent)}/`,
			`${shellQuote(targetEnv.server.ssh_user)}@${targetEnv.server.ip_address}:${shellQuote(targetContent)}/`,
		].join(' ');

		await tracker.track({
			step: 'Syncing wp-content via rsync',
			level: 'info',
			detail: `${sourceContent} → ${targetEnv.server.ip_address}:${targetContent}`,
			command: 'rsync -az --delete (key redacted)',
		});

		const rsyncStart = Date.now();
		const rsyncResult = await sourceExecutor.execute(rsyncCmd);

		// Cleanup key regardless of outcome
		await sourceExecutor.execute(`rm -f ${keyPath}`).catch(() => {});

		await tracker.trackCommand(
			'rsync wp-content',
			'rsync -az --delete (key redacted)',
			rsyncResult,
			Date.now() - rsyncStart,
		);

		if (rsyncResult.code !== 0) {
			throw new Error(
				`rsync failed (exit ${rsyncResult.code}): ${rsyncResult.stderr || rsyncResult.stdout}`,
			);
		}

		await tracker.track({
			step: 'File sync complete (rsync)',
			level: 'info',
			detail: rsyncResult.stdout.trim() || 'Done',
		});
	}

	/**
	 * Fallback file sync: tar on source → pull through worker → untar on target.
	 * Memory-bounded via streaming: large sites may require significant RAM.
	 */
	private async pushFilesViaTarRelay(
		job: Job,
		sourceContent: string,
		targetContent: string,
		sourceExecutor: Executor,
		targetExecutor: Executor,
		tracker: StepTracker,
	) {
		const remoteTar = `/tmp/forge_push_content_${job.id}.tar.gz`;

		// Archive on source
		const tarCmd = `tar -czf ${remoteTar} -C ${shellQuote(sourceContent)} .`;
		await tracker.track({
			step: 'Archiving wp-content on source',
			level: 'info',
			command: tarCmd,
		});
		const tarStart = Date.now();
		const tarResult = await sourceExecutor.execute(tarCmd);
		await tracker.trackCommand(
			'tar wp-content',
			tarCmd,
			tarResult,
			Date.now() - tarStart,
		);

		if (tarResult.code !== 0) {
			throw new Error(
				`tar failed (exit ${tarResult.code}): ${tarResult.stderr}`,
			);
		}

		// Pull to worker, then push to target
		await tracker.track({
			step: 'Relaying wp-content archive through worker',
			level: 'info',
		});
		const archiveBuffer = await sourceExecutor.pullFile(remoteTar);
		await sourceExecutor.execute(`rm -f ${remoteTar}`).catch(() => {});

		await tracker.track({
			step: `Archive pulled (${(archiveBuffer.length / 1024 / 1024).toFixed(1)} MB) — pushing to target`,
			level: 'info',
		});

		await targetExecutor.pushFile({
			remotePath: remoteTar,
			content: archiveBuffer,
		});

		// Ensure target wp-content exists, then extract
		await targetExecutor.execute(`mkdir -p ${shellQuote(targetContent)}`);
		const extractCmd = `tar -xzf ${remoteTar} -C ${shellQuote(targetContent)}`;
		await tracker.track({
			step: 'Extracting wp-content on target',
			level: 'info',
			command: extractCmd,
		});
		const extractStart = Date.now();
		const extractResult = await targetExecutor.execute(extractCmd);
		await targetExecutor.execute(`rm -f ${remoteTar}`).catch(() => {});
		await tracker.trackCommand(
			'tar extract on target',
			extractCmd,
			extractResult,
			Date.now() - extractStart,
		);

		if (extractResult.code !== 0) {
			throw new Error(
				`tar extract failed (exit ${extractResult.code}): ${extractResult.stderr}`,
			);
		}

		await tracker.track({
			step: 'File sync complete (tar relay)',
			level: 'info',
			detail: `${(archiveBuffer.length / 1024 / 1024).toFixed(1)} MB transferred`,
		});
	}

	// ── Helpers ─────────────────────────────────────────────────────────────────

	/**
	 * Run URL search-replace on the target database.
	 *
	 * Covers both the primary URL and the opposite-protocol variant (http↔https)
	 * so domain moves that introduced protocol changes are fully handled.
	 *
	 * Strategy 1 (preferred): WP-CLI — handles PHP serialized data correctly.
	 * Strategy 2 (fallback): Raw SQL UPDATE covering all standard WP tables.
	 *
	 * @param suffix  Short label used for temp file names ('sync' | 'push')
	 */
	private async runUrlSearchReplace(
		sourceUrl: string | null,
		targetUrl: string | null,
		executor: Executor,
		creds: Creds,
		rootPath: string,
		tracker: StepTracker,
		job: Job,
		suffix: string,
	): Promise<void> {
		if (!sourceUrl || !targetUrl || sourceUrl === targetUrl) {
			await tracker.track({
				step: 'URL search-replace skipped',
				level: 'info',
				detail:
					!sourceUrl || !targetUrl
						? 'Could not detect one or both URLs'
						: `Source and target URLs are identical (${sourceUrl})`,
			});
			return;
		}

		// Build replacement pairs: primary + protocol-variant (http↔https)
		const pairs: Array<[string, string]> = [[sourceUrl, targetUrl]];
		const srcAlt = flipProtocol(sourceUrl);
		const tgtAlt = flipProtocol(targetUrl);
		if (srcAlt && tgtAlt && srcAlt !== targetUrl) {
			pairs.push([srcAlt, tgtAlt]);
		}

		await tracker.track({
			step: 'Running URL search-replace on target',
			level: 'info',
			detail: pairs.map(([o, n]) => `${o} → ${n}`).join(', '),
		});

		const srStart = Date.now();

		// Strategy 1: WP-CLI — handles serialized PHP data and all tables.
		let wpCliSuccess = false;
		for (const [oldUrl, newUrl] of pairs) {
			const wpCliResult = await executor.execute(
				`wp search-replace ${shellQuote(oldUrl)} ${shellQuote(newUrl)} --path=${shellQuote(rootPath)} --skip-columns=guid --allow-root 2>&1`,
			);
			if (wpCliResult.code === 0) {
				await tracker.track({
					step: `URL search-replace complete (WP-CLI): ${oldUrl} → ${newUrl}`,
					level: 'info',
					detail: wpCliResult.stdout.trim() || 'Done',
				});
				wpCliSuccess = true;
			} else {
				// WP-CLI not available — will fall back to SQL for all pairs.
				await tracker.track({
					step: 'WP-CLI unavailable — falling back to SQL',
					level: 'warn',
					detail: `exit ${wpCliResult.code}: ${wpCliResult.stdout.trim() || 'command not found'}`,
				});
				break;
			}
		}

		if (wpCliSuccess) return;

		// Strategy 2: SQL fallback — broader table coverage + protocol variants.
		const srMycnf = `/tmp/forge_sr_${suffix}_${job.id}.cnf`;
		await executor.pushFile({
			remotePath: srMycnf,
			content: Buffer.from(
				`[client]\nuser=${creds.dbUser}\npassword=${creds.dbPassword}\nhost=${creds.dbHost}\n`,
			),
		});
		await executor.execute(`chmod 600 ${srMycnf}`);

		// Auto-detect table prefix from information_schema; fallback 'wp_'
		const prefixResult = await executor.execute(
			`mysql --defaults-extra-file=${srMycnf} ${creds.dbName} -sN -e ${shellQuote(
				`SELECT REPLACE(table_name,'options','') FROM information_schema.tables WHERE table_schema='${escapeMysql(creds.dbName)}' AND table_name LIKE '%options' LIMIT 1`,
			)}`,
		);
		const p =
			prefixResult.code === 0 && prefixResult.stdout.trim()
				? prefixResult.stdout.trim()
				: 'wp_';

		await tracker.track({
			step: 'Table prefix detected',
			level: 'info',
			detail: `prefix=${p}`,
		});

		// Build all UPDATE statements for every URL pair and every table/column.
		const statements: string[] = [];
		for (const [oldRaw, newRaw] of pairs) {
			const o = escapeMysql(oldRaw);
			const n = escapeMysql(newRaw);
			statements.push(
				`UPDATE \`${p}options\` SET option_value = REPLACE(option_value, '${o}', '${n}')`,
				`UPDATE \`${p}posts\` SET post_content = REPLACE(post_content, '${o}', '${n}')`,
				`UPDATE \`${p}posts\` SET post_excerpt = REPLACE(post_excerpt, '${o}', '${n}')`,
				`UPDATE \`${p}postmeta\` SET meta_value = REPLACE(CAST(meta_value AS CHAR), '${o}', '${n}')`,
				`UPDATE \`${p}usermeta\` SET meta_value = REPLACE(meta_value, '${o}', '${n}')`,
				`UPDATE \`${p}comments\` SET comment_content = REPLACE(comment_content, '${o}', '${n}')`,
				`UPDATE \`${p}comments\` SET comment_author_url = REPLACE(comment_author_url, '${o}', '${n}')`,
				`UPDATE \`${p}commentmeta\` SET meta_value = REPLACE(meta_value, '${o}', '${n}')`,
				`UPDATE \`${p}termmeta\` SET meta_value = REPLACE(meta_value, '${o}', '${n}')`,
				`UPDATE \`${p}links\` SET link_url = REPLACE(link_url, '${o}', '${n}')`,
				`UPDATE \`${p}links\` SET link_image = REPLACE(link_image, '${o}', '${n}')`,
				`UPDATE \`${p}links\` SET link_rss = REPLACE(link_rss, '${o}', '${n}')`,
			);
		}
		const srSql = statements.join(';\n') + ';';

		const sqlFile = `/tmp/forge_sr_${suffix}_sql_${job.id}.sql`;
		await executor.pushFile({
			remotePath: sqlFile,
			content: Buffer.from(srSql),
		});

		const maskedSr = `mysql --defaults-extra-file=*** ${creds.dbName} < ${sqlFile} (prefix=${p}, ${pairs.length} pair(s))`;
		const sqlResult = await executor.execute(
			`mysql --defaults-extra-file=${srMycnf} ${creds.dbName} < ${sqlFile}`,
		);
		await executor.execute(`rm -f ${srMycnf} ${sqlFile}`).catch(() => {});

		await tracker.trackCommand(
			'SQL URL search-replace',
			maskedSr,
			sqlResult,
			Date.now() - srStart,
		);

		if (sqlResult.code !== 0) {
			await tracker.track({
				step: 'URL search-replace failed — sync still complete',
				level: 'warn',
				detail: sqlResult.stderr,
			});
		} else {
			await tracker.track({
				step: 'URL search-replace complete (SQL)',
				level: 'info',
				detail: `prefix=${p}, 12 columns × ${pairs.length} pair(s) — note: serialized PHP data not fixed`,
			});
		}
	}

	/**
	 * Search-replace hardcoded URLs in wp-content text files (CSS, JS, etc.).
	 *
	 * Runs `find … | xargs sed` on the target for each replacement pair.
	 * Covers both the primary URL and opposite-protocol variant (http↔https).
	 * Binary files are never touched — only text-based file extensions.
	 */
	private async replaceUrlsInFiles(
		sourceUrl: string,
		targetUrl: string,
		wpContentPath: string,
		executor: Executor,
		tracker: StepTracker,
		job: Job,
	): Promise<void> {
		// Build pairs: primary + protocol-variant
		const pairs: Array<[string, string]> = [[sourceUrl, targetUrl]];
		const srcAlt = flipProtocol(sourceUrl);
		const tgtAlt = flipProtocol(targetUrl);
		if (srcAlt && tgtAlt && srcAlt !== targetUrl) {
			pairs.push([srcAlt, tgtAlt]);
		}

		await tracker.track({
			step: 'Replacing URLs in wp-content files',
			level: 'info',
			detail: `${wpContentPath} — ${pairs.map(([o, n]) => `${o} → ${n}`).join(', ')}`,
		});

		// Verify the directory exists before attempting find
		const checkResult = await executor.execute(
			`test -d ${shellQuote(wpContentPath)} && echo ok || echo missing`,
		);
		if (checkResult.stdout.trim() !== 'ok') {
			await tracker.track({
				step: 'wp-content not found on target — skipping file URL replace',
				level: 'warn',
				detail: wpContentPath,
			});
			return;
		}

		const fileStart = Date.now();
		let anyError = false;

		for (const [oldUrl, newUrl] of pairs) {
			// Escape characters that could break sed's s|…|…|g delimiter
			// We use | as delimiter so forward slashes don't need escaping.
			// The only chars that need escaping are: | and \
			const sedEscape = (s: string) =>
				s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
			const oldSed = sedEscape(oldUrl);
			const newSed = sedEscape(newUrl);

			// find all text-format files and in-place replace with sed
			const sedCmd = [
				`find ${shellQuote(wpContentPath)} -type f`,
				`\\( -name '*.css' -o -name '*.js' -o -name '*.json' -o -name '*.html'`,
				`-o -name '*.htm' -o -name '*.svg' -o -name '*.xml' -o -name '*.txt' \\)`,
				`-exec sed -i 's|${oldSed}|${newSed}|g' {} +`,
			].join(' ');

			const sedResult = await executor.execute(sedCmd);
			if (sedResult.code !== 0) {
				await tracker.track({
					step: `File URL replace failed for ${oldUrl}`,
					level: 'warn',
					detail: sedResult.stderr.trim() || `exit ${sedResult.code}`,
				});
				anyError = true;
			}
		}

		await tracker.track({
			step: anyError
				? 'File URL replace completed with warnings'
				: 'File URL replace complete',
			level: anyError ? 'warn' : 'info',
			detail: `${wpContentPath}, ${pairs.length} pair(s), extensions: css/js/json/html/svg/xml/txt`,
			durationMs: Date.now() - fileStart,
		});
	}

	/**
	 * Resolve DB credentials from a remote environment.
	 *
	 * Attempts in order:
	 *  1. wp-config.php inside root_path          (standard WP)
	 *  2. wp-config.php one level above root_path (hardened WP — placed above
	 *     public_html so it is not web-accessible)
	 *  3. .env one level above root_path          (Bedrock layout)
	 */
	private async resolveCredentials(
		executor: Executor,
		rootPath: string,
		tracker: StepTracker,
		label: string,
		environmentId: bigint,
	): Promise<Creds> {
		// Attempt 0: stored credentials in Bedrock Forge DB (manually configured, highest priority)
		try {
			const stored = await this.prisma.wpDbCredentials.findUnique({
				where: { environment_id: environmentId },
			});
			if (stored) {
				const creds: Creds = {
					dbHost: this.encryption.decrypt(stored.db_host_encrypted),
					dbUser: this.encryption.decrypt(stored.db_user_encrypted),
					dbPassword: this.encryption.decrypt(stored.db_password_encrypted),
					dbName: this.encryption.decrypt(stored.db_name_encrypted),
				};
				await tracker.track({
					step: `${label} credentials from Bedrock Forge (stored)`,
					level: 'info',
					detail: `host=${creds.dbHost} user=${creds.dbUser} db=${creds.dbName}`,
				});
				return creds;
			}
		} catch (e) {
			await tracker.track({
				step: `${label} stored credentials could not be loaded — falling back to file`,
				level: 'warn',
				detail: e instanceof Error ? e.message : String(e),
			});
		}

		const parentDir = rootPath.replace(/\/[^/]+\/?$/, '');

		// Attempt 1: wp-config.php inside root_path (standard WordPress)
		const wpConfigInRoot = `${rootPath}/wp-config.php`;
		try {
			const buf = await executor.pullFile(wpConfigInRoot);
			const creds = this.credParser.parse(buf.toString('utf8'));
			if (creds) {
				await tracker.track({
					step: `${label} credentials from wp-config.php`,
					level: 'info',
					detail: wpConfigInRoot,
				});
				return creds as Creds;
			}
			await tracker.track({
				step: `${label} wp-config.php found but credentials could not be parsed`,
				level: 'warn',
				detail: wpConfigInRoot,
			});
		} catch (e) {
			await tracker.track({
				step: `${label} wp-config.php not readable at root path`,
				level: 'warn',
				detail: `${wpConfigInRoot}: ${e instanceof Error ? e.message : String(e)}`,
			});
		}

		// Attempt 2: wp-config.php one level above root_path
		// Many hardened WordPress installs move wp-config.php above public_html
		const wpConfigAbove = `${parentDir}/wp-config.php`;
		try {
			const buf = await executor.pullFile(wpConfigAbove);
			const creds = this.credParser.parse(buf.toString('utf8'));
			if (creds) {
				await tracker.track({
					step: `${label} credentials from wp-config.php (above root)`,
					level: 'info',
					detail: wpConfigAbove,
				});
				return creds as Creds;
			}
			await tracker.track({
				step: `${label} wp-config.php above root found but credentials could not be parsed`,
				level: 'warn',
				detail: wpConfigAbove,
			});
		} catch (e) {
			await tracker.track({
				step: `${label} wp-config.php not readable above root path`,
				level: 'warn',
				detail: `${wpConfigAbove}: ${e instanceof Error ? e.message : String(e)}`,
			});
		}

		// Attempt 3: .env inside root_path (some setups place it inside public_html)
		const envInRoot = `${rootPath}/.env`;
		try {
			const buf = await executor.pullFile(envInRoot);
			const creds = this.credParser.parse(buf.toString('utf8'));
			if (creds) {
				await tracker.track({
					step: `${label} credentials from .env (inside root)`,
					level: 'info',
					detail: envInRoot,
				});
				return creds as Creds;
			}
			await tracker.track({
				step: `${label} .env inside root found but credentials could not be parsed`,
				level: 'warn',
				detail: envInRoot,
			});
		} catch (e) {
			await tracker.track({
				step: `${label} .env not readable inside root path`,
				level: 'warn',
				detail: `${envInRoot}: ${e instanceof Error ? e.message : String(e)}`,
			});
		}

		// Attempt 4: .env one directory above root_path (Bedrock layout)
		const parentEnv = `${parentDir}/.env`;
		try {
			const buf = await executor.pullFile(parentEnv);
			const creds = this.credParser.parse(buf.toString('utf8'));
			if (creds) {
				await tracker.track({
					step: `${label} credentials from .env (Bedrock — above root)`,
					level: 'info',
					detail: parentEnv,
				});
				return creds as Creds;
			}
			await tracker.track({
				step: `${label} .env above root found but credentials could not be parsed`,
				level: 'warn',
				detail: parentEnv,
			});
		} catch (e) {
			await tracker.track({
				step: `${label} .env not readable above root path`,
				level: 'warn',
				detail: `${parentEnv}: ${e instanceof Error ? e.message : String(e)}`,
			});
		}

		throw new Error(
			`Could not resolve database credentials for ${label} environment at ${rootPath}. ` +
				`Tried: ${wpConfigInRoot}, ${wpConfigAbove}, ${envInRoot}, ${parentEnv}. ` +
				`Check the execution log above for per-file error details.`,
		);
	}

	/**
	 * Detect the WordPress siteurl.
	 * Priority: env.url field stored in DB > wp_options query.
	 */
	private async resolveWpUrl(
		executor: Executor,
		creds: Creds,
		tracker: StepTracker,
		label: string,
		envUrl?: string | null,
	): Promise<string | null> {
		if (envUrl && envUrl.trim()) {
			const url = envUrl.trim().replace(/\/$/, '');
			await tracker.track({
				step: `${label} URL from environment record`,
				level: 'info',
				detail: url,
			});
			return url;
		}

		const query = `SELECT option_value FROM wp_options WHERE option_name = 'siteurl' LIMIT 1`;
		try {
			const urlMycnf = `/tmp/forge_url_${Date.now()}.cnf`;
			await executor.pushFile({
				remotePath: urlMycnf,
				content: Buffer.from(
					`[client]\nuser=${creds.dbUser}\npassword=${creds.dbPassword}\nhost=${creds.dbHost}\n`,
				),
			});
			await executor.execute(`chmod 600 ${urlMycnf}`);
			const result = await executor.execute(
				`mysql --defaults-extra-file=${urlMycnf} ${creds.dbName} -sN -e ${shellQuote(query)}`,
			);
			await executor.execute(`rm -f ${urlMycnf}`).catch(() => {});
			if (result.code === 0 && result.stdout.trim()) {
				const url = result.stdout.trim().replace(/\/$/, '');
				await tracker.track({
					step: `${label} URL from wp_options`,
					level: 'info',
					detail: url,
				});
				return url;
			}
		} catch {
			// non-fatal
		}

		await tracker.track({
			step: `Could not detect ${label} URL`,
			level: 'warn',
			detail: 'Search-replace skipped for this side',
		});
		return null;
	}

	/**
	 * Create a DB-only safety backup of the target and upload to GDrive.
	 * Blocks sync if GDrive upload fails — data safety is mandatory.
	 */
	private async createSafetyBackup(
		job: Job,
		targetEnv: {
			id: bigint;
			google_drive_folder_id: string | null;
			root_path: string;
			server: { ip_address: string };
		},
		targetExecutor: Executor,
		targetCreds: Creds,
		tracker: StepTracker,
	): Promise<void> {
		const gdriveFolder = targetEnv.google_drive_folder_id;
		if (!gdriveFolder) {
			throw new Error(
				'Target environment has no Google Drive folder configured. Cannot create safety backup before sync.',
			);
		}

		await tracker.track({
			step: 'Creating safety backup of target before overwrite',
			level: 'info',
			detail: `GDrive folder: ${gdriveFolder}`,
		});

		const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		const filename = `sync-safety-${ts}.sql`;
		const remoteTemp = `/tmp/sync_safety_${job.id}.sql`;
		const localDir = join(STAGING_DIR, String(job.id));
		const localFile = join(localDir, filename);

		// Dump target DB to temp file on target server
		// Use --defaults-extra-file — MariaDB 10.6+ ignores MYSQL_PWD env var.
		const sbMycnf = `/tmp/forge_sync_sb_${job.id}.cnf`;
		await targetExecutor.pushFile({
			remotePath: sbMycnf,
			content: Buffer.from(
				`[client]\nuser=${targetCreds.dbUser}\npassword=${targetCreds.dbPassword}\nhost=${targetCreds.dbHost}\n`,
			),
		});
		await targetExecutor.execute(`chmod 600 ${sbMycnf}`);
		const maskedDump = `mysqldump --defaults-extra-file=*** --single-transaction --quick ${targetCreds.dbName}`;

		const dumpStart = Date.now();
		const dumpResult = await targetExecutor.execute(
			`mysqldump --defaults-extra-file=${sbMycnf} --single-transaction --quick ${targetCreds.dbName} > ${remoteTemp}`,
		);
		await targetExecutor.execute(`rm -f ${sbMycnf}`);
		await tracker.trackCommand(
			'Safety backup: mysqldump target',
			maskedDump,
			dumpResult,
			Date.now() - dumpStart,
		);

		if (dumpResult.code !== 0) {
			throw new Error(
				`Safety backup mysqldump failed (exit ${dumpResult.code}): ${dumpResult.stderr}`,
			);
		}

		// Pull dump and upload to GDrive
		await mkdir(localDir, { recursive: true });
		const dumpBuffer = await targetExecutor.pullFile(remoteTemp);
		await targetExecutor.execute(`rm -f ${remoteTemp}`);

		const { writeFile } = await import('fs/promises');
		await writeFile(localFile, dumpBuffer);

		await tracker.track({
			step: 'Safety backup pulled — uploading to Google Drive',
			level: 'info',
			detail: `${filename} (${dumpBuffer.length} bytes)`,
		});

		try {
			const configOk = await this.rclone.writeConfig();
			if (!configOk) {
				throw new Error(
					'Google Drive rclone not configured. Configure rclone in Settings first.',
				);
			}

			const uploadStart = Date.now();
			const filePath = await this.rclone.upload(
				localFile,
				gdriveFolder,
				filename,
			);
			await tracker.track({
				step: 'Safety backup uploaded to Google Drive',
				level: 'info',
				detail: filePath,
				durationMs: Date.now() - uploadStart,
			});

			// Record in the database so it appears in the Backups tab
			await this.prisma.backup.create({
				data: {
					environment_id: targetEnv.id,
					type: 'db_only',
					status: 'completed',
					file_path: filePath,
					size_bytes: BigInt(dumpBuffer.length),
					completed_at: new Date(),
					started_at: new Date(),
				},
			});

			await tracker.track({ step: 'Safety backup recorded', level: 'info' });
		} finally {
			await rm(localDir, { recursive: true, force: true });
		}
	}
}
