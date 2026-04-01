import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
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

const STAGING_DIR = '/tmp/forge-sync';

/**
 * Wrap a string in single quotes for safe shell embedding.
 * Single quotes inside the value are escaped as: ' -> '\''
 */
function shellQuote(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}

/** Escape a string value for safe interpolation into a MySQL string literal. */
function escapeMysql(str: string): string {
	return str
		.replace(/\\/g, '\\\\')
		.replace(/'/g, "\\'")
		.replace(/\0/g, '\\0')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\r');
}

type Creds = {
	dbHost: string;
	dbUser: string;
	dbPassword: string;
	dbName: string;
};
type Executor = Awaited<ReturnType<typeof createRemoteExecutor>>;

@Processor(QUEUES.SYNC, { lockDuration: 90 * 60 * 1_000 })
export class SyncProcessor extends WorkerHost {
	private readonly logger = new Logger(SyncProcessor.name);
	private readonly credParser = new CredentialParserService();

	constructor(
		private readonly prisma: PrismaService,
		private readonly sshKey: SshKeyService,
		private readonly rclone: RcloneService,
		private readonly encryption: EncryptionService,
	) {
		super();
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

		// Transfer dump to target
		await tracker.track({
			step: 'Transferring database dump to target',
			level: 'info',
		});
		const dumpBuffer = await sourceExecutor.pullFile(dumpRemote);
		const cleanSrcResult = await sourceExecutor.execute(`rm -f ${dumpRemote}`);
		await tracker.trackCommand(
			'Source temp cleanup',
			`rm -f ${dumpRemote}`,
			cleanSrcResult,
			0,
		);

		await targetExecutor.pushFile({
			remotePath: dumpRemote,
			content: dumpBuffer,
		});
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
		if (sourceUrl && targetUrl && sourceUrl !== targetUrl) {
			await tracker.track({
				step: 'Running URL search-replace on target',
				level: 'info',
				detail: `${sourceUrl} → ${targetUrl}`,
			});

			const srStart = Date.now();

			// Strategy 1: WP-CLI — handles serialized data and all tables automatically.
			const wpCliResult = await targetExecutor.execute(
				`wp search-replace ${shellQuote(sourceUrl)} ${shellQuote(targetUrl)} --path=${shellQuote(targetEnv.root_path)} --skip-columns=guid --allow-root 2>&1`,
			);

			if (wpCliResult.code === 0) {
				await tracker.track({
					step: 'URL search-replace complete (WP-CLI)',
					level: 'info',
					detail: wpCliResult.stdout.trim() || 'Done',
				});
			} else {
				// Strategy 2: SQL with auto-detected prefix + multi-table coverage
				await tracker.track({
					step: 'WP-CLI unavailable — using SQL search-replace',
					level: 'warn',
					detail: `wp exit ${wpCliResult.code}: ${wpCliResult.stdout.trim() || 'command not found'}`,
				});

				const srMycnf = `/tmp/forge_sync_sr_${job.id}.cnf`;
				await targetExecutor.pushFile({
					remotePath: srMycnf,
					content: Buffer.from(
						`[client]\nuser=${targetCreds.dbUser}\npassword=${targetCreds.dbPassword}\nhost=${targetCreds.dbHost}\n`,
					),
				});
				await targetExecutor.execute(`chmod 600 ${srMycnf}`);

				// Detect table prefix from information_schema, fallback 'wp_'
				const prefixResult = await targetExecutor.execute(
					`mysql --defaults-extra-file=${srMycnf} ${targetCreds.dbName} -sN -e ${shellQuote(
						`SELECT REPLACE(table_name,'options','') FROM information_schema.tables WHERE table_schema='${escapeMysql(targetCreds.dbName)}' AND table_name LIKE '%options' LIMIT 1`,
					)}`,
				);
				const tablePrefix =
					prefixResult.code === 0 && prefixResult.stdout.trim()
						? prefixResult.stdout.trim()
						: 'wp_';

				await tracker.track({
					step: 'Table prefix detected',
					level: 'info',
					detail: `prefix=${tablePrefix}`,
				});

				const oldUrl = escapeMysql(sourceUrl);
				const newUrl = escapeMysql(targetUrl);

				const srSql =
					[
						`UPDATE \`${tablePrefix}options\` SET option_value = REPLACE(option_value, '${oldUrl}', '${newUrl}')`,
						`UPDATE \`${tablePrefix}posts\` SET post_content = REPLACE(post_content, '${oldUrl}', '${newUrl}')`,
						`UPDATE \`${tablePrefix}posts\` SET post_excerpt = REPLACE(post_excerpt, '${oldUrl}', '${newUrl}')`,
						`UPDATE \`${tablePrefix}postmeta\` SET meta_value = REPLACE(CAST(meta_value AS CHAR), '${oldUrl}', '${newUrl}')`,
						`UPDATE \`${tablePrefix}usermeta\` SET meta_value = REPLACE(meta_value, '${oldUrl}', '${newUrl}')`,
					].join(';\n') + ';';

				const sqlFile = `/tmp/forge_sync_sr_${job.id}.sql`;
				await targetExecutor.pushFile({
					remotePath: sqlFile,
					content: Buffer.from(srSql),
				});

				const maskedSr = `mysql --defaults-extra-file=*** ${targetCreds.dbName} < ${sqlFile} (prefix=${tablePrefix})`;
				const sqlResult = await targetExecutor.execute(
					`mysql --defaults-extra-file=${srMycnf} ${targetCreds.dbName} < ${sqlFile}`,
				);
				await targetExecutor
					.execute(`rm -f ${srMycnf} ${sqlFile}`)
					.catch(() => {});

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
						detail: `prefix=${tablePrefix}, tables: options/posts/postmeta/usermeta`,
					});
				}
			}
		} else {
			await tracker.track({
				step: 'URL search-replace skipped',
				level: 'info',
				detail:
					!sourceUrl || !targetUrl
						? 'Could not detect one or both URLs'
						: `Source and target URLs are identical (${sourceUrl})`,
			});
		}

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

	// ── Push (placeholder) ──────────────────────────────────────────────────────

	private async processPush(job: Job) {
		const { environmentId, scope, jobExecutionId } = job.data;
		const tracker = new StepTracker(
			this.prisma,
			BigInt(jobExecutionId),
			this.logger,
			job.id ?? '',
		);
		await tracker.track({
			step: 'Sync push not yet implemented',
			level: 'warn',
			detail: `env=${environmentId} scope=${scope}`,
		});
		await job.updateProgress({ value: 100, step: 'Skipped' });
	}

	// ── Helpers ─────────────────────────────────────────────────────────────────

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
