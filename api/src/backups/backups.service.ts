import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
	OnModuleInit,
	UnauthorizedException,
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
import { WebsocketCompatService } from '../websocket/websocket-compat.service';
import { BackupsRepository } from './backups.repository';
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
	pending_runner: {
		enabled: boolean;
		runs_total: number;
		last_run_at: string | null;
		last_outcome: {
			claimed: number;
			processed: number;
			failed: number;
			error: string | null;
			duration_ms: number;
		} | null;
	};
	runs_total: number;
	last_run_at: string | null;
	last_outcome: {
		stale_marked: number;
		pruned: number;
		cleanup_deleted: number;
		cleanup_failed: number;
		error: string | null;
		duration_ms: number;
	} | null;
};

@Injectable()
export class BackupsService implements OnModuleInit {
	private readonly logger = new Logger(BackupsService.name);

	constructor(
		private readonly backupsRepository: BackupsRepository,
		private readonly driveRuntimeConfigService: DriveRuntimeConfigService,
		private readonly websocketCompatService: WebsocketCompatService,
	) {}
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
		pending_runner: {
			enabled:
				(process.env.BACKUP_RUNNER_ENABLED ?? 'true').toLowerCase() !== 'false',
			runs_total: 0,
			last_run_at: null,
			last_outcome: null,
		},
		runs_total: 0,
		last_run_at: null,
		last_outcome: null,
	};

	async onModuleInit() {
		try {
			const persisted = await this.backupsRepository.loadRunnerSnapshot();
			if (persisted) {
				this.maintenanceSnapshot = {
					...this.maintenanceSnapshot,
					...(persisted as Partial<BackupMaintenanceSnapshot>),
				};
			}
		} catch {
			// non-fatal: snapshot starts fresh when persistence is unavailable
		}
	}

	private resolveOwnerId(ownerId?: number): number {
		if (ownerId === undefined || ownerId === null) {
			throw new UnauthorizedException({ detail: 'Authentication required' });
		}
		return ownerId;
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
		duration_ms?: number;
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
				duration_ms:
					typeof outcome.duration_ms === 'number' &&
					Number.isFinite(outcome.duration_ms)
						? Math.max(0, Math.trunc(outcome.duration_ms))
						: 0,
			},
		};
		// fire-and-forget persistence so restarts recover last state
		this.backupsRepository
			.persistRunnerSnapshot(
				this.maintenanceSnapshot as unknown as Record<string, unknown>,
			)
			.catch(err =>
				this.logger.warn(
					`Failed to persist maintenance snapshot: ${
						err instanceof Error ? err.message : String(err)
					}`,
				),
			);
	}

	recordPendingRunnerSnapshot(outcome: {
		claimed: number;
		processed: number;
		failed: number;
		error?: string | null;
		duration_ms?: number;
	}) {
		this.maintenanceSnapshot = {
			...this.maintenanceSnapshot,
			pending_runner: {
				...this.maintenanceSnapshot.pending_runner,
				runs_total: this.maintenanceSnapshot.pending_runner.runs_total + 1,
				last_run_at: new Date().toISOString(),
				last_outcome: {
					claimed: Math.max(0, Math.trunc(outcome.claimed)),
					processed: Math.max(0, Math.trunc(outcome.processed)),
					failed: Math.max(0, Math.trunc(outcome.failed)),
					error: outcome.error ?? null,
					duration_ms:
						typeof outcome.duration_ms === 'number' &&
						Number.isFinite(outcome.duration_ms)
							? Math.max(0, Math.trunc(outcome.duration_ms))
							: 0,
				},
			},
		};
		// fire-and-forget persistence so restarts recover last state
		this.backupsRepository
			.persistRunnerSnapshot(
				this.maintenanceSnapshot as unknown as Record<string, unknown>,
			)
			.catch(err =>
				this.logger.warn(
					`Failed to persist pending runner snapshot: ${
						err instanceof Error ? err.message : String(err)
					}`,
				),
			);
	}

	async claimPendingBackups(limit = 5) {
		const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
		return this.backupsRepository.claimPendingBackups(safeLimit);
	}

	async markStaleRunningBackupsFailed(staleMinutes = 120, limit = 10) {
		return this.backupsRepository.markStaleRunningBackupsFailed(
			staleMinutes,
			limit,
		);
	}

	async pruneTerminalBackups(
		retentionDays = 30,
		keepPerProject = 20,
		limit = 100,
	) {
		return this.backupsRepository.pruneTerminalBackups(
			retentionDays,
			keepPerProject,
			limit,
		);
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
		return this.backupsRepository.getSystemPrivateKey();
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

	private async scpDirectoryFromRemote(
		context: ProjectBackupContext,
		remotePath: string,
		localParentPath: string,
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
			'-r',
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
		args.push(`${sshUser}@${sshHost}:${remotePath}`, localParentPath);

		await this.runProcess('scp', args);
	}

	private async resolveExistingRemoteSourcePath(
		context: ProjectBackupContext,
		pathCandidates: string[],
		keyFilePath: string,
	) {
		for (const candidate of pathCandidates) {
			try {
				const captured = await this.runSshCommandCapture(
					context,
					`test -d ${this.shellQuote(candidate)} && printf '__FORGE_EXISTS__' || true`,
					keyFilePath,
				);
				if ((captured.stdout || '').includes('__FORGE_EXISTS__')) {
					return candidate;
				}
			} catch {
				continue;
			}
		}

		return null;
	}

	/**
	 * Database dump: a self-contained bash script runs on the remote server
	 * via SSH. The script sources .env natively (bash handles all quoting
	 * formats), writes the password to a private my.cnf, and runs
	 * mariadb-dump/mysqldump via --defaults-extra-file so the password never
	 * appears as a shell argument.
	 */
	private async createDatabaseDumpViaRemoteScript(
		context: ProjectBackupContext,
		destinationPath: string,
		pathCandidates: Array<string | null | undefined>,
		commandTrace?: (message: string) => Promise<void>,
	): Promise<void> {
		await this.withSshKey(context, async keyFilePath => {
			const remoteDumpPath = `/tmp/forge-rs-${randomUUID()}.sql`;

			// .env search roots: each valid candidate + its two parents
			const validCandidates = pathCandidates
				.filter(
					(p): p is string => typeof p === 'string' && p.trim().startsWith('/'),
				)
				.map(p => p.trim())
				.filter((v, i, a) => a.indexOf(v) === i);

			const roots = validCandidates
				.flatMap(p => {
					const p1 = dirname(p);
					const p2 = dirname(p1);
					return [p, p1, p2];
				})
				.filter((v, i, a) => v.length > 1 && a.indexOf(v) === i);

			// Paths are server filesystem paths — no shell metacharacters.
			// Single-quoted in the generated script.
			const envSearchArgs = roots
				.flatMap(r => [`'${r}/.env'`, `'${r}/.env.local'`])
				.join(' ');

			const scriptLines = [
				'#!/usr/bin/env bash',
				'set -euo pipefail',
				`DUMP_FILE='${remoteDumpPath}'`,
				'CREDS_FILE=$(mktemp /tmp/forge-creds-XXXXXX.cnf)',
				'ERR_FILE=$(mktemp /tmp/forge-err-XXXXXX.txt)',
				`trap 'rm -f "$CREDS_FILE" "$ERR_FILE"' EXIT`,
				'',
				'# Locate first readable .env / .env.local',
				'ENV_FILE=""',
				`for CANDIDATE in ${envSearchArgs}; do`,
				'  if [ -f "$CANDIDATE" ]; then ENV_FILE="$CANDIDATE"; break; fi',
				'done',
				'[ -n "$ENV_FILE" ] || { echo "forge-dump-err: no .env found in search paths" >&2; exit 1; }',
				'',
				'# Source .env natively — bash handles all quoting/escaping formats correctly',
				'# shellcheck source=/dev/null',
				'set -a; source "$ENV_FILE"; set +a',
				'',
				'# Normalise variable names: Bedrock=DB_*, standard WP=WORDPRESS_DB_*',
				'DB_HOST="${DB_HOST:-${WORDPRESS_DB_HOST:-localhost}}"',
				'DB_NAME="${DB_NAME:-${WORDPRESS_DB_NAME:-}}"',
				'DB_USER="${DB_USER:-${WORDPRESS_DB_USER:-}}"',
				'DB_PASS="${DB_PASSWORD:-${DB_PASS:-${WORDPRESS_DB_PASSWORD:-}}}"',
				'',
				'[ -n "$DB_NAME" ] && [ -n "$DB_USER" ] && [ -n "$DB_PASS" ] || {',
				'  echo "forge-dump-err: incomplete credentials in $ENV_FILE (name=$DB_NAME user=$DB_USER)" >&2; exit 1',
				'}',
				'',
				'# Password goes into a private my.cnf — never appears as a shell argument',
				'printf "[client]\\npassword=%s\\n" "$DB_PASS" > "$CREDS_FILE"',
				'chmod 600 "$CREDS_FILE"',
				'',
				'# Try mariadb-dump then mysqldump (whichever binary exists on the server)',
				'for BIN in mariadb-dump mysqldump; do',
				'  command -v "$BIN" >/dev/null 2>&1 || continue',
				'  DUMP_ARGS=(',
				'    "--defaults-extra-file=$CREDS_FILE"',
				'    "--single-transaction" "--quick" "--lock-tables=false"',
				'    "--user=$DB_USER"',
				'    "--result-file=$DUMP_FILE"',
				'  )',
				'  # localhost = Unix socket (omit --host); anything else = TCP --host',
				'  if [ -n "$DB_HOST" ] && [ "$DB_HOST" != "localhost" ]; then',
				'    DUMP_ARGS+=("--host=$DB_HOST")',
				'  fi',
				'  if "$BIN" "${DUMP_ARGS[@]}" "$DB_NAME" 2>"$ERR_FILE"; then',
				'    echo "FORGE_DUMP_OK:$DUMP_FILE"; exit 0',
				'  fi',
				'done',
				'',
				'printf "forge-dump-err: all strategies failed:\\n%s\\n" "$(cat \'$ERR_FILE\')" >&2',
				'exit 1',
			];

			const b64 = Buffer.from(scriptLines.join('\n')).toString('base64');
			// base64 alphabet has no shell metacharacters — single-quote wrapping is safe
			const sshCommand = `echo '${b64}' | base64 -d | bash`;

			if (commandTrace) {
				await commandTrace(
					'ssh remote-script: sourcing .env server-side, dump via --defaults-extra-file',
				);
			}

			try {
				const result = await this.runSshCommandCapture(
					context,
					sshCommand,
					keyFilePath,
				);
				const stdout = result.stdout ?? '';
				const match = stdout.match(/FORGE_DUMP_OK:([^\s\r\n]+)/);
				if (!match?.[1]) {
					throw new Error(
						`remote script produced no success marker. stdout: ${stdout.slice(0, 500)}`,
					);
				}
				await this.scpFromRemote(
					context,
					match[1],
					destinationPath,
					keyFilePath,
				);
			} finally {
				await this.runSshCommand(
					context,
					`rm -f '${remoteDumpPath}'`,
					keyFilePath,
				).catch(() => undefined);
			}
		});
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

		await mkdir(dirname(destinationPath), { recursive: true });

		await this.createDatabaseDumpViaRemoteScript(
			context,
			destinationPath,
			[context.environmentPath, context.projectPath],
			commandTrace,
		);
		return {
			databaseHost: 'remote-script',
			databasePort: 'remote-script',
			dumpBinary: 'remote-script',
			transport: 'ssh-remote-script',
		};
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
		return this.backupsRepository.getBackupExecutionContext(
			projectId,
			ownerId,
			environmentId,
		);
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

		if (!context.serverHostname) {
			throw new Error(
				`Backup source path not found locally for backup ${backupId}. Checked: ${candidates.join(', ') || 'none'}`,
			);
		}

		if (candidates.length === 0) {
			throw new Error(
				`Backup source path is not configured for ${backupType} backup ${backupId}`,
			);
		}

		return this.withSshKey(context, async keyFilePath => {
			const remoteSourcePath = await this.resolveExistingRemoteSourcePath(
				context,
				candidates,
				keyFilePath,
			);

			if (!remoteSourcePath) {
				throw new Error(
					`Backup source path not found on remote host for backup ${backupId}. Checked: ${candidates.join(', ')}`,
				);
			}

			const stagingRoot = join(
				tmpdir(),
				'forge-backup-remote-stage',
				`${backupId}-${randomUUID()}`,
			);
			await mkdir(stagingRoot, { recursive: true });
			await this.scpDirectoryFromRemote(
				context,
				remoteSourcePath,
				stagingRoot,
				keyFilePath,
			);
			const stagedSourcePath = join(stagingRoot, basename(remoteSourcePath));

			return {
				sourcePath: stagedSourcePath,
				cleanupPath: stagingRoot,
				logMessage: `Staged remote source path ${remoteSourcePath} into ${stagedSourcePath}`,
			};
		});
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
		await this.backupsRepository.updateBackupLogs(backupId, logs.join('\n'));

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

		const rows = await this.backupsRepository.listOwnedBackups({
			project_id: query.project_id,
			backup_type: query.backup_type,
			status: query.status,
			skip,
			limit,
			owner_id: resolvedOwnerId,
		});

		return rows.map(row => this.normalizeBackup(row));
	}

	async createBackup(payload: BackupCreateDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const project = await this.backupsRepository.ensureOwnedProject(
			payload.project_id,
			resolvedOwnerId,
		);

		if (payload.environment_id) {
			await this.backupsRepository.getOwnedProjectEnvironment(
				payload.project_id,
				payload.environment_id,
				resolvedOwnerId,
			);
		}

		const taskId = randomUUID();
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const backupName =
			payload.name && payload.name.trim().length > 0
				? payload.name
				: `Backup ${project.name} - ${timestamp}`;
		const storagePath = `/backups/${payload.project_id}/${timestamp}-${taskId}.tar.gz`;

		const inserted = await this.backupsRepository.createOwnedBackup({
			project_id: payload.project_id,
			owner_id: resolvedOwnerId,
			name: backupName,
			backup_type: payload.backup_type ?? 'full',
			storage_type: payload.storage_type ?? 'local',
			storage_path: storagePath,
			environment_id: payload.environment_id,
			notes: payload.notes,
		});

		return {
			task_id: taskId,
			status: 'pending',
			message: `Creating ${(payload.backup_type ?? 'full').toLowerCase()} backup for ${project.name}`,
			backup_id: inserted.id,
		};
	}

	async getBackup(backupId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const backup = await this.backupsRepository.getOwnedBackup(
			backupId,
			resolvedOwnerId,
		);
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

		await this.backupsRepository.deleteBackupById(backupId);
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
			const environment =
				await this.backupsRepository.getOwnedProjectEnvironment(
					backup.project_id,
					payload.environment_id,
					resolvedOwnerId,
				);
			if (environment.project_id !== backup.project_id) {
				throw new BadRequestException({
					detail: 'Environment does not belong to backup project',
				});
			}
		}

		await this.backupsRepository.setBackupRunning(backupId);

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

			await this.backupsRepository.completeBackup({
				backupId,
				storage_path: archivePath,
				size_bytes: BigInt(archiveResult.sizeBytes),
				storage_file_id: storageFileId,
				drive_folder_id: driveFolderId,
				logs: logs.join('\n'),
				project_server_id: context.environmentId,
			});

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
			await this.backupsRepository.failBackup(
				backupId,
				detail,
				logs.join('\n'),
			);
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
		const environment =
			await this.backupsRepository.getOwnedProjectEnvironmentByServerId(
				payload.project_server_id,
				resolvedOwnerId,
			);
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

		const projects = await this.backupsRepository.bulkGetOwnedProjects(
			projectIds,
			resolvedOwnerId,
		);
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

			let inserted: { id: number } | undefined;
			try {
				inserted = await this.backupsRepository.bulkCreateBackupRecord({
					name: `Bulk Backup - ${project.name}`,
					backup_type: payload.backup_type ?? 'full',
					storage_type: payload.storage_type ?? 'local',
					storage_path: `/backups/${project.id}/${randomUUID()}.tar.gz`,
					project_id: project.id,
					owner_id: resolvedOwnerId,
					notes: noteText,
				});
			} catch {
				inserted = undefined;
			}
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

		const rows = await this.backupsRepository.bulkGetOwnedBackupsByIds(
			backupIds,
			resolvedOwnerId,
		);
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

			await this.backupsRepository.deleteBackupById(backupId);

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
		const environment =
			await this.backupsRepository.getOwnedProjectEnvironmentByServerId(
				payload.project_server_id,
				resolvedOwnerId,
			);
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
		const project = await this.backupsRepository.getOwnedProject(
			payload.project_id,
			resolvedOwnerId,
		);
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
		const project = await this.backupsRepository.getOwnedProject(
			projectId,
			resolvedOwnerId,
		);
		if (!project) {
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
		return this.backupsRepository.getBackupStatsSummary(resolvedOwnerId);
	}
}
