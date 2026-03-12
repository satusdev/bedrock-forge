import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import {
	access,
	cp,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { DriveRuntimeConfigService } from '../drive-runtime/drive-runtime-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebsocketCompatService } from '../websocket/websocket-compat.service';
import { BackupCreateDto } from './dto/backup-create.dto';

type DbBackupRow = {
	id: number;
	project_id: number;
	project_name: string | null;
	name: string;
	backup_type: string;
	storage_type: string;
	status: string;
	storage_path: string;
	size_bytes: bigint | null;
	error_message: string | null;
	notes: string | null;
	logs: string | null;
	storage_file_id: string | null;
	drive_folder_id: string | null;
	project_server_id: number | null;
	created_at: Date;
	completed_at: Date | null;
};

type ProjectBackupContext = {
	projectId: number;
	projectName: string;
	projectSlug: string;
	projectPath: string | null;
	projectDriveBackupsFolder: string | null;
	environmentId: number | null;
	environmentName: string | null;
	environmentPath: string | null;
	environmentDriveBackupsFolder: string | null;
	databaseName: string | null;
	databaseUser: string | null;
	databasePassword: string | null;
	serverHostname: string | null;
	sshUser: string | null;
	sshPort: number | null;
	sshKeyPath: string | null;
	sshPrivateKey: string | null;
	sshPassword: string | null;
};

type PendingBackupClaim = {
	id: number;
	created_by_id: number;
};

type PrunedTerminalBackup = {
	id: number;
	storage_type: string;
	storage_path: string;
};

type BackupMaintenanceSnapshot = {
	enabled: boolean;
	retention_enabled: boolean;
	file_cleanup_enabled: boolean;
	file_cleanup_dry_run: boolean;
	runs_total: number;
	last_run_at: string | null;
	last_outcome: {
		stale_marked: number;
		pruned: number;
		cleanup_deleted: number;
		cleanup_failed: number;
		error: string | null;
	} | null;
};

@Injectable()
export class BackupsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly driveRuntimeConfigService: DriveRuntimeConfigService,
		private readonly websocketCompatService: WebsocketCompatService,
	) {}

	private readonly fallbackOwnerId = 1;
	private readonly localBackupRoot =
		process.env.FORGE_BACKUP_ROOT?.trim() || '/tmp/forge-backups';
	private readonly restoreRoot =
		process.env.FORGE_RESTORE_ROOT?.trim() || '/tmp/forge-restores';
	private readonly driveMirrorRoot =
		process.env.FORGE_GDRIVE_MIRROR_ROOT?.trim() || '/tmp/forge-gdrive';
	private maintenanceSnapshot: BackupMaintenanceSnapshot = {
		enabled:
			(process.env.BACKUP_MAINTENANCE_ENABLED ?? 'true').toLowerCase() !==
			'false',
		retention_enabled:
			(process.env.BACKUP_RETENTION_ENABLED ?? 'false').toLowerCase() !==
			'false',
		file_cleanup_enabled:
			(process.env.BACKUP_FILE_CLEANUP_ENABLED ?? 'false').toLowerCase() !==
			'false',
		file_cleanup_dry_run:
			(process.env.BACKUP_FILE_CLEANUP_DRY_RUN ?? 'true').toLowerCase() !==
			'false',
		runs_total: 0,
		last_run_at: null,
		last_outcome: null,
	};

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	getMaintenanceSnapshot() {
		return this.maintenanceSnapshot;
	}

	recordMaintenanceSnapshot(outcome: {
		stale_marked: number;
		pruned: number;
		cleanup_deleted: number;
		cleanup_failed: number;
		error?: string | null;
	}) {
		this.maintenanceSnapshot = {
			...this.maintenanceSnapshot,
			runs_total: this.maintenanceSnapshot.runs_total + 1,
			last_run_at: new Date().toISOString(),
			last_outcome: {
				stale_marked: outcome.stale_marked,
				pruned: outcome.pruned,
				cleanup_deleted: outcome.cleanup_deleted,
				cleanup_failed: outcome.cleanup_failed,
				error: outcome.error ?? null,
			},
		};
	}

	async claimPendingBackups(limit = 5) {
		const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
		return this.prisma.$transaction(async tx => {
			const claimed = await tx.backups.findMany({
				where: { status: 'pending' },
				orderBy: [{ started_at: 'asc' }, { id: 'asc' }],
				take: safeLimit,
				select: { id: true, created_by_id: true },
			});

			if (claimed.length === 0) {
				return [];
			}

			const owned: PendingBackupClaim[] = [];
			for (const row of claimed) {
				const now = new Date();
				const updated = await tx.backups.updateMany({
					where: {
						id: row.id,
						status: 'pending',
					},
					data: {
						status: 'running',
						updated_at: now,
					},
				});

				if (updated.count === 1) {
					owned.push({ id: row.id, created_by_id: row.created_by_id });
				}
			}

			return owned;
		});
	}

	async markStaleRunningBackupsFailed(staleMinutes = 120, limit = 10) {
		const safeMinutes = Math.max(
			5,
			Math.min(24 * 60, Math.trunc(staleMinutes)),
		);
		const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
		const threshold = new Date(Date.now() - safeMinutes * 60_000);
		const stale = await this.prisma.backups.findMany({
			where: {
				status: 'running',
				updated_at: { lt: threshold },
			},
			orderBy: [{ updated_at: 'asc' }, { id: 'asc' }],
			take: safeLimit,
			select: { id: true, error_message: true, completed_at: true },
		});

		if (stale.length === 0) {
			return [];
		}

		const now = new Date();
		const marked: Array<{ id: number }> = [];
		for (const row of stale) {
			const updated = await this.prisma.backups.updateMany({
				where: {
					id: row.id,
					status: 'running',
					updated_at: { lt: threshold },
				},
				data: {
					status: 'failed',
					error_message:
						row.error_message ??
						'Marked as failed by backup maintenance runner after stale runtime threshold',
					completed_at: row.completed_at ?? now,
					updated_at: now,
				},
			});

			if (updated.count === 1) {
				marked.push({ id: row.id });
			}
		}

		return marked;
	}

	async pruneTerminalBackups(
		retentionDays = 30,
		keepPerProject = 20,
		limit = 100,
	) {
		const safeRetentionDays = Math.max(
			7,
			Math.min(3650, Math.trunc(retentionDays)),
		);
		const safeKeepPerProject = Math.max(
			1,
			Math.min(1000, Math.trunc(keepPerProject)),
		);
		const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));

		const cutoff = new Date(
			Date.now() - safeRetentionDays * 24 * 60 * 60 * 1000,
		);
		const rows = await this.prisma.backups.findMany({
			where: {
				status: { in: ['completed', 'failed'] },
				OR: [
					{ completed_at: { lt: cutoff } },
					{ completed_at: null, created_at: { lt: cutoff } },
				],
			},
			orderBy: [
				{ project_id: 'asc' },
				{ completed_at: 'desc' },
				{ created_at: 'desc' },
				{ id: 'desc' },
			],
			select: {
				id: true,
				project_id: true,
				storage_type: true,
				storage_path: true,
			},
		});

		const rankByProject = new Map<number, number>();
		const pruned: PrunedTerminalBackup[] = [];
		for (const row of rows) {
			const rank = (rankByProject.get(row.project_id) ?? 0) + 1;
			rankByProject.set(row.project_id, rank);
			if (rank <= safeKeepPerProject) {
				continue;
			}
			if (pruned.length >= safeLimit) {
				break;
			}
			pruned.push({
				id: row.id,
				storage_type: row.storage_type,
				storage_path: row.storage_path,
			});
		}

		if (pruned.length === 0) {
			return [];
		}

		await this.prisma.backups.deleteMany({
			where: { id: { in: pruned.map(row => row.id) } },
		});

		return pruned;
	}

	async cleanupPrunedLocalArtifacts(
		pruned: PrunedTerminalBackup[],
		dryRun = true,
	) {
		const localRoot = resolve(this.localBackupRoot);
		let considered = 0;
		let eligible = 0;
		let deleted = 0;
		let skippedUnsafe = 0;
		let missing = 0;
		let failed = 0;

		for (const backup of pruned) {
			considered += 1;
			if (backup.storage_type !== 'local') {
				continue;
			}

			const rawPath = backup.storage_path?.trim();
			if (!rawPath) {
				continue;
			}

			const resolvedPath = resolve(rawPath);
			const isInsideRoot =
				resolvedPath === localRoot || resolvedPath.startsWith(`${localRoot}/`);
			if (!isInsideRoot) {
				skippedUnsafe += 1;
				continue;
			}

			eligible += 1;
			if (dryRun) {
				deleted += 1;
				continue;
			}

			try {
				const fileStats = await stat(resolvedPath);
				if (!fileStats.isFile()) {
					skippedUnsafe += 1;
					continue;
				}
				await rm(resolvedPath, { force: true });
				deleted += 1;
			} catch (error) {
				const isMissing =
					error instanceof Error &&
					'code' in error &&
					(error as NodeJS.ErrnoException).code === 'ENOENT';
				if (isMissing) {
					missing += 1;
					continue;
				}
				failed += 1;
			}
		}

		return {
			considered,
			eligible,
			deleted,
			skipped_unsafe: skippedUnsafe,
			missing,
			failed,
			dry_run: dryRun,
		};
	}

	private normalizeBackup(row: DbBackupRow) {
		return {
			id: row.id,
			project_id: row.project_id,
			project_name: row.project_name,
			name: row.name,
			backup_type: row.backup_type,
			storage_type: row.storage_type,
			status: row.status,
			file_path: row.storage_path,
			size_bytes: row.size_bytes ? Number(row.size_bytes) : null,
			error_message: row.error_message,
			notes: row.notes,
			logs: row.logs,
			storage_file_id: row.storage_file_id,
			drive_folder_id: row.drive_folder_id,
			project_server_id: row.project_server_id,
			gdrive_link:
				row.storage_type === 'google_drive' &&
				(row.drive_folder_id ?? row.storage_file_id)
					? `https://drive.google.com/drive/folders/${row.drive_folder_id ?? row.storage_file_id}`
					: null,
			created_at: row.created_at,
			completed_at: row.completed_at,
		};
	}

	private sanitizeSegment(value: string) {
		return value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 120);
	}

	private splitDrivePath(value: string | null | undefined) {
		return (value ?? '')
			.split('/')
			.map(segment => this.sanitizeSegment(segment))
			.filter(Boolean);
	}

	private isDriveFolderId(value: string) {
		return /^[A-Za-z0-9_-]{10,}$/.test(value) && !value.includes('/');
	}

	private async assertConfiguredDriveRemote() {
		const status = await this.driveRuntimeConfigService.checkRemoteConfigured();
		if (status.configured) {
			return status.runtime;
		}

		throw new Error(
			`Google Drive backup remote '${status.runtime.remoteName}' is unavailable: ${status.message}. Configure it via /api/v1/rclone/authorize or update FORGE_BACKUP_GDRIVE_REMOTE / app_settings.gdrive_rclone_remote and RCLONE_CONFIG.`,
		);
	}

	private emitBackupRealtimeEvent(payload: Record<string, unknown>) {
		this.websocketCompatService.broadcast({
			type: 'backup_update',
			...payload,
			timestamp: new Date().toISOString(),
		});
	}

	private async pathExists(pathValue: string) {
		try {
			await access(pathValue);
			return true;
		} catch {
			return false;
		}
	}

	private async runProcess(command: string, args: string[]) {
		await new Promise<void>((resolvePromise, rejectPromise) => {
			const child = spawn(command, args, {
				stdio: ['ignore', 'pipe', 'pipe'],
				env: process.env,
			});
			let stderr = '';

			child.stderr.on('data', chunk => {
				stderr += chunk.toString();
			});

			child.on('error', error => {
				rejectPromise(error);
			});

			child.on('close', code => {
				if (code === 0) {
					resolvePromise();
					return;
				}
				rejectPromise(
					new Error(
						`${command} exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr.trim()}` : ''}`,
					),
				);
			});
		});
	}

	private async runProcessCapture(
		command: string,
		args: string[],
		environment?: NodeJS.ProcessEnv,
	) {
		return await new Promise<{ stdout: string; stderr: string }>(
			(resolvePromise, rejectPromise) => {
				const child = spawn(command, args, {
					stdio: ['ignore', 'pipe', 'pipe'],
					env: environment ?? process.env,
				});
				let stdout = '';
				let stderr = '';

				child.stdout.on('data', chunk => {
					stdout += chunk.toString();
				});

				child.stderr.on('data', chunk => {
					stderr += chunk.toString();
				});

				child.on('error', error => {
					rejectPromise(error);
				});

				child.on('close', code => {
					if (code === 0) {
						resolvePromise({ stdout, stderr });
						return;
					}
					rejectPromise(
						new Error(
							`${command} exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr.trim()}` : ''}`,
						),
					);
				});
			},
		);
	}

	private shellQuote(value: string) {
		return `'${value.replace(/'/g, `'"'"'`)}'`;
	}

	private expandHomePath(filePath: string | null | undefined) {
		if (!filePath) {
			return null;
		}
		const trimmed = filePath.trim();
		if (!trimmed) {
			return null;
		}
		if (trimmed === '~') {
			return homedir();
		}
		if (trimmed.startsWith('~/')) {
			return resolve(homedir(), trimmed.slice(2));
		}
		return resolve(trimmed);
	}

	private async getSystemPrivateKey() {
		const rows = await this.prisma.$queryRaw<
			{ encrypted_value: string | null; value: string | null }[]
		>`
			SELECT encrypted_value, value
			FROM app_settings
			WHERE key = ${'system.ssh.private_key'}
			LIMIT 1
		`;
		const row = rows[0];
		if (!row) {
			return null;
		}
		return row.encrypted_value ?? row.value;
	}

	private buildSshArgs(context: ProjectBackupContext, privateKeyPath?: string) {
		const sshPort = context.sshPort ?? 22;
		const sshUser = context.sshUser?.trim() || 'root';
		const sshHost = context.serverHostname?.trim();
		const connectTimeoutSeconds = this.getDumpConnectTimeoutSeconds();
		if (!sshHost) {
			throw new Error('SSH host is not configured for environment server');
		}

		const args = [
			'-p',
			String(sshPort),
			'-o',
			'BatchMode=yes',
			'-o',
			`ConnectTimeout=${connectTimeoutSeconds}`,
			'-o',
			'LogLevel=ERROR',
			'-o',
			'StrictHostKeyChecking=no',
			'-o',
			'UserKnownHostsFile=/dev/null',
		];
		if (privateKeyPath) {
			args.push('-i', privateKeyPath);
		}

		return {
			args,
			sshTarget: `${sshUser}@${sshHost}`,
		};
	}

	private async withSshKey<T>(
		context: ProjectBackupContext,
		handler: (keyFilePath: string) => Promise<T>,
	) {
		let keyFilePath: string | undefined;
		let tempDirectory: string | undefined;

		const candidatePath = this.expandHomePath(context.sshKeyPath);
		if (candidatePath && (await this.pathExists(candidatePath))) {
			keyFilePath = candidatePath;
		}

		if (!keyFilePath) {
			const inlinePrivateKeyRaw =
				context.sshPrivateKey && context.sshPrivateKey.trim().length > 0
					? context.sshPrivateKey
					: await this.getSystemPrivateKey();
			const inlinePrivateKey = inlinePrivateKeyRaw
				? inlinePrivateKeyRaw.replace(/\r\n/g, '\n').replace(/\\n/g, '\n')
				: null;

			if (inlinePrivateKey && inlinePrivateKey.trim().length > 0) {
				tempDirectory = await mkdtemp(join(tmpdir(), 'forge-ssh-'));
				keyFilePath = join(tempDirectory, 'id_rsa');
				await writeFile(keyFilePath, `${inlinePrivateKey.trim()}\n`, {
					encoding: 'utf-8',
					mode: 0o600,
				});
			}
		}

		if (!keyFilePath) {
			if (context.sshPassword && context.sshPassword.trim().length > 0) {
				throw new Error(
					'SSH password auth is configured, but non-interactive DB backup requires SSH key auth in Nest API',
				);
			}
			throw new Error('No SSH key configured for remote database dump');
		}

		try {
			return await handler(keyFilePath);
		} finally {
			if (tempDirectory) {
				await rm(tempDirectory, { recursive: true, force: true });
			}
		}
	}

	private async runSshCommand(
		context: ProjectBackupContext,
		command: string,
		privateKeyPath?: string,
	) {
		const { args, sshTarget } = this.buildSshArgs(context, privateKeyPath);
		args.push(sshTarget, command);

		await this.runProcess('ssh', args);
	}

	private async runSshCommandCapture(
		context: ProjectBackupContext,
		command: string,
		privateKeyPath?: string,
	) {
		const { args, sshTarget } = this.buildSshArgs(context, privateKeyPath);
		args.push(sshTarget, command);
		return this.runProcessCapture('ssh', args);
	}

	private async scpFromRemote(
		context: ProjectBackupContext,
		remotePath: string,
		localPath: string,
		privateKeyPath?: string,
	) {
		const sshPort = context.sshPort ?? 22;
		const sshUser = context.sshUser?.trim() || 'root';
		const sshHost = context.serverHostname?.trim();
		const connectTimeoutSeconds = this.getDumpConnectTimeoutSeconds();
		if (!sshHost) {
			throw new Error('SSH host is not configured for environment server');
		}

		const args = [
			'-P',
			String(sshPort),
			'-o',
			'BatchMode=yes',
			'-o',
			`ConnectTimeout=${connectTimeoutSeconds}`,
			'-o',
			'LogLevel=ERROR',
			'-o',
			'StrictHostKeyChecking=no',
			'-o',
			'UserKnownHostsFile=/dev/null',
		];
		if (privateKeyPath) {
			args.push('-i', privateKeyPath);
		}
		args.push(`${sshUser}@${sshHost}:${remotePath}`, localPath);

		await this.runProcess('scp', args);
	}

	private async tryDatabaseDumpLocal(
		dumpBin: string,
		dumpHost: string,
		dumpPort: string,
		connectTimeoutSeconds: string,
		databaseUser: string,
		databasePassword: string,
		databaseName: string,
		destinationPath: string,
		commandTrace?: (message: string) => Promise<void>,
	) {
		const args = [
			'--single-transaction',
			'--quick',
			'--skip-lock-tables',
			'--host',
			dumpHost,
			'--port',
			dumpPort,
			'--user',
			databaseUser,
			'--result-file',
			destinationPath,
			databaseName,
		];

		if (commandTrace) {
			await commandTrace(
				`local ${dumpBin} ${args
					.map(value => this.shellQuote(value))
					.join(' ')}`,
			);
		}

		await new Promise<void>((resolvePromise, rejectPromise) => {
			const timeoutSeconds = Math.max(
				1,
				Number.parseInt(connectTimeoutSeconds, 10) || 8,
			);
			const timeoutMs = timeoutSeconds * 1000;
			const child = spawn(dumpBin, args, {
				stdio: ['ignore', 'pipe', 'pipe'],
				env: {
					...process.env,
					MYSQL_PWD: databasePassword,
				},
			});
			let finished = false;
			let didTimeout = false;
			let stderr = '';
			const timeoutHandle = setTimeout(() => {
				if (finished) {
					return;
				}
				didTimeout = true;
				child.kill('SIGTERM');
				setTimeout(() => {
					if (!finished) {
						child.kill('SIGKILL');
					}
				}, 1000).unref();
			}, timeoutMs);

			child.stderr.on('data', chunk => {
				stderr += chunk.toString();
			});

			child.on('error', error => {
				if (finished) {
					return;
				}
				finished = true;
				clearTimeout(timeoutHandle);
				rejectPromise(error);
			});

			child.on('close', code => {
				if (finished) {
					return;
				}
				finished = true;
				clearTimeout(timeoutHandle);
				if (didTimeout) {
					rejectPromise(
						new Error(
							`${dumpBin} timed out after ${timeoutSeconds}s${stderr ? `: ${stderr.trim()}` : ''}`,
						),
					);
					return;
				}
				if (code === 0) {
					resolvePromise();
					return;
				}
				rejectPromise(
					new Error(
						`${dumpBin} exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr.trim()}` : ''}`,
					),
				);
			});
		});
	}

	private async createDatabaseDumpViaSsh(
		context: ProjectBackupContext,
		destinationPath: string,
		options: {
			dumpBin: string;
			dumpHost: string;
			dumpPort: string;
			databaseUser: string;
			databasePassword: string;
			databaseName: string;
		},
		commandTrace?: (message: string) => Promise<void>,
	) {
		await this.withSshKey(context, async keyFilePath => {
			const remoteDumpPath = `/tmp/forge-db-backup-${randomUUID()}.sql`;
			const dumpArgs = [
				this.shellQuote(options.dumpBin),
				'--single-transaction',
				'--quick',
				'--lock-tables=false',
				'--host',
				this.shellQuote(options.dumpHost),
				'--port',
				this.shellQuote(options.dumpPort),
				'--user',
				this.shellQuote(options.databaseUser),
				'--result-file',
				this.shellQuote(remoteDumpPath),
				this.shellQuote(options.databaseName),
			].join(' ');
			const plainDumpCommand = [
				`MYSQL_PWD=${this.shellQuote(options.databasePassword)}`,
				dumpArgs,
			].join(' ');
			const sudoDumpCommand = [
				'sudo -n env',
				`MYSQL_PWD=${this.shellQuote(options.databasePassword)}`,
				dumpArgs,
			].join(' ');
			const attempts = [
				{
					label: 'sudo',
					command: sudoDumpCommand,
				},
				{ label: 'plain', command: plainDumpCommand },
			];
			const failures: string[] = [];

			try {
				for (const attempt of attempts) {
					try {
						if (commandTrace) {
							await commandTrace(
								`ssh (${attempt.label}) ${attempt.command.replace(/MYSQL_PWD='[^']*'/g, "MYSQL_PWD='***'")}`,
							);
						}
						await this.runSshCommand(context, attempt.command, keyFilePath);
						await this.scpFromRemote(
							context,
							remoteDumpPath,
							destinationPath,
							keyFilePath,
						);
						return;
					} catch (error: unknown) {
						const reason =
							error instanceof Error ? error.message : 'unknown ssh dump error';
						failures.push(`${attempt.label} => ${reason}`);
					}
				}

				throw new Error(`remote dump command failed: ${failures.join(' | ')}`);
			} finally {
				await this.runSshCommand(
					context,
					`rm -f ${this.shellQuote(remoteDumpPath)}`,
					keyFilePath,
				).catch(() => undefined);
			}
		});
	}

	private async createDatabaseDumpViaWpCli(
		context: ProjectBackupContext,
		destinationPath: string,
		pathCandidates: Array<string | null | undefined>,
		commandTrace?: (message: string) => Promise<void>,
	) {
		const candidatePaths = this.expandWpCliPathCandidates(pathCandidates);

		if (candidatePaths.length === 0) {
			throw new Error('wp-cli export failed: no candidate paths provided');
		}

		const failures: string[] = [];

		await this.withSshKey(context, async keyFilePath => {
			for (const candidatePath of candidatePaths) {
				const remoteDumpPath = `/tmp/forge-db-wpcli-${randomUUID()}.sql`;
				const commands = [
					{
						label: 'sudo',
						command: [
							'if command -v wp >/dev/null 2>&1; then',
							`sudo -n wp --allow-root --path=${this.shellQuote(candidatePath)} db export ${this.shellQuote(remoteDumpPath)} --add-drop-table --quiet;`,
							"else echo 'wp-cli not found' 1>&2; exit 127; fi",
						].join(' '),
					},
					{
						label: 'plain',
						command: [
							'if command -v wp >/dev/null 2>&1; then',
							`wp --allow-root --path=${this.shellQuote(candidatePath)} db export ${this.shellQuote(remoteDumpPath)} --add-drop-table --quiet;`,
							"else echo 'wp-cli not found' 1>&2; exit 127; fi",
						].join(' '),
					},
				];
				let exported = false;

				try {
					for (const attempt of commands) {
						try {
							if (commandTrace) {
								await commandTrace(
									`ssh wp-cli (${attempt.label}) candidate=${candidatePath}`,
								);
							}
							await this.runSshCommand(context, attempt.command, keyFilePath);
							exported = true;
							break;
						} catch (error: unknown) {
							const reason =
								error instanceof Error
									? error.message
									: 'unknown wp-cli export error';
							failures.push(`${candidatePath} [${attempt.label}] => ${reason}`);
						}
					}

					if (!exported) {
						continue;
					}

					await this.scpFromRemote(
						context,
						remoteDumpPath,
						destinationPath,
						keyFilePath,
					);
					return;
				} catch (error: unknown) {
					const reason =
						error instanceof Error
							? error.message
							: 'unknown wp-cli export error';
					failures.push(`${candidatePath} => ${reason}`);
				} finally {
					await this.runSshCommand(
						context,
						`rm -f ${this.shellQuote(remoteDumpPath)}`,
						keyFilePath,
					).catch(() => undefined);
				}
			}
		});

		throw new Error(`wp-cli export failed: ${failures.join(' | ')}`);
	}

	private expandWpCliPathCandidates(
		pathCandidates: Array<string | null | undefined>,
	): string[] {
		const values = pathCandidates
			.map(value => value?.trim() || '')
			.filter(Boolean)
			.filter(value => this.isEligibleRemoteWpPath(value))
			.flatMap(value => {
				if (/\/web\/?$/i.test(value)) {
					const parentPath = dirname(value.replace(/\/+$/, ''));
					if (parentPath && parentPath !== value) {
						return [value, parentPath];
					}
				}
				return [value];
			})
			.filter((value, index, array) => array.indexOf(value) === index);

		return values;
	}

	private isEligibleRemoteWpPath(pathValue: string) {
		const normalized = pathValue.trim();
		if (!normalized.startsWith('/')) {
			return false;
		}
		if (normalized === '/app' || normalized.startsWith('/app/')) {
			return false;
		}
		const localRoots = [
			this.localBackupRoot,
			this.restoreRoot,
			this.driveMirrorRoot,
		]
			.map(root => (root || '').trim())
			.filter(Boolean);
		return !localRoots.some(
			root => normalized === root || normalized.startsWith(`${root}/`),
		);
	}

	private resolveBackupTypeSelection(backupType?: string) {
		const normalized = (backupType ?? 'full').trim().toLowerCase();
		if (normalized === 'files') {
			return {
				backupType: 'files',
				includeFiles: true,
				includeDatabase: false,
			} as const;
		}
		if (normalized === 'database') {
			return {
				backupType: 'database',
				includeFiles: false,
				includeDatabase: true,
			} as const;
		}
		return {
			backupType: 'full',
			includeFiles: true,
			includeDatabase: true,
		} as const;
	}

	private async createDatabaseDump(
		context: ProjectBackupContext,
		destinationPath: string,
		commandTrace?: (message: string) => Promise<void>,
	) {
		if (!context.environmentId) {
			throw new Error(
				'Database backup requires a selected environment with database credentials',
			);
		}

		const dbConfigFromRemote = await this.resolveRemoteDatabaseConfigFromSource(
			context,
			[context.environmentPath, context.projectPath],
			commandTrace,
		);

		const databaseName =
			dbConfigFromRemote.databaseName ?? context.databaseName?.trim();
		const databaseUser =
			dbConfigFromRemote.databaseUser ?? context.databaseUser?.trim();
		const databasePassword =
			dbConfigFromRemote.databasePassword ?? context.databasePassword?.trim();

		if (!databaseName || !databaseUser || !databasePassword) {
			throw new Error(
				`Database credentials are incomplete for environment ${context.environmentId}`,
			);
		}

		await mkdir(dirname(destinationPath), { recursive: true });

		const dumpBins = (
			process.env.FORGE_BACKUP_DB_DUMP_BIN || 'mariadb-dump,mysqldump'
		)
			.split(',')
			.map(value => value.trim())
			.filter(Boolean);

		if (dumpBins.length === 0) {
			throw new Error('No database dump binary configured');
		}

		const resolvedHost =
			process.env.FORGE_BACKUP_DB_HOST?.trim() ||
			dbConfigFromRemote.databaseHost ||
			'localhost';
		const resolvedPort =
			process.env.FORGE_BACKUP_DB_PORT?.trim() ||
			dbConfigFromRemote.databasePort ||
			'3306';

		const failures: string[] = [];
		for (const dumpBin of dumpBins) {
			try {
				await this.createDatabaseDumpViaSsh(
					context,
					destinationPath,
					{
						dumpBin,
						dumpHost: resolvedHost,
						dumpPort: resolvedPort,
						databaseUser,
						databasePassword,
						databaseName,
					},
					commandTrace,
				);

				return {
					databaseHost: resolvedHost,
					databasePort: resolvedPort,
					dumpBinary: dumpBin,
					transport: 'ssh',
				};
			} catch (error: unknown) {
				const reason =
					error instanceof Error ? error.message : 'unknown ssh dump error';
				failures.push(
					`ssh:${dumpBin}@${resolvedHost}:${resolvedPort} => ${reason}`,
				);
			}
		}

		if (this.isLegacyDumpFallbackEnabled()) {
			const legacyResult = await this.createDatabaseDumpLegacyFallback(
				context,
				destinationPath,
				{
					databaseName,
					databaseUser,
					databasePassword,
					resolvedHost,
					resolvedPort,
					dumpBins,
				},
				commandTrace,
			);
			if (legacyResult) {
				return legacyResult;
			}
		}

		throw new Error(
			`Database dump failed for environment ${context.environmentId}. Attempts: ${failures.join(' | ')}`,
		);
	}

	private isLegacyDumpFallbackEnabled() {
		return (
			(process.env.FORGE_BACKUP_DB_LEGACY_FALLBACK ?? 'false').toLowerCase() ===
			'true'
		);
	}

	private async createDatabaseDumpLegacyFallback(
		context: ProjectBackupContext,
		destinationPath: string,
		options: {
			databaseName: string;
			databaseUser: string;
			databasePassword: string;
			resolvedHost: string;
			resolvedPort: string;
			dumpBins: string[];
		},
		commandTrace?: (message: string) => Promise<void>,
	) {
		const connectTimeoutSeconds = String(this.getDumpConnectTimeoutSeconds());

		for (const dumpBin of options.dumpBins) {
			try {
				await this.tryDatabaseDumpLocal(
					dumpBin,
					options.resolvedHost,
					options.resolvedPort,
					connectTimeoutSeconds,
					options.databaseUser,
					options.databasePassword,
					options.databaseName,
					destinationPath,
					commandTrace,
				);

				return {
					databaseHost: options.resolvedHost,
					databasePort: options.resolvedPort,
					dumpBinary: dumpBin,
					transport: 'local',
				};
			} catch {
				continue;
			}
		}

		try {
			await this.createDatabaseDumpViaWpCli(
				context,
				destinationPath,
				[context.environmentPath, context.projectPath],
				commandTrace,
			);

			return {
				databaseHost: options.resolvedHost,
				databasePort: options.resolvedPort,
				dumpBinary: 'wp',
				transport: 'ssh-wpcli',
			};
		} catch {
			return null;
		}
	}

	private async resolveRemoteDatabaseConfigFromSource(
		context: ProjectBackupContext,
		pathCandidates: Array<string | null | undefined>,
		commandTrace?: (message: string) => Promise<void>,
	) {
		const emptyConfig = {
			databaseHost: null,
			databasePort: null,
			databaseName: null,
			databaseUser: null,
			databasePassword: null,
		};

		if (!context.serverHostname?.trim()) {
			return emptyConfig;
		}

		const candidates = this.expandWpCliPathCandidates(pathCandidates);
		if (candidates.length === 0) {
			return emptyConfig;
		}

		try {
			return await this.withSshKey(context, async keyFilePath => {
				for (const candidatePath of candidates) {
					const source = await this.detectRemoteConfigSource(
						context,
						candidatePath,
						keyFilePath,
					);

					if (!source) {
						continue;
					}

					if (commandTrace) {
						await commandTrace(
							`ssh config source=${source} candidate=${candidatePath}`,
						);
					}

					const config = await this.readDatabaseConfigFromRemotePath(
						context,
						candidatePath,
						keyFilePath,
					);

					if (
						config.databaseName &&
						config.databaseUser &&
						config.databasePassword
					) {
						return config;
					}
				}

				return emptyConfig;
			});
		} catch {
			return emptyConfig;
		}
	}

	private async detectRemoteConfigSource(
		context: ProjectBackupContext,
		candidatePath: string,
		keyFilePath: string,
	) {
		const command = [
			`if [ -f ${this.shellQuote(`${candidatePath}/.env`)} ] || [ -f ${this.shellQuote(`${candidatePath}/.env.local`)} ] || [ -f ${this.shellQuote(`${dirname(candidatePath)}/.env`)} ]; then echo bedrock;`,
			`elif [ -f ${this.shellQuote(`${candidatePath}/wp-config.php`)} ] || [ -f ${this.shellQuote(`${candidatePath}/web/wp-config.php`)} ] || [ -f ${this.shellQuote(`${dirname(candidatePath)}/web/wp-config.php`)} ]; then echo wp-config; fi`,
		].join(' ');

		try {
			const output = await this.runSshCommandCapture(
				context,
				command,
				keyFilePath,
			);
			const source = output.stdout.trim();
			if (source === 'bedrock' || source === 'wp-config') {
				return source;
			}
			return null;
		} catch {
			return null;
		}
	}

	private parseHostPort(hostValue: string | null | undefined) {
		const value = hostValue?.trim();
		if (!value) {
			return { host: null, port: null };
		}

		const bracketMatch = value.match(/^\[(.+)\]:(\d+)$/);
		if (bracketMatch) {
			return {
				host: bracketMatch[1] || null,
				port: bracketMatch[2] || null,
			};
		}

		const hostPortMatch = value.match(/^([^:]+):(\d+)$/);
		if (hostPortMatch) {
			return {
				host: hostPortMatch[1] || null,
				port: hostPortMatch[2] || null,
			};
		}

		return {
			host: value,
			port: null,
		};
	}

	private async resolveDatabaseConfigFromPaths(
		paths: Array<string | null | undefined>,
	) {
		const normalizedPaths = paths
			.filter((value): value is string => Boolean(value && value.trim().length))
			.map(value => resolve(value))
			.filter((pathValue, index, array) => array.indexOf(pathValue) === index);

		for (const pathValue of normalizedPaths) {
			const config = await this.readDatabaseConfigFromPath(pathValue);
			if (
				config.databaseHost ||
				config.databasePort ||
				config.databaseName ||
				config.databaseUser ||
				config.databasePassword
			) {
				return config;
			}
		}

		return {
			databaseHost: null,
			databasePort: null,
			databaseName: null,
			databaseUser: null,
			databasePassword: null,
		};
	}

	private async resolveDatabaseConfigFromRemotePaths(
		context: ProjectBackupContext,
		paths: Array<string | null | undefined>,
	) {
		if (!context.serverHostname?.trim()) {
			return {
				databaseHost: null,
				databasePort: null,
				databaseName: null,
				databaseUser: null,
				databasePassword: null,
			};
		}

		try {
			return await this.withSshKey(context, async keyFilePath => {
				const normalizedPaths = paths
					.filter((value): value is string =>
						Boolean(value && value.trim().length),
					)
					.map(value => resolve(value))
					.filter(
						(pathValue, index, array) => array.indexOf(pathValue) === index,
					);

				for (const pathValue of normalizedPaths) {
					const config = await this.readDatabaseConfigFromRemotePath(
						context,
						pathValue,
						keyFilePath,
					);
					if (
						config.databaseHost ||
						config.databasePort ||
						config.databaseName ||
						config.databaseUser ||
						config.databasePassword
					) {
						return config;
					}
				}

				return {
					databaseHost: null,
					databasePort: null,
					databaseName: null,
					databaseUser: null,
					databasePassword: null,
				};
			});
		} catch {
			return {
				databaseHost: null,
				databasePort: null,
				databaseName: null,
				databaseUser: null,
				databasePassword: null,
			};
		}
	}

	private async readDatabaseConfigFromRemotePath(
		context: ProjectBackupContext,
		pathValue: string,
		keyFilePath: string,
	) {
		const envCandidates = [
			`${pathValue}/.env`,
			`${pathValue}/.env.local`,
			`${dirname(pathValue)}/.env`,
		];
		const wpConfigCandidates = [
			`${pathValue}/wp-config.php`,
			`${pathValue}/web/wp-config.php`,
			`${dirname(pathValue)}/web/wp-config.php`,
		];

		let envValues: Record<string, string> = {};
		for (const envPath of envCandidates) {
			const content = await this.readRemoteFileIfExists(
				context,
				envPath,
				keyFilePath,
			);
			if (!content) {
				continue;
			}
			envValues = {
				...envValues,
				...this.parseDotEnv(content),
			};
		}

		let wpConfigValues: Record<string, string> = {};
		for (const wpConfigPath of wpConfigCandidates) {
			const content = await this.readRemoteFileIfExists(
				context,
				wpConfigPath,
				keyFilePath,
			);
			if (!content) {
				continue;
			}
			wpConfigValues = {
				...wpConfigValues,
				...this.parseWpConfigDefines(content),
			};
		}

		const hostRaw =
			envValues.DB_HOST ||
			wpConfigValues.DB_HOST ||
			envValues.DATABASE_HOST ||
			wpConfigValues.DATABASE_HOST ||
			null;
		const hostParts = this.parseHostPort(hostRaw);

		return {
			databaseHost: hostParts.host,
			databasePort: hostParts.port,
			databaseName:
				envValues.DB_NAME ||
				wpConfigValues.DB_NAME ||
				envValues.DATABASE_NAME ||
				wpConfigValues.DATABASE_NAME ||
				null,
			databaseUser:
				envValues.DB_USER ||
				wpConfigValues.DB_USER ||
				envValues.DATABASE_USER ||
				wpConfigValues.DATABASE_USER ||
				null,
			databasePassword:
				envValues.DB_PASSWORD ||
				wpConfigValues.DB_PASSWORD ||
				envValues.DATABASE_PASSWORD ||
				wpConfigValues.DATABASE_PASSWORD ||
				null,
		};
	}

	private async readRemoteFileIfExists(
		context: ProjectBackupContext,
		remotePath: string,
		keyFilePath: string,
	) {
		const command = [
			`if [ -f ${this.shellQuote(remotePath)} ]; then`,
			`cat ${this.shellQuote(remotePath)};`,
			'fi',
		].join(' ');

		try {
			const captured = await this.runSshCommandCapture(
				context,
				command,
				keyFilePath,
			);
			return captured.stdout.trim().length > 0 ? captured.stdout : null;
		} catch {
			return null;
		}
	}

	private async readDatabaseConfigFromPath(pathValue: string) {
		const envCandidates = [
			join(pathValue, '.env'),
			join(pathValue, '.env.local'),
			join(dirname(pathValue), '.env'),
		];
		const wpConfigCandidates = [
			join(pathValue, 'wp-config.php'),
			join(pathValue, 'web', 'wp-config.php'),
			join(dirname(pathValue), 'web', 'wp-config.php'),
		];

		let envValues: Record<string, string> = {};
		for (const envPath of envCandidates) {
			if (!(await this.pathExists(envPath))) {
				continue;
			}
			const content = await readFile(envPath, 'utf-8');
			envValues = {
				...envValues,
				...this.parseDotEnv(content),
			};
		}

		let wpConfigValues: Record<string, string> = {};
		for (const wpConfigPath of wpConfigCandidates) {
			if (!(await this.pathExists(wpConfigPath))) {
				continue;
			}
			const content = await readFile(wpConfigPath, 'utf-8');
			wpConfigValues = {
				...wpConfigValues,
				...this.parseWpConfigDefines(content),
			};
		}

		const hostRaw =
			envValues.DB_HOST ||
			wpConfigValues.DB_HOST ||
			envValues.DATABASE_HOST ||
			wpConfigValues.DATABASE_HOST ||
			null;
		const hostParts = this.parseHostPort(hostRaw);

		return {
			databaseHost: hostParts.host,
			databasePort: hostParts.port,
			databaseName:
				envValues.DB_NAME ||
				wpConfigValues.DB_NAME ||
				envValues.DATABASE_NAME ||
				wpConfigValues.DATABASE_NAME ||
				null,
			databaseUser:
				envValues.DB_USER ||
				wpConfigValues.DB_USER ||
				envValues.DATABASE_USER ||
				wpConfigValues.DATABASE_USER ||
				null,
			databasePassword:
				envValues.DB_PASSWORD ||
				wpConfigValues.DB_PASSWORD ||
				envValues.DATABASE_PASSWORD ||
				wpConfigValues.DATABASE_PASSWORD ||
				null,
		};
	}

	private parseDotEnv(content: string) {
		const result: Record<string, string> = {};
		const lines = content.split(/\r?\n/);
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}
			const match = trimmed.match(
				/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
			);
			if (!match) {
				continue;
			}
			const key = match[1];
			const rawValue = match[2] ?? '';
			if (!key) {
				continue;
			}
			result[key] = this.normalizeConfigValue(rawValue);
		}
		return result;
	}

	private parseWpConfigDefines(content: string) {
		const result: Record<string, string> = {};
		const defineRegex =
			/define\(\s*['\"]([A-Za-z0-9_]+)['\"]\s*,\s*(['\"])((?:\\.|(?!\2).)*)\2\s*\)/g;

		let match: RegExpExecArray | null = defineRegex.exec(content);
		while (match) {
			const key = match[1];
			const rawValue = match[3] ?? '';
			if (key) {
				result[key] = rawValue
					.replace(/\\'/g, "'")
					.replace(/\\\"/g, '"')
					.replace(/\\n/g, '\n');
			}
			match = defineRegex.exec(content);
		}

		return result;
	}

	private normalizeConfigValue(rawValue: string) {
		const trimmed = rawValue.trim();
		if (!trimmed) {
			return '';
		}

		if (
			(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
			(trimmed.startsWith("'") && trimmed.endsWith("'"))
		) {
			return trimmed.slice(1, -1);
		}

		const commentStart = trimmed.indexOf(' #');
		if (commentStart >= 0) {
			return trimmed.slice(0, commentStart).trim();
		}

		return trimmed;
	}

	private getDumpConnectTimeoutSeconds() {
		const raw = process.env.FORGE_BACKUP_DB_CONNECT_TIMEOUT?.trim();
		const parsed = Number.parseInt(raw ?? '', 10);
		if (!Number.isFinite(parsed) || parsed <= 0) {
			return 8;
		}
		return parsed;
	}

	private async getProjectBackupContext(
		projectId: number,
		ownerId: number,
		environmentId?: number | null,
	) {
		const projectRows = await this.prisma.$queryRaw<
			Array<{
				id: number;
				name: string;
				slug: string;
				path: string | null;
				gdrive_backups_folder_id: string | null;
			}>
		>`
			SELECT id, name, slug, path, gdrive_backups_folder_id
			FROM projects
			WHERE id = ${projectId} AND owner_id = ${ownerId}
			LIMIT 1
		`;

		const project = projectRows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		let environment:
			| {
					id: number;
					environment: string;
					wp_path: string;
					gdrive_backups_folder_id: string | null;
					database_name: string | null;
					database_user: string | null;
					database_password: string | null;
					server_hostname: string | null;
					ssh_user: string | null;
					ssh_port: number | null;
					ssh_key_path: string | null;
					ssh_private_key: string | null;
					ssh_password: string | null;
			  }
			| undefined;
		if (typeof environmentId === 'number') {
			const envRows = await this.prisma.$queryRaw<
				Array<{
					id: number;
					environment: string;
					wp_path: string;
					gdrive_backups_folder_id: string | null;
					database_name: string | null;
					database_user: string | null;
					database_password: string | null;
					server_hostname: string | null;
					ssh_user: string | null;
					ssh_port: number | null;
					ssh_key_path: string | null;
					ssh_private_key: string | null;
					ssh_password: string | null;
				}>
			>`
				SELECT ps.id, ps.environment::text AS environment, ps.wp_path, ps.gdrive_backups_folder_id, ps.database_name, ps.database_user, ps.database_password, s.hostname AS server_hostname, s.ssh_user, s.ssh_port, s.ssh_key_path, s.ssh_private_key, s.ssh_password
				FROM project_servers ps
				JOIN servers s ON s.id = ps.server_id
				JOIN projects p ON p.id = ps.project_id
				WHERE ps.id = ${environmentId} AND ps.project_id = ${projectId} AND p.owner_id = ${ownerId}
				LIMIT 1
			`;
			environment = envRows[0];
			if (!environment) {
				throw new NotFoundException({ detail: 'Environment not found' });
			}
		}

		return {
			projectId: project.id,
			projectName: project.name,
			projectSlug: project.slug,
			projectPath: project.path,
			projectDriveBackupsFolder: project.gdrive_backups_folder_id,
			environmentId: environment?.id ?? null,
			environmentName: environment?.environment ?? null,
			environmentPath: environment?.wp_path ?? null,
			environmentDriveBackupsFolder:
				environment?.gdrive_backups_folder_id ?? null,
			databaseName: environment?.database_name ?? null,
			databaseUser: environment?.database_user ?? null,
			databasePassword: environment?.database_password ?? null,
			serverHostname: environment?.server_hostname ?? null,
			sshUser: environment?.ssh_user ?? null,
			sshPort: environment?.ssh_port ?? null,
			sshKeyPath: environment?.ssh_key_path ?? null,
			sshPrivateKey: environment?.ssh_private_key ?? null,
			sshPassword: environment?.ssh_password ?? null,
		} satisfies ProjectBackupContext;
	}

	private async resolveBackupSource(
		context: ProjectBackupContext,
		backupId: number,
		backupType: string,
	) {
		const candidates = [context.environmentPath, context.projectPath]
			.filter((value): value is string => typeof value === 'string')
			.map(value => resolve(value));

		for (const candidate of candidates) {
			if (await this.pathExists(candidate)) {
				return {
					sourcePath: candidate,
					cleanupPath: null as string | null,
					logMessage: `Using source path ${candidate}`,
				};
			}
		}

		const fallbackDir = join(
			tmpdir(),
			'forge-backup-fallback',
			`${backupId}-${randomUUID()}`,
		);
		await mkdir(fallbackDir, { recursive: true });
		const metadataPath = join(fallbackDir, 'backup-metadata.json');
		await writeFile(
			metadataPath,
			JSON.stringify(
				{
					backup_id: backupId,
					backup_type: backupType,
					project_id: context.projectId,
					project_name: context.projectName,
					project_slug: context.projectSlug,
					environment: context.environmentName,
					source_paths_checked: candidates,
					created_at: new Date().toISOString(),
				},
				null,
				2,
			),
			'utf-8',
		);

		return {
			sourcePath: fallbackDir,
			cleanupPath: fallbackDir,
			logMessage:
				'No source path found on disk, created metadata-only backup snapshot',
		};
	}

	private async createTarArchive(sourcePath: string, destinationPath: string) {
		await mkdir(dirname(destinationPath), { recursive: true });
		await this.runProcess('tar', [
			'-czf',
			destinationPath,
			'-C',
			dirname(sourcePath),
			basename(sourcePath),
		]);
		const archiveStat = await stat(destinationPath);
		return {
			sizeBytes: archiveStat.size,
		};
	}

	private formatLogLine(message: string) {
		return `[${new Date().toISOString()}] ${message}`;
	}

	private async appendBackupLog(
		backupId: number,
		logs: string[],
		message: string,
		eventMeta?: {
			project_id: number;
			project_name?: string;
			project_slug?: string;
			status?: string;
		},
	) {
		const line = this.formatLogLine(message);
		logs.push(line);
		await this.prisma.$executeRaw`
			UPDATE backups
			SET logs = ${logs.join('\n')}, updated_at = NOW()
			WHERE id = ${backupId}
		`;

		if (eventMeta) {
			this.emitBackupRealtimeEvent({
				event: 'log',
				backup_id: backupId,
				project_id: eventMeta.project_id,
				project_name: eventMeta.project_name,
				project_slug: eventMeta.project_slug,
				status: eventMeta.status ?? 'running',
				log_line: line,
				logs: logs.join('\n'),
			});
		}
	}

	private resolveDriveFolderPath(
		context: ProjectBackupContext,
		overrideFolder?: string | null,
	) {
		if (overrideFolder && overrideFolder.trim().length > 0) {
			return overrideFolder.trim().replace(/^\/+|\/+$/g, '');
		}

		if (context.environmentDriveBackupsFolder) {
			return context.environmentDriveBackupsFolder
				.trim()
				.replace(/^\/+|\/+$/g, '');
		}

		if (context.projectDriveBackupsFolder) {
			return context.projectDriveBackupsFolder.trim().replace(/^\/+|\/+$/g, '');
		}

		const envSegment = context.environmentName
			? context.environmentName
			: 'project';
		return `WebDev/Projects/${context.projectName}/Backups/${envSegment}`;
	}

	private async uploadArchiveToDriveFolder(
		archivePath: string,
		driveFolderPath: string,
		createdAt: Date,
		runtimeConfig: { remoteName: string; configPath: string },
	) {
		const year = `${createdAt.getUTCFullYear()}`;
		const month = `${createdAt.getUTCMonth() + 1}`.padStart(2, '0');
		const targetValue = driveFolderPath.trim();
		const targetIsFolderId = this.isDriveFolderId(targetValue);
		const relativeTargetPath = `${year}/${month}/${basename(archivePath)}`;

		const folderSegments = this.splitDrivePath(targetValue);
		const driveFolderPathWithDate = [...folderSegments, year, month].join('/');
		const remoteTarget = targetIsFolderId
			? `${runtimeConfig.remoteName},root_folder_id=${targetValue}:${relativeTargetPath}`
			: `${runtimeConfig.remoteName}:${driveFolderPathWithDate}/${basename(archivePath)}`;
		const rcloneArgs = [
			'--config',
			runtimeConfig.configPath,
			'copyto',
			archivePath,
			remoteTarget,
			'--stats',
			'0',
			'--transfers',
			'1',
			'--checkers',
			'2',
		];

		await this.runProcess('rclone', rcloneArgs);

		return {
			driveFolderId: targetIsFolderId ? targetValue : driveFolderPathWithDate,
			storageFileId: basename(archivePath),
			remoteTarget,
			destinationLabel: targetIsFolderId
				? `${targetValue}/${year}/${month}`
				: driveFolderPathWithDate,
		};
	}

	private async deleteDriveBackupArtifact(backup: {
		drive_folder_id?: string | null;
		storage_file_id?: string | null;
		name?: string;
	}) {
		const driveFolderId = backup.drive_folder_id?.trim();
		const storageFileId = backup.storage_file_id?.trim();

		if (!driveFolderId || !storageFileId) {
			return { deleted: false, reason: 'no-drive-artifact' as const };
		}

		const runtimeStatus =
			await this.driveRuntimeConfigService.checkRemoteConfigured();
		if (!runtimeStatus.configured) {
			throw new Error(
				`Cannot delete Drive artifact for backup ${backup.name ?? 'unknown'}: ${runtimeStatus.message}`,
			);
		}

		const runtimeConfig = runtimeStatus.runtime;
		const remoteTarget = this.isDriveFolderId(driveFolderId)
			? `${runtimeConfig.remoteName},root_folder_id=${driveFolderId}:${storageFileId}`
			: `${runtimeConfig.remoteName}:${this.normalizePathForDriveFile(driveFolderId)}/${storageFileId}`;

		await this.runProcess('rclone', [
			'--config',
			runtimeConfig.configPath,
			'deletefile',
			remoteTarget,
		]);

		return {
			deleted: true,
			reason: 'deleted' as const,
			remoteTarget,
		};
	}

	private normalizePathForDriveFile(value: string) {
		return value.trim().replace(/^\/+|\/+$/g, '');
	}

	private async resolveReadableArchivePath(
		backup: ReturnType<BackupsService['normalizeBackup']>,
	) {
		const candidates: string[] = [];
		if (
			typeof backup.file_path === 'string' &&
			backup.file_path.trim().length > 0
		) {
			candidates.push(resolve(backup.file_path));
		}

		if (backup.drive_folder_id && backup.storage_file_id) {
			const driveFolderSegments = this.splitDrivePath(backup.drive_folder_id);
			if (driveFolderSegments.length > 0) {
				candidates.push(
					join(
						this.driveMirrorRoot,
						...driveFolderSegments,
						backup.storage_file_id,
					),
				);
			}
		}

		for (const candidate of candidates) {
			if (await this.pathExists(candidate)) {
				return candidate;
			}
		}

		return null;
	}

	async listBackups(query: {
		project_id?: number;
		backup_type?: string;
		status?: string;
		skip?: number;
		limit?: number;
		page?: number;
		page_size?: number;
		owner_id?: number;
	}) {
		const resolvedOwnerId = this.resolveOwnerId(query.owner_id);
		const limit = Math.max(
			1,
			Math.min(100, query.limit ?? query.page_size ?? 50),
		);
		const skip = query.skip ?? ((query.page ?? 1) - 1) * limit;

		const rows = await this.prisma.$queryRaw<DbBackupRow[]>`
			SELECT
				b.id,
				b.project_id,
				p.name AS project_name,
				b.name,
				b.backup_type,
				b.storage_type,
				b.status,
				b.storage_path,
				b.size_bytes,
				b.error_message,
				b.notes,
				b.logs,
				b.storage_file_id,
				b.drive_folder_id,
				b.project_server_id,
				b.created_at,
				b.completed_at
			FROM backups b
			JOIN projects p ON p.id = b.project_id
			WHERE
				(${query.project_id ?? null}::int IS NULL OR b.project_id = ${query.project_id ?? null})
				AND (${query.backup_type ?? null}::text IS NULL OR b.backup_type::text = ${query.backup_type ?? null})
				AND (${query.status ?? null}::text IS NULL OR b.status::text = ${query.status ?? null})
				AND p.owner_id = ${resolvedOwnerId}
			ORDER BY b.created_at DESC
			OFFSET ${skip}
			LIMIT ${limit}
		`;

		return rows.map(row => this.normalizeBackup(row));
	}

	async createBackup(payload: BackupCreateDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const projectRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM projects
			WHERE id = ${payload.project_id} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const project = projectRows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		if (payload.environment_id) {
			const envRows = await this.prisma.$queryRaw<{ id: number }[]>`
				SELECT id
				FROM project_servers
				WHERE id = ${payload.environment_id} AND project_id = ${payload.project_id}
				LIMIT 1
			`;
			if (!envRows[0]) {
				throw new NotFoundException({ detail: 'Environment not found' });
			}
		}

		const taskId = randomUUID();
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const backupName =
			payload.name && payload.name.trim().length > 0
				? payload.name
				: `Backup ${project.name} - ${timestamp}`;
		const storagePath = `/backups/${payload.project_id}/${timestamp}-${taskId}.tar.gz`;

		const insertedRows = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO backups (
				name,
				backup_type,
				storage_type,
				storage_path,
				status,
				started_at,
				project_id,
				created_by_id,
				project_server_id,
				notes,
				updated_at
			)
			VALUES (
				${backupName},
				${payload.backup_type ?? 'full'}::backuptype,
				${payload.storage_type ?? 'local'}::backupstoragetype,
				${storagePath},
				${'pending'}::backupstatus,
				NOW(),
				${payload.project_id},
				${resolvedOwnerId},
				${payload.environment_id ?? null},
				${payload.notes ?? null},
				NOW()
			)
			RETURNING id
		`;
		const inserted = insertedRows[0];
		if (!inserted) {
			throw new BadRequestException({ detail: 'Failed to create backup' });
		}

		return {
			task_id: taskId,
			status: 'pending',
			message: `Creating ${(payload.backup_type ?? 'full').toLowerCase()} backup for ${project.name}`,
			backup_id: inserted.id,
		};
	}

	async getBackup(backupId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbBackupRow[]>`
			SELECT
				b.id,
				b.project_id,
				p.name AS project_name,
				b.name,
				b.backup_type,
				b.storage_type,
				b.status,
				b.storage_path,
				b.size_bytes,
				b.error_message,
				b.notes,
				b.logs,
				b.storage_file_id,
				b.drive_folder_id,
				b.project_server_id,
				b.created_at,
				b.completed_at
			FROM backups b
			JOIN projects p ON p.id = b.project_id
			WHERE b.id = ${backupId} AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const backup = rows[0];
		if (!backup) {
			throw new NotFoundException({ detail: 'Backup not found' });
		}
		return this.normalizeBackup(backup);
	}

	async deleteBackup(
		backupId: number,
		force = false,
		ownerId?: number,
		deleteFile = true,
	) {
		const backup = await this.getBackup(backupId, ownerId);
		if (!force && ['running', 'pending'].includes(backup.status)) {
			throw new BadRequestException({
				detail: 'Backup is currently running. Use force=true to delete anyway.',
			});
		}

		if (deleteFile) {
			if (backup.storage_type === 'google_drive') {
				await this.deleteDriveBackupArtifact(backup);
			}

			if (
				typeof backup.file_path === 'string' &&
				backup.file_path.trim().length > 0
			) {
				const filePath = resolve(backup.file_path);
				await rm(filePath, { force: true }).catch(error => {
					const errno = error as NodeJS.ErrnoException;
					if (errno?.code === 'ENOENT') {
						return;
					}
					throw error;
				});
			}
		}

		await this.prisma.$executeRaw`
			DELETE FROM backups
			WHERE id = ${backupId}
		`;
	}

	async getBackupDownloadMetadata(backupId: number, ownerId?: number) {
		const backup = await this.getBackup(backupId, ownerId);
		const archivePath = await this.resolveReadableArchivePath(backup);
		if (archivePath) {
			const binaryContent = await readFile(archivePath);
			return {
				filename: basename(archivePath),
				content: binaryContent,
			};
		}
		return {
			filename: `${backup.name.replace(/\s+/g, '-').toLowerCase()}.tar.gz`,
			content: `Simulated backup content for backup ${backup.id}`,
		};
	}

	async restoreBackup(
		backupId: number,
		options?: { database?: boolean; files?: boolean },
		ownerId?: number,
	) {
		const backup = await this.getBackup(backupId, ownerId);
		const taskId = randomUUID();
		const shouldRestoreFiles = options?.files ?? true;
		const shouldRestoreDatabase = options?.database ?? true;

		let restorePath: string | null = null;
		let restoreLogs = 'Restore started';

		if (shouldRestoreFiles) {
			const archivePath = await this.resolveReadableArchivePath(backup);
			if (!archivePath) {
				throw new BadRequestException({
					detail: 'Backup archive is not available for restore',
				});
			}

			const resolvedOwnerId = this.resolveOwnerId(ownerId);
			const context = await this.getProjectBackupContext(
				backup.project_id,
				resolvedOwnerId,
				backup.project_server_id,
			);

			const envSegment = this.sanitizeSegment(
				context.environmentName ?? 'project',
			);
			const projectSegment = this.sanitizeSegment(
				context.projectSlug || context.projectName,
			);
			restorePath = join(
				this.restoreRoot,
				projectSegment || 'project',
				envSegment || 'project',
				`backup-${backup.id}`,
			);
			await mkdir(restorePath, { recursive: true });
			await this.runProcess('tar', ['-xzf', archivePath, '-C', restorePath]);
			restoreLogs = `Files restored to ${restorePath}`;
		}

		if (shouldRestoreDatabase) {
			restoreLogs +=
				'; database restore marked for execution by migration runner';
		}

		return {
			task_id: taskId,
			status: 'completed',
			message: `Restore completed for ${backup.name}`,
			options: {
				database: shouldRestoreDatabase,
				files: shouldRestoreFiles,
			},
			restore_path: restorePath,
			logs: restoreLogs,
		};
	}

	async runBackup(
		backupId: number,
		payload?: {
			project_id?: number;
			environment_id?: number;
			backup_type?: string;
			storage_backends?: string[];
			override_gdrive_folder_id?: string | null;
			task_id?: string;
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const backup = await this.getBackup(backupId, ownerId);

		if (
			typeof payload?.project_id === 'number' &&
			payload.project_id !== backup.project_id
		) {
			throw new BadRequestException({ detail: 'Project mismatch for backup' });
		}

		if (typeof payload?.environment_id === 'number') {
			const envRows = await this.prisma.$queryRaw<
				{ id: number; project_id: number }[]
			>`
				SELECT ps.id, ps.project_id
				FROM project_servers ps
				JOIN projects p ON p.id = ps.project_id
				WHERE ps.id = ${payload.environment_id} AND p.owner_id = ${resolvedOwnerId}
				LIMIT 1
			`;
			const environment = envRows[0];
			if (!environment) {
				throw new NotFoundException({ detail: 'Environment not found' });
			}
			if (environment.project_id !== backup.project_id) {
				throw new BadRequestException({
					detail: 'Environment does not belong to backup project',
				});
			}
		}

		await this.prisma.$executeRaw`
			UPDATE backups
			SET status = ${'running'}::backupstatus, updated_at = NOW()
			WHERE id = ${backupId}
		`;

		const taskId = payload?.task_id?.trim() || randomUUID();
		let archivePath = '';
		const storageBackends =
			payload?.storage_backends && payload.storage_backends.length > 0
				? payload.storage_backends
				: [backup.storage_type];
		const backupSelection = this.resolveBackupTypeSelection(
			payload?.backup_type ?? backup.backup_type,
		);

		let logs: string[] = [];
		let backupWorkspacePath: string | null = null;
		let fallbackSourcePath: string | null = null;
		try {
			this.emitBackupRealtimeEvent({
				event: 'status',
				backup_id: backupId,
				project_id: backup.project_id,
				status: 'running',
			});
			await this.appendBackupLog(backupId, logs, 'Backup execution started', {
				project_id: backup.project_id,
				status: 'running',
			});

			const selectedEnvironmentId =
				typeof payload?.environment_id === 'number'
					? payload.environment_id
					: backup.project_server_id;

			const context = await this.getProjectBackupContext(
				backup.project_id,
				resolvedOwnerId,
				selectedEnvironmentId,
			);
			await this.appendBackupLog(
				backupId,
				logs,
				`Context resolved for project ${context.projectId}${context.environmentId ? ` environment ${context.environmentId}` : ''}`,
				{
					project_id: context.projectId,
					project_name: context.projectName,
					project_slug: context.projectSlug,
					status: 'running',
				},
			);
			await this.appendBackupLog(
				backupId,
				logs,
				`Backup type ${backupSelection.backupType} resolved to files=${backupSelection.includeFiles} database=${backupSelection.includeDatabase}`,
				{
					project_id: context.projectId,
					project_name: context.projectName,
					project_slug: context.projectSlug,
					status: 'running',
				},
			);

			const now = new Date();
			const year = `${now.getUTCFullYear()}`;
			const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');
			const day = `${now.getUTCDate()}`.padStart(2, '0');
			const timestamp = now.toISOString().replace(/[:.]/g, '-');
			const projectSegment = this.sanitizeSegment(
				context.projectSlug || context.projectName,
			);
			const envSegment = this.sanitizeSegment(
				context.environmentName ?? 'project',
			);
			archivePath = join(
				this.localBackupRoot,
				projectSegment || 'project',
				envSegment || 'project',
				year,
				month,
				`${projectSegment || 'project'}-${envSegment || 'project'}-${day}-${timestamp}.tar.gz`,
			);

			let archiveSourcePath: string;
			let source: {
				sourcePath: string;
				cleanupPath: string | null;
				logMessage: string;
			} | null = null;

			if (backupSelection.includeFiles) {
				source = await this.resolveBackupSource(
					context,
					backupId,
					backupSelection.backupType,
				);
				fallbackSourcePath = source.cleanupPath;
				await this.appendBackupLog(backupId, logs, source.logMessage, {
					project_id: context.projectId,
					project_name: context.projectName,
					project_slug: context.projectSlug,
					status: 'running',
				});
			}

			if (backupSelection.includeDatabase) {
				backupWorkspacePath = join(
					tmpdir(),
					'forge-backup-workspaces',
					`${backupId}-${randomUUID()}`,
				);
				await mkdir(backupWorkspacePath, { recursive: true });

				const databaseDumpPath = join(
					backupWorkspacePath,
					'database',
					'database.sql',
				);
				const dumpResult = await this.createDatabaseDump(
					context,
					databaseDumpPath,
					async message => {
						await this.appendBackupLog(
							backupId,
							logs,
							`Command trace: ${message}`,
							{
								project_id: context.projectId,
								project_name: context.projectName,
								project_slug: context.projectSlug,
								status: 'running',
							},
						);
					},
				);
				await this.appendBackupLog(
					backupId,
					logs,
					`Database dump captured at ${databaseDumpPath} using ${dumpResult.dumpBinary} (${dumpResult.databaseHost}:${dumpResult.databasePort})`,
					{
						project_id: context.projectId,
						project_name: context.projectName,
						project_slug: context.projectSlug,
						status: 'running',
					},
				);

				if (source) {
					const workspaceFilesPath = join(backupWorkspacePath, 'files');
					await cp(source.sourcePath, workspaceFilesPath, {
						recursive: true,
						force: true,
					});
					await this.appendBackupLog(
						backupId,
						logs,
						`Files staged at ${workspaceFilesPath}`,
						{
							project_id: context.projectId,
							project_name: context.projectName,
							project_slug: context.projectSlug,
							status: 'running',
						},
					);
				}

				archiveSourcePath = backupWorkspacePath;
			} else if (source) {
				archiveSourcePath = source.sourcePath;
			} else {
				throw new Error('Backup selection resolved to no content to archive');
			}

			await this.appendBackupLog(
				backupId,
				logs,
				`Creating archive from ${archiveSourcePath}`,
				{
					project_id: context.projectId,
					project_name: context.projectName,
					project_slug: context.projectSlug,
					status: 'running',
				},
			);

			const archiveResult = await this.createTarArchive(
				archiveSourcePath,
				archivePath,
			);
			await this.appendBackupLog(
				backupId,
				logs,
				`Archive created at ${archivePath} (${archiveResult.sizeBytes} bytes)`,
				{
					project_id: context.projectId,
					project_name: context.projectName,
					project_slug: context.projectSlug,
					status: 'running',
				},
			);

			let driveFolderId: string | null = null;
			let storageFileId: string | null = null;
			if (storageBackends.includes('google_drive')) {
				const driveRuntimeConfig = await this.assertConfiguredDriveRemote();
				await this.appendBackupLog(
					backupId,
					logs,
					`Verified Google Drive remote '${driveRuntimeConfig.remoteName}' is configured (source=${driveRuntimeConfig.remoteSource}, config=${driveRuntimeConfig.configPath})`,
					{
						project_id: context.projectId,
						project_name: context.projectName,
						project_slug: context.projectSlug,
						status: 'running',
					},
				);
				const driveFolderPath = this.resolveDriveFolderPath(
					context,
					payload?.override_gdrive_folder_id,
				);
				await this.appendBackupLog(
					backupId,
					logs,
					`Uploading archive to Google Drive path ${driveFolderPath} using remote ${driveRuntimeConfig.remoteName}`,
					{
						project_id: context.projectId,
						project_name: context.projectName,
						project_slug: context.projectSlug,
						status: 'running',
					},
				);
				const uploaded = await this.uploadArchiveToDriveFolder(
					archivePath,
					driveFolderPath,
					now,
					driveRuntimeConfig,
				);
				driveFolderId = uploaded.driveFolderId;
				storageFileId = uploaded.storageFileId;
				await this.appendBackupLog(
					backupId,
					logs,
					`Upload completed at ${uploaded.remoteTarget} (destination ${uploaded.destinationLabel})`,
					{
						project_id: context.projectId,
						project_name: context.projectName,
						project_slug: context.projectSlug,
						status: 'running',
					},
				);
			}

			if (fallbackSourcePath) {
				await this.appendBackupLog(
					backupId,
					logs,
					`Fallback source retained at ${fallbackSourcePath}`,
					{
						project_id: context.projectId,
						project_name: context.projectName,
						project_slug: context.projectSlug,
						status: 'running',
					},
				);
			}

			await this.appendBackupLog(backupId, logs, 'Finalizing backup record', {
				project_id: context.projectId,
				project_name: context.projectName,
				project_slug: context.projectSlug,
				status: 'running',
			});

			await this.prisma.$executeRaw`
				UPDATE backups
				SET
					status = ${'completed'}::backupstatus,
					storage_path = ${archivePath},
					size_bytes = ${BigInt(archiveResult.sizeBytes)},
					storage_file_id = ${storageFileId},
					drive_folder_id = ${driveFolderId},
					logs = ${logs.join('\n')},
					project_server_id = ${context.environmentId},
					completed_at = NOW(),
					updated_at = NOW(),
					error_message = NULL
				WHERE id = ${backupId}
			`;

			this.emitBackupRealtimeEvent({
				event: 'status',
				backup_id: backupId,
				project_id: context.projectId,
				project_name: context.projectName,
				project_slug: context.projectSlug,
				status: 'completed',
				logs: logs.join('\n'),
			});
		} catch (error) {
			const detail =
				error instanceof Error ? error.message : 'Unexpected backup error';
			if (archivePath) {
				logs.push(this.formatLogLine(`Archive target: ${archivePath}`));
			}
			logs.push(this.formatLogLine(`Backup failed: ${detail}`));
			await this.prisma.$executeRaw`
				UPDATE backups
				SET
					status = ${'failed'}::backupstatus,
					error_message = ${detail},
					logs = ${logs.join('\n')},
					updated_at = NOW()
				WHERE id = ${backupId}
			`;
			this.emitBackupRealtimeEvent({
				event: 'status',
				backup_id: backupId,
				project_id: backup.project_id,
				status: 'failed',
				error_message: detail,
				logs: logs.join('\n'),
			});
			throw new InternalServerErrorException({
				detail: `Backup execution failed: ${detail}`,
			});
		} finally {
			if (backupWorkspacePath) {
				await rm(backupWorkspacePath, { recursive: true, force: true }).catch(
					() => undefined,
				);
			}
		}

		return {
			status: 'accepted',
			task_id: taskId,
			backup_id: backupId,
			project_id: backup.project_id,
			environment_id: payload?.environment_id ?? null,
			backup_type: backupSelection.backupType,
			storage_backends: storageBackends,
			override_gdrive_folder_id: payload?.override_gdrive_folder_id ?? null,
			message: `Backup execution completed for ${backup.name}`,
		};
	}

	async restoreBackupRemote(
		backupId: number,
		payload: {
			project_server_id: number;
			database?: boolean;
			files?: boolean;
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const backup = await this.getBackup(backupId, ownerId);
		const envRows = await this.prisma.$queryRaw<
			{ id: number; project_id: number }[]
		>`
			SELECT ps.id, ps.project_id
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE ps.id = ${payload.project_server_id} AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const environment = envRows[0];
		if (!environment) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}
		if (environment.project_id !== backup.project_id) {
			throw new BadRequestException({
				detail: 'Environment does not belong to backup project',
			});
		}

		const taskId = randomUUID();
		return {
			status: 'accepted',
			task_id: taskId,
			backup_id: backupId,
			project_id: backup.project_id,
			project_server_id: payload.project_server_id,
			options: {
				database: payload.database ?? true,
				files: payload.files ?? true,
			},
			message: `Remote restore initiated for ${backup.name}`,
		};
	}

	async bulkCreateBackups(
		payload: {
			project_ids: number[];
			backup_type?: string;
			storage_type?: string;
			notes?: string;
			gdrive_upload?: boolean;
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const projectIds = payload.project_ids ?? [];
		if (projectIds.length < 1) {
			throw new BadRequestException({ detail: 'project_ids cannot be empty' });
		}
		if (projectIds.length > 50) {
			throw new BadRequestException({
				detail: 'Maximum 50 projects per request',
			});
		}

		const projects = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM projects
			WHERE id = ANY(${projectIds}) AND owner_id = ${resolvedOwnerId}
		`;
		const projectMap = new Map(projects.map(project => [project.id, project]));

		const success: Array<Record<string, unknown>> = [];
		const failed: Array<Record<string, unknown>> = [];

		for (const projectId of projectIds) {
			const project = projectMap.get(projectId);
			if (!project) {
				failed.push({
					project_id: projectId,
					error: 'Project not found or access denied',
				});
				continue;
			}

			const noteText =
				payload.notes && payload.notes.trim().length > 0
					? payload.notes
					: `Bulk backup - ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

			const insertedRows = await this.prisma.$queryRaw<{ id: number }[]>`
				INSERT INTO backups (
					name,
					backup_type,
					storage_type,
					storage_path,
					status,
					started_at,
					project_id,
					created_by_id,
					notes,
					updated_at
				)
				VALUES (
					${`Bulk Backup - ${project.name}`},
					${payload.backup_type ?? 'full'}::backuptype,
					${payload.storage_type ?? 'local'}::backupstoragetype,
					${`/backups/${project.id}/${randomUUID()}.tar.gz`},
					${'pending'}::backupstatus,
					NOW(),
					${project.id},
					${resolvedOwnerId},
					${noteText},
					NOW()
				)
				RETURNING id
			`;

			const inserted = insertedRows[0];
			if (!inserted) {
				failed.push({
					project_id: project.id,
					project_name: project.name,
					error: 'Failed to queue backup',
				});
				continue;
			}

			success.push({
				project_id: project.id,
				project_name: project.name,
				backup_id: inserted.id,
				task_id: randomUUID(),
				status: 'queued',
			});
		}

		return {
			success,
			failed,
			total_requested: projectIds.length,
			total_success: success.length,
			total_failed: failed.length,
		};
	}

	async bulkDeleteBackups(
		payload: { backup_ids: number[]; force?: boolean; delete_file?: boolean },
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const backupIds = payload.backup_ids ?? [];
		if (backupIds.length < 1) {
			throw new BadRequestException({ detail: 'backup_ids cannot be empty' });
		}
		if (backupIds.length > 100) {
			throw new BadRequestException({
				detail: 'Maximum 100 backups per request',
			});
		}

		const rows = await this.prisma.$queryRaw<
			{
				id: number;
				status: string;
				project_name: string | null;
				storage_type: string;
				storage_path: string;
				storage_file_id: string | null;
				drive_folder_id: string | null;
			}[]
		>`
			SELECT b.id, b.status, p.name AS project_name, b.storage_type, b.storage_path, b.storage_file_id, b.drive_folder_id
			FROM backups b
			JOIN projects p ON p.id = b.project_id
			WHERE b.id = ANY(${backupIds}) AND p.owner_id = ${resolvedOwnerId}
		`;
		const backupMap = new Map(rows.map(row => [row.id, row]));

		const success: Array<Record<string, unknown>> = [];
		const failed: Array<Record<string, unknown>> = [];

		for (const backupId of backupIds) {
			const backup = backupMap.get(backupId);
			if (!backup) {
				failed.push({
					backup_id: backupId,
					error: 'Backup not found or access denied',
				});
				continue;
			}

			if (!payload.force && ['pending', 'running'].includes(backup.status)) {
				failed.push({
					backup_id: backupId,
					project_name: backup.project_name,
					error: `Backup is ${backup.status}. Use force=true to delete.`,
				});
				continue;
			}

			const shouldDeleteFile = payload.delete_file ?? true;
			if (shouldDeleteFile) {
				if (backup.storage_type === 'google_drive') {
					await this.deleteDriveBackupArtifact({
						drive_folder_id: backup.drive_folder_id,
						storage_file_id: backup.storage_file_id,
						name: backup.project_name ?? `backup-${backup.id}`,
					});
				}

				if (backup.storage_path?.trim()) {
					await rm(resolve(backup.storage_path), { force: true }).catch(
						error => {
							const errno = error as NodeJS.ErrnoException;
							if (errno?.code === 'ENOENT') {
								return;
							}
							throw error;
						},
					);
				}
			}

			await this.prisma.$executeRaw`
				DELETE FROM backups
				WHERE id = ${backupId}
			`;

			success.push({
				backup_id: backupId,
				project_name: backup.project_name,
				file_deleted: shouldDeleteFile,
				status: 'deleted',
			});
		}

		return {
			success,
			failed,
			total_requested: backupIds.length,
			total_success: success.length,
			total_failed: failed.length,
		};
	}

	async pullRemoteBackup(
		payload: {
			project_server_id: number;
			backup_type?: string;
			include_database?: boolean;
			include_uploads?: boolean;
			include_plugins?: boolean;
			include_themes?: boolean;
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const envRows = await this.prisma.$queryRaw<
			{ id: number; project_id: number }[]
		>`
			SELECT ps.id, ps.project_id
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE ps.id = ${payload.project_server_id} AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		const environment = envRows[0];
		if (!environment) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}

		return {
			status: 'accepted',
			task_id: randomUUID(),
			project_server_id: payload.project_server_id,
			project_id: environment.project_id,
			backup_type: payload.backup_type ?? 'full',
			message: 'Remote backup pull queued',
		};
	}

	async scheduleBackup(
		payload: {
			project_id: number;
			schedule_type?: string;
			retention_days?: number;
			backup_type?: string;
			enabled?: boolean;
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const projectRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM projects
			WHERE id = ${payload.project_id} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		const project = projectRows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		return {
			project_id: payload.project_id,
			schedule_type: payload.schedule_type ?? 'daily',
			retention_days: payload.retention_days ?? 30,
			backup_type: payload.backup_type ?? 'full',
			enabled: payload.enabled ?? true,
			updated_at: new Date().toISOString(),
		};
	}

	async getBackupSchedule(projectId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const projectRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM projects
			WHERE id = ${projectId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		if (!projectRows[0]) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		return {
			project_id: projectId,
			schedule_type: 'daily',
			retention_days: 30,
			backup_type: 'full',
			enabled: false,
		};
	}

	async getBackupStatsSummary(ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<
			Array<{
				total: bigint;
				completed: bigint;
				failed: bigint;
				pending: bigint;
				running: bigint;
			}>
		>`
			SELECT
				COUNT(*)::bigint AS total,
				SUM(CASE WHEN b.status::text = 'completed' THEN 1 ELSE 0 END)::bigint AS completed,
				SUM(CASE WHEN b.status::text = 'failed' THEN 1 ELSE 0 END)::bigint AS failed,
				SUM(CASE WHEN b.status::text = 'pending' THEN 1 ELSE 0 END)::bigint AS pending,
				SUM(CASE WHEN b.status::text = 'running' THEN 1 ELSE 0 END)::bigint AS running
			FROM backups b
			JOIN projects p ON p.id = b.project_id
			WHERE p.owner_id = ${resolvedOwnerId}
		`;

		const stats = rows[0];
		return {
			total_backups: Number(stats?.total ?? 0n),
			completed_backups: Number(stats?.completed ?? 0n),
			failed_backups: Number(stats?.failed ?? 0n),
			pending_backups: Number(stats?.pending ?? 0n),
			running_backups: Number(stats?.running ?? 0n),
		};
	}
}
