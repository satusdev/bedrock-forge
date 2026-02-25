import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
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
	created_at: Date;
	completed_at: Date | null;
};

@Injectable()
export class BackupsService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
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
			gdrive_link:
				row.storage_type === 'google_drive' &&
				(row.drive_folder_id ?? row.storage_file_id)
					? `https://drive.google.com/drive/folders/${row.drive_folder_id ?? row.storage_file_id}`
					: null,
			created_at: row.created_at,
			completed_at: row.completed_at,
		};
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
		return {
			task_id: taskId,
			status: 'pending',
			message: `Restore initiated for ${backup.name}`,
			options: {
				database: options?.database ?? true,
				files: options?.files ?? true,
			},
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
		const storageBackends =
			payload?.storage_backends && payload.storage_backends.length > 0
				? payload.storage_backends
				: [backup.storage_type];

		return {
			status: 'accepted',
			task_id: taskId,
			backup_id: backupId,
			project_id: backup.project_id,
			environment_id: payload?.environment_id ?? null,
			backup_type: payload?.backup_type ?? backup.backup_type,
			storage_backends: storageBackends,
			override_gdrive_folder_id: payload?.override_gdrive_folder_id ?? null,
			message: `Backup execution queued for ${backup.name}`,
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
					${payload.backup_type ?? 'full'},
					${payload.storage_type ?? 'local'},
					${`/backups/${project.id}/${randomUUID()}.tar.gz`},
					${'pending'},
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
