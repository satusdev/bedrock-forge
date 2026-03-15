import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type BackupWithProject = {
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

export type BackupExecutionContextRecord = {
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

@Injectable()
export class BackupsRepository {
	constructor(private readonly prisma: PrismaService) {}

	private toBackupWithProject(backup: {
		id: number;
		project_id: number;
		name: string;
		backup_type: unknown;
		storage_type: unknown;
		status: unknown;
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
		projects?: { name: string | null } | null;
	}): BackupWithProject {
		return {
			id: backup.id,
			project_id: backup.project_id,
			project_name: backup.projects?.name ?? null,
			name: backup.name,
			backup_type: String(backup.backup_type),
			storage_type: String(backup.storage_type),
			status: String(backup.status),
			storage_path: backup.storage_path,
			size_bytes: backup.size_bytes,
			error_message: backup.error_message,
			notes: backup.notes,
			logs: backup.logs,
			storage_file_id: backup.storage_file_id,
			drive_folder_id: backup.drive_folder_id,
			project_server_id: backup.project_server_id,
			created_at: backup.created_at,
			completed_at: backup.completed_at,
		};
	}

	async listOwnedBackups(query: {
		project_id?: number;
		backup_type?: string;
		status?: string;
		skip: number;
		limit: number;
		owner_id: number;
	}) {
		const rows = await this.prisma.backups.findMany({
			where: {
				...(typeof query.project_id === 'number'
					? { project_id: query.project_id }
					: {}),
				...(query.backup_type ? { backup_type: query.backup_type as any } : {}),
				...(query.status ? { status: query.status as any } : {}),
				projects: {
					is: {
						owner_id: query.owner_id,
					},
				},
			},
			include: {
				projects: {
					select: {
						name: true,
					},
				},
			},
			orderBy: {
				created_at: 'desc',
			},
			skip: query.skip,
			take: query.limit,
		});

		return rows.map(row => this.toBackupWithProject(row));
	}

	async getOwnedProject(projectId: number, ownerId: number) {
		return this.prisma.projects.findFirst({
			where: {
				id: projectId,
				owner_id: ownerId,
			},
			select: {
				id: true,
				name: true,
				slug: true,
				path: true,
				gdrive_backups_folder_id: true,
			},
		});
	}

	async ensureOwnedProject(projectId: number, ownerId: number) {
		const project = await this.getOwnedProject(projectId, ownerId);
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
		return project;
	}

	async getOwnedProjectEnvironment(
		projectId: number,
		environmentId: number,
		ownerId: number,
	) {
		const environment = await this.prisma.project_servers.findFirst({
			where: {
				id: environmentId,
				project_id: projectId,
				projects: {
					is: {
						owner_id: ownerId,
					},
				},
			},
			include: {
				servers: {
					select: {
						hostname: true,
						ssh_user: true,
						ssh_port: true,
						ssh_key_path: true,
						ssh_private_key: true,
						ssh_password: true,
					},
				},
			},
		});

		if (!environment) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}

		return environment;
	}

	async createOwnedBackup(args: {
		project_id: number;
		owner_id: number;
		name: string;
		backup_type: string;
		storage_type: string;
		storage_path: string;
		environment_id?: number | null;
		notes?: string | null;
	}) {
		return this.prisma.backups.create({
			data: {
				name: args.name,
				backup_type: args.backup_type as any,
				storage_type: args.storage_type as any,
				storage_path: args.storage_path,
				status: 'pending' as any,
				started_at: new Date(),
				project_id: args.project_id,
				created_by_id: args.owner_id,
				project_server_id: args.environment_id ?? null,
				notes: args.notes ?? null,
			},
			select: {
				id: true,
			},
		});
	}

	async getOwnedBackup(backupId: number, ownerId: number) {
		const row = await this.prisma.backups.findFirst({
			where: {
				id: backupId,
				projects: {
					is: {
						owner_id: ownerId,
					},
				},
			},
			include: {
				projects: {
					select: {
						name: true,
					},
				},
			},
		});

		if (!row) {
			throw new NotFoundException({ detail: 'Backup not found' });
		}

		return this.toBackupWithProject(row);
	}

	async setBackupRunning(backupId: number) {
		await this.prisma.backups.update({
			where: { id: backupId },
			data: {
				status: 'running' as any,
			},
		});
	}

	async updateBackupLogs(backupId: number, logs: string) {
		await this.prisma.backups.update({
			where: { id: backupId },
			data: {
				logs,
			},
		});
	}

	async completeBackup(args: {
		backupId: number;
		storage_path: string;
		size_bytes: bigint;
		storage_file_id: string | null;
		drive_folder_id: string | null;
		logs: string;
		project_server_id: number | null;
	}) {
		await this.prisma.backups.update({
			where: { id: args.backupId },
			data: {
				status: 'completed' as any,
				storage_path: args.storage_path,
				size_bytes: args.size_bytes,
				storage_file_id: args.storage_file_id,
				drive_folder_id: args.drive_folder_id,
				logs: args.logs,
				project_server_id: args.project_server_id,
				completed_at: new Date(),
				error_message: null,
			},
		});
	}

	async failBackup(backupId: number, detail: string, logs: string) {
		await this.prisma.backups.update({
			where: { id: backupId },
			data: {
				status: 'failed' as any,
				error_message: detail,
				logs,
			},
		});
	}

	async getBackupExecutionContext(
		projectId: number,
		ownerId: number,
		environmentId?: number | null,
	): Promise<BackupExecutionContextRecord> {
		const project = await this.ensureOwnedProject(projectId, ownerId);

		const environment =
			typeof environmentId === 'number'
				? await this.getOwnedProjectEnvironment(
						projectId,
						environmentId,
						ownerId,
					)
				: null;

		return {
			projectId: project.id,
			projectName: project.name,
			projectSlug: project.slug,
			projectPath: project.path,
			projectDriveBackupsFolder: project.gdrive_backups_folder_id,
			environmentId: environment?.id ?? null,
			environmentName: environment?.environment
				? String(environment.environment)
				: null,
			environmentPath: environment?.wp_path ?? null,
			environmentDriveBackupsFolder:
				environment?.gdrive_backups_folder_id ?? null,
			databaseName: environment?.database_name ?? null,
			databaseUser: environment?.database_user ?? null,
			databasePassword: environment?.database_password ?? null,
			serverHostname: environment?.servers.hostname ?? null,
			sshUser:
				environment?.ssh_user?.trim() ||
				environment?.servers.ssh_user?.trim() ||
				null,
			sshPort: environment?.servers.ssh_port ?? null,
			sshKeyPath:
				environment?.ssh_key_path ?? environment?.servers.ssh_key_path ?? null,
			sshPrivateKey: environment?.servers.ssh_private_key ?? null,
			sshPassword: environment?.servers.ssh_password ?? null,
		};
	}

	// ---------------------------------------------------------------------------
	// Atomic claim — uses FOR UPDATE SKIP LOCKED to prevent multi-pod double-claim.
	// This is the only justified use of raw SQL in this repository; Prisma ORM
	// does not expose SKIP LOCKED semantics.
	// ---------------------------------------------------------------------------
	async claimPendingBackups(
		batchSize: number,
	): Promise<{ id: number; created_by_id: number }[]> {
		const safeLimit = Math.max(1, Math.min(100, Math.trunc(batchSize)));
		const rows = await this.prisma.$queryRaw<
			{ id: number; created_by_id: number }[]
		>`
			UPDATE backups
			SET status = 'running'::backupstatus, updated_at = NOW()
			WHERE id IN (
				SELECT id FROM backups
				WHERE status = 'pending'::backupstatus
				AND created_by_id IS NOT NULL
				ORDER BY started_at ASC, id ASC
				LIMIT ${safeLimit}
				FOR UPDATE SKIP LOCKED
			)
			RETURNING id, created_by_id
		`;
		return rows;
	}

	async markStaleRunningBackupsFailed(
		staleMinutes: number,
		limit: number,
	): Promise<{ id: number }[]> {
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
		const marked: { id: number }[] = [];
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
		retentionDays: number,
		keepPerProject: number,
		limit: number,
	): Promise<{ id: number; storage_type: string; storage_path: string }[]> {
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

		// Bounded fetch: load at most safeLimit * (safeKeepPerProject + 1) rows to
		// avoid unbounded memory consumption while guaranteeing enough candidates.
		const maxFetch = Math.min(10_000, safeLimit * (safeKeepPerProject + 1));

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
			take: maxFetch,
			select: {
				id: true,
				project_id: true,
				storage_type: true,
				storage_path: true,
			},
		});

		const rankByProject = new Map<number, number>();
		const pruned: { id: number; storage_type: string; storage_path: string }[] =
			[];
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
				storage_type: String(row.storage_type),
				storage_path: row.storage_path,
			});
		}

		if (pruned.length === 0) {
			return [];
		}

		await this.prisma.backups.deleteMany({
			where: { id: { in: pruned.map(r => r.id) } },
		});
		return pruned;
	}

	async getSystemPrivateKey(): Promise<string | null> {
		const row = await this.prisma.app_settings.findFirst({
			where: { key: 'system.ssh.private_key' },
			select: { encrypted_value: true, value: true },
		});
		return row?.encrypted_value ?? row?.value ?? null;
	}

	async deleteBackupById(backupId: number): Promise<void> {
		await this.prisma.backups.delete({ where: { id: backupId } });
	}

	async getOwnedProjectEnvironmentByServerId(
		projectServerId: number,
		ownerId: number,
	): Promise<{ id: number; project_id: number } | null> {
		return this.prisma.project_servers.findFirst({
			where: {
				id: projectServerId,
				projects: { is: { owner_id: ownerId } },
			},
			select: { id: true, project_id: true },
		});
	}

	async bulkGetOwnedProjects(
		projectIds: number[],
		ownerId: number,
	): Promise<{ id: number; name: string }[]> {
		return this.prisma.projects.findMany({
			where: { id: { in: projectIds }, owner_id: ownerId },
			select: { id: true, name: true },
		});
	}

	async bulkCreateBackupRecord(args: {
		name: string;
		backup_type: string;
		storage_type: string;
		storage_path: string;
		project_id: number;
		owner_id: number;
		notes: string;
	}): Promise<{ id: number }> {
		return this.prisma.backups.create({
			data: {
				name: args.name,
				backup_type: args.backup_type as any,
				storage_type: args.storage_type as any,
				storage_path: args.storage_path,
				status: 'pending' as any,
				started_at: new Date(),
				project_id: args.project_id,
				created_by_id: args.owner_id,
				notes: args.notes,
			},
			select: { id: true },
		});
	}

	async bulkGetOwnedBackupsByIds(
		backupIds: number[],
		ownerId: number,
	): Promise<
		{
			id: number;
			status: string;
			project_name: string | null;
			storage_type: string;
			storage_path: string;
			storage_file_id: string | null;
			drive_folder_id: string | null;
		}[]
	> {
		const rows = await this.prisma.backups.findMany({
			where: {
				id: { in: backupIds },
				projects: { is: { owner_id: ownerId } },
			},
			select: {
				id: true,
				status: true,
				storage_type: true,
				storage_path: true,
				storage_file_id: true,
				drive_folder_id: true,
				projects: { select: { name: true } },
			},
		});
		return rows.map(r => ({
			id: r.id,
			status: String(r.status),
			project_name: r.projects?.name ?? null,
			storage_type: String(r.storage_type),
			storage_path: r.storage_path,
			storage_file_id: r.storage_file_id,
			drive_folder_id: r.drive_folder_id,
		}));
	}

	async bulkDeleteBackupsByIds(backupIds: number[]): Promise<void> {
		await this.prisma.backups.deleteMany({ where: { id: { in: backupIds } } });
	}

	async getBackupStatsSummary(ownerId: number): Promise<{
		total_backups: number;
		completed_backups: number;
		failed_backups: number;
		pending_backups: number;
		running_backups: number;
	}> {
		const counts = await this.prisma.backups.groupBy({
			by: ['status'],
			where: { projects: { is: { owner_id: ownerId } } },
			_count: { id: true },
		});
		const byStatus = new Map(counts.map(c => [String(c.status), c._count.id]));
		const total = counts.reduce((sum, c) => sum + c._count.id, 0);
		return {
			total_backups: total,
			completed_backups: byStatus.get('completed') ?? 0,
			failed_backups: byStatus.get('failed') ?? 0,
			pending_backups: byStatus.get('pending') ?? 0,
			running_backups: byStatus.get('running') ?? 0,
		};
	}

	async persistRunnerSnapshot(
		snapshot: Record<string, unknown>,
	): Promise<void> {
		const value = JSON.stringify(snapshot);
		await this.prisma.app_settings.upsert({
			where: { key: 'backup.runner.snapshot' },
			create: { key: 'backup.runner.snapshot', value, is_sensitive: false },
			update: { value, updated_at: new Date() },
		});
	}

	async loadRunnerSnapshot(): Promise<Record<string, unknown> | null> {
		const row = await this.prisma.app_settings.findFirst({
			where: { key: 'backup.runner.snapshot' },
			select: { value: true },
		});
		if (!row?.value) {
			return null;
		}
		try {
			return JSON.parse(row.value) as Record<string, unknown>;
		} catch {
			return null;
		}
	}
}
