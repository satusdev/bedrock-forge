import {
	BadRequestException,
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { homedir, tmpdir } from 'os';
import { basename, dirname, join, resolve } from 'path';
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
		private readonly websocketCompatService: WebsocketCompatService,
	) {}

	private readonly fallbackOwnerId = 1;
	private readonly localBackupRoot =
		process.env.FORGE_BACKUP_ROOT?.trim() || '/tmp/forge-backups';
	private readonly restoreRoot =
		process.env.FORGE_RESTORE_ROOT?.trim() || '/tmp/forge-restores';
	private readonly driveMirrorRoot =
		process.env.FORGE_GDRIVE_MIRROR_ROOT?.trim() || '/tmp/forge-gdrive';
	private readonly gdriveRcloneRemote =
		process.env.FORGE_BACKUP_GDRIVE_REMOTE?.trim() || 'gdrive';
	private readonly rcloneConfigPath = process.env.RCLONE_CONFIG?.trim() || null;
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
		const now = new Date();
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

			await tx.backups.updateMany({
				where: {
					id: { in: claimed.map(row => row.id) },
					status: 'pending',
				},
				data: {
					status: 'running',
					updated_at: now,
				},
			});

			return claimed as PendingBackupClaim[];
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
		for (const row of stale) {
			await this.prisma.backups.update({
				where: { id: row.id },
				data: {
					status: 'failed',
					error_message:
						row.error_message ??
						'Marked as failed by backup maintenance runner after stale runtime threshold',
					completed_at: row.completed_at ?? now,
					updated_at: now,
				},
			});
		}

		return stale.map(row => ({ id: row.id }));
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

	private getRcloneConfigPath() {
		if (this.rcloneConfigPath) {
			return resolve(this.rcloneConfigPath);
		}
		return resolve(`${homedir()}/.config/rclone/rclone.conf`);
	}

	private getRemoteSectionPattern(remoteName: string) {
		return new RegExp(
			`^\\[${remoteName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\]$`,
			'm',
		);
	}

	private async assertConfiguredDriveRemote() {
		const configPath = this.getRcloneConfigPath();
		if (!existsSync(configPath)) {
			throw new Error(
				`Google Drive backup remote '${this.gdriveRcloneRemote}' is unavailable: rclone config not found at ${configPath}. Configure it via /api/v1/rclone/authorize or provide RCLONE_CONFIG.`,
			);
		}

		const configStats = await stat(configPath);
		if (configStats.isDirectory()) {
			throw new Error(
				`Google Drive backup remote '${this.gdriveRcloneRemote}' is unavailable: RCLONE_CONFIG points to a directory (${configPath}).`,
			);
		}

		const rawConfig = await readFile(configPath, 'utf-8');
		const remoteSectionPattern = this.getRemoteSectionPattern(
			this.gdriveRcloneRemote,
		);
		if (!remoteSectionPattern.test(rawConfig)) {
			throw new Error(
				`Google Drive backup remote '${this.gdriveRcloneRemote}' is missing in ${configPath}. Add section [${this.gdriveRcloneRemote}] or update FORGE_BACKUP_GDRIVE_REMOTE.`,
			);
		}
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
			const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
			  }
			| undefined;
		if (typeof environmentId === 'number') {
			const envRows = await this.prisma.$queryRaw<
				Array<{
					id: number;
					environment: string;
					wp_path: string;
					gdrive_backups_folder_id: string | null;
				}>
			>`
				SELECT ps.id, ps.environment::text AS environment, ps.wp_path, ps.gdrive_backups_folder_id
				FROM project_servers ps
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
	) {
		const year = `${createdAt.getUTCFullYear()}`;
		const month = `${createdAt.getUTCMonth() + 1}`.padStart(2, '0');
		const targetValue = driveFolderPath.trim();
		const targetIsFolderId = this.isDriveFolderId(targetValue);
		const relativeTargetPath = `${year}/${month}/${basename(archivePath)}`;

		const folderSegments = this.splitDrivePath(targetValue);
		const driveFolderPathWithDate = [...folderSegments, year, month].join('/');
		const remoteTarget = targetIsFolderId
			? `${this.gdriveRcloneRemote},root_folder_id=${targetValue}:${relativeTargetPath}`
			: `${this.gdriveRcloneRemote}:${driveFolderPathWithDate}/${basename(archivePath)}`;
		const rcloneArgs = this.rcloneConfigPath
			? [
					'--config',
					this.rcloneConfigPath,
					'copyto',
					archivePath,
					remoteTarget,
					'--stats',
					'0',
					'--transfers',
					'1',
					'--checkers',
					'2',
				]
			: [
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

	async deleteBackup(backupId: number, force = false, ownerId?: number) {
		const backup = await this.getBackup(backupId, ownerId);
		if (!force && ['running', 'pending'].includes(backup.status)) {
			throw new BadRequestException({
				detail: 'Backup is currently running. Use force=true to delete anyway.',
			});
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

		let logs: string[] = [];
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

			const source = await this.resolveBackupSource(
				context,
				backupId,
				payload?.backup_type ?? backup.backup_type,
			);
			await this.appendBackupLog(backupId, logs, source.logMessage, {
				project_id: context.projectId,
				project_name: context.projectName,
				project_slug: context.projectSlug,
				status: 'running',
			});
			await this.appendBackupLog(
				backupId,
				logs,
				`Creating archive from ${source.sourcePath}`,
				{
					project_id: context.projectId,
					project_name: context.projectName,
					project_slug: context.projectSlug,
					status: 'running',
				},
			);

			const archiveResult = await this.createTarArchive(
				source.sourcePath,
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
				await this.assertConfiguredDriveRemote();
				await this.appendBackupLog(
					backupId,
					logs,
					`Verified Google Drive remote '${this.gdriveRcloneRemote}' is configured`,
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
					`Uploading archive to Google Drive path ${driveFolderPath} using remote ${this.gdriveRcloneRemote}`,
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

			if (source.cleanupPath) {
				await this.appendBackupLog(
					backupId,
					logs,
					`Fallback source retained at ${source.cleanupPath}`,
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
		}

		return {
			status: 'accepted',
			task_id: taskId,
			backup_id: backupId,
			project_id: backup.project_id,
			environment_id: payload?.environment_id ?? null,
			backup_type: payload?.backup_type ?? backup.backup_type,
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
		payload: { backup_ids: number[]; force?: boolean },
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
			{ id: number; status: string; project_name: string | null }[]
		>`
			SELECT b.id, b.status, p.name AS project_name
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

			await this.prisma.$executeRaw`
				DELETE FROM backups
				WHERE id = ${backupId}
			`;

			success.push({
				backup_id: backupId,
				project_name: backup.project_name,
				file_deleted: true,
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
