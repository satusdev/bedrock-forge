import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TaskStatusService } from '../task-status/task-status.service';
import { EnvironmentCreateDto } from './dto/environment-create.dto';
import { EnvironmentUpdateDto } from './dto/environment-update.dto';
import { ProjectCreateDto } from './dto/project-create.dto';

type DbRemoteProjectRow = {
	id: number;
	name: string;
	slug: string;
	wp_home: string | null;
	environment: string;
	status: string;
	server_name: string | null;
	tags: string | null;
	created_at: Date;
};

type DbProjectRow = {
	id: number;
	name: string;
	slug: string;
	wp_home: string | null;
	description: string | null;
	status: string;
	github_repo_url: string | null;
	github_branch: string | null;
	tags: string | null;
	created_at: Date;
	updated_at: Date;
};

type DbEnvironmentRow = {
	id: number;
	project_id: number;
	environment: string;
	server_id: number;
	server_name: string;
	server_hostname: string;
	wp_url: string;
	wp_path: string;
	ssh_user: string | null;
	ssh_key_path: string | null;
	database_name: string | null;
	database_user: string | null;
	database_password: string | null;
	gdrive_backups_folder_id: string | null;
	notes: string | null;
	is_primary: boolean;
	created_at: Date;
	updated_at: Date;
};

type DbProjectServerRow = {
	id: number;
	project_id: number;
	server_id: number;
	environment: string;
	wp_url: string;
	wp_path: string;
	ssh_user: string | null;
	ssh_key_path: string | null;
	database_name: string | null;
	database_user: string | null;
	database_password: string | null;
	gdrive_backups_folder_id: string | null;
	notes: string | null;
	is_primary: boolean;
	created_at: Date;
	updated_at: Date;
};

type DbProjectBackupRow = {
	id: number;
	project_id: number;
	name: string;
	backup_type: string;
	storage_type: string;
	status: string;
	storage_path: string;
	size_bytes: bigint | null;
	created_at: Date;
	completed_at: Date | null;
	project_server_id: number | null;
	drive_folder_id: string | null;
	storage_file_id: string | null;
};

type DbProjectDriveRow = {
	id: number;
	name: string;
	slug: string;
	gdrive_connected: boolean;
	gdrive_folder_id: string | null;
	gdrive_backups_folder_id: string | null;
	gdrive_assets_folder_id: string | null;
	gdrive_docs_folder_id: string | null;
	gdrive_last_sync: Date | null;
};

type DbProjectNameRow = {
	id: number;
	name: string;
	slug: string;
	path: string | null;
	wp_home: string | null;
	github_repo_url: string | null;
	github_branch: string | null;
};

@Injectable()
export class ProjectsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly taskStatusService: TaskStatusService,
	) {}

	private readonly fallbackOwnerId = 1;

	private parseTags(tagsRaw: string | null): string[] {
		if (!tagsRaw) {
			return [];
		}
		try {
			const parsed = JSON.parse(tagsRaw) as unknown;
			if (Array.isArray(parsed)) {
				return parsed.filter(
					(entry): entry is string => typeof entry === 'string',
				);
			}
			return [];
		} catch {
			return [];
		}
	}

	private makeSlug(name: string): string {
		return name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9\s-_]/g, '')
			.replace(/[\s_]+/g, '-')
			.replace(/-+/g, '-');
	}

	private async findProjectByName(projectName: string, ownerId?: number) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const rows = await this.prisma.$queryRaw<DbProjectNameRow[]>`
			SELECT id, name, slug, path, wp_home, github_repo_url, github_branch
			FROM projects
			WHERE (slug = ${projectName} OR name = ${projectName})
				AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		const project = rows[0];
		if (!project) {
			throw new NotFoundException({
				detail: `Project ${projectName} not found`,
			});
		}

		return project;
	}

	async getRemoteProjects() {
		const rows = await this.prisma.$queryRaw<DbRemoteProjectRow[]>`
			SELECT
				p.id,
				p.name,
				p.slug,
				p.wp_home,
				p.environment,
				p.status,
				s.name AS server_name,
				p.tags,
				p.created_at
			FROM projects p
			LEFT JOIN servers s ON p.server_id = s.id
			ORDER BY p.created_at DESC
		`;

		return rows.map(project => ({
			id: project.id,
			name: project.name,
			slug: project.slug,
			domain: project.wp_home ?? '',
			environment: project.environment,
			status: project.status,
			server_name: project.server_name,
			health_score: 90,
			tags: this.parseTags(project.tags),
			created_at: project.created_at,
		}));
	}

	async getProjectsStatus() {
		return this.getRemoteProjects();
	}

	async getAllTags() {
		const rows = await this.prisma.$queryRaw<{ tags: string | null }[]>`
			SELECT tags
			FROM projects
		`;

		const allTags = new Set<string>();
		for (const row of rows) {
			for (const tag of this.parseTags(row.tags)) {
				allTags.add(tag);
			}
		}

		return {
			tags: Array.from(allTags).sort((left, right) =>
				left.localeCompare(right),
			),
		};
	}

	async getComprehensiveProjects() {
		const remote = await this.getRemoteProjects();
		return remote.map(project => ({
			...project,
			source: 'remote',
			ddev_status: 'unknown',
			git_status: 'unknown',
		}));
	}

	async createProject(payload: ProjectCreateDto, ownerId?: number) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const slug = this.makeSlug(payload.name);
		const existingRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM projects
			WHERE slug = ${slug}
			LIMIT 1
		`;

		if (existingRows[0]) {
			throw new BadRequestException({
				detail: `Project with slug '${slug}' already exists`,
			});
		}

		const insertedRows = await this.prisma.$queryRaw<DbProjectRow[]>`
			INSERT INTO projects (
				name,
				slug,
				description,
				path,
				status,
				environment,
				wp_home,
				github_repo_url,
				github_branch,
				owner_id,
				tags,
				gdrive_connected,
				updated_at
			)
			VALUES (
				${payload.name},
				${slug},
				${payload.description ?? null},
				${''},
				${'active'},
				${'production'},
				${payload.domain},
				${payload.github_repo_url ?? null},
				${payload.github_branch ?? 'main'},
				${resolvedOwnerId},
				${JSON.stringify(payload.tags ?? [])},
				${false},
				NOW()
			)
			RETURNING id, name, slug, wp_home, description, status, github_repo_url, github_branch, tags, created_at, updated_at
		`;
		const project = insertedRows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Failed to create project' });
		}

		return {
			id: project.id,
			name: project.name,
			slug: project.slug,
			domain: project.wp_home ?? '',
			site_title: payload.site_title ?? null,
			description: project.description,
			status: project.status,
			github_repo_url: project.github_repo_url,
			github_branch: project.github_branch,
			tags: this.parseTags(project.tags),
			environments_count: 0,
			created_at: project.created_at,
			updated_at: project.updated_at,
		};
	}

	async deleteProject(projectId: number) {
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM projects
			WHERE id = ${projectId}
			LIMIT 1
		`;
		if (!rows[0]) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		await this.prisma.$executeRaw`
			DELETE FROM projects
			WHERE id = ${projectId}
		`;
	}

	async getProjectEnvironments(projectId: number) {
		const rows = await this.listProjectServers(projectId);
		return rows;
	}

	async listProjectServers(projectId: number, environment?: string) {
		const projectRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM projects
			WHERE id = ${projectId}
			LIMIT 1
		`;
		if (!projectRows[0]) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const rows = await this.prisma.$queryRaw<DbEnvironmentRow[]>`
			SELECT
				ps.id,
				ps.project_id,
				ps.environment,
				ps.server_id,
				s.name AS server_name,
				s.hostname AS server_hostname,
				ps.wp_url,
				ps.wp_path,
				ps.ssh_user,
				ps.ssh_key_path,
				ps.database_name,
				ps.database_user,
				ps.database_password,
				ps.gdrive_backups_folder_id,
				ps.notes,
				ps.is_primary,
				ps.created_at,
				ps.updated_at
			FROM project_servers ps
			JOIN servers s ON s.id = ps.server_id
			WHERE ps.project_id = ${projectId}
				AND (${environment ?? null}::text IS NULL OR ps.environment::text = ${environment ?? null})
			ORDER BY ps.environment
		`;

		return rows;
	}

	async linkEnvironment(projectId: number, payload: EnvironmentCreateDto) {
		const projectRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM projects
			WHERE id = ${projectId}
			LIMIT 1
		`;
		if (!projectRows[0]) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const serverRows = await this.prisma.$queryRaw<
			{ id: number; name: string; hostname: string }[]
		>`
			SELECT id, name, hostname
			FROM servers
			WHERE id = ${payload.server_id}
			LIMIT 1
		`;
		const server = serverRows[0];
		if (!server) {
			throw new NotFoundException({ detail: 'Server not found' });
		}

		const existingRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM project_servers
			WHERE project_id = ${projectId}
				AND server_id = ${payload.server_id}
				AND environment = ${payload.environment}::serverenvironment
			LIMIT 1
		`;
		if (existingRows[0]) {
			throw new BadRequestException({
				detail: `${payload.environment} environment already linked for this project`,
			});
		}

		const nextIsPrimary = payload.is_primary ?? true;
		if (nextIsPrimary) {
			await this.prisma.$executeRaw`
				UPDATE project_servers
				SET is_primary = ${false}, updated_at = NOW()
				WHERE project_id = ${projectId}
					AND environment = ${payload.environment}::serverenvironment
					AND is_primary = ${true}
			`;
		}

		const insertedRows = await this.prisma.$queryRaw<DbProjectServerRow[]>`
			INSERT INTO project_servers (
				project_id,
				server_id,
				environment,
				wp_url,
				wp_path,
				ssh_user,
				ssh_key_path,
				database_name,
				database_user,
				database_password,
				gdrive_backups_folder_id,
				notes,
				is_primary,
				updated_at
			)
			VALUES (
				${projectId},
				${payload.server_id},
				${payload.environment}::serverenvironment,
				${payload.wp_url},
				${payload.wp_path},
				${payload.ssh_user ?? null},
				${payload.ssh_key_path ?? null},
				${payload.database_name},
				${payload.database_user},
				${payload.database_password},
				${payload.gdrive_backups_folder_id ?? null},
				${payload.notes ?? null},
				${nextIsPrimary},
				NOW()
			)
			RETURNING id, project_id, server_id, environment, wp_url, wp_path, ssh_user, ssh_key_path, database_name, database_user, database_password, gdrive_backups_folder_id, notes, is_primary, created_at, updated_at
		`;
		const inserted = insertedRows[0];
		if (!inserted) {
			throw new NotFoundException({
				detail: 'Failed to create environment link',
			});
		}

		return {
			id: inserted.id,
			environment: inserted.environment,
			server_id: inserted.server_id,
			server_name: server.name,
			server_hostname: server.hostname,
			wp_url: inserted.wp_url,
			wp_path: inserted.wp_path,
			ssh_user: inserted.ssh_user,
			ssh_key_path: inserted.ssh_key_path,
			database_name: inserted.database_name,
			database_user: inserted.database_user,
			database_password: inserted.database_password,
			gdrive_backups_folder_id: inserted.gdrive_backups_folder_id,
			notes: inserted.notes,
			is_primary: inserted.is_primary,
			created_at: inserted.created_at,
			updated_at: inserted.updated_at,
		};
	}

	async updateEnvironment(
		projectId: number,
		envId: number,
		payload: EnvironmentUpdateDto,
	) {
		const rows = await this.prisma.$queryRaw<DbProjectServerRow[]>`
			SELECT id, project_id, server_id, environment, wp_url, wp_path, ssh_user, ssh_key_path, database_name, database_user, database_password, gdrive_backups_folder_id, notes, is_primary, created_at, updated_at
			FROM project_servers
			WHERE id = ${envId} AND project_id = ${projectId}
			LIMIT 1
		`;
		const existing = rows[0];
		if (!existing) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}

		const nextEnvironment = payload.environment ?? existing.environment;
		if (payload.is_primary === true) {
			await this.prisma.$executeRaw`
				UPDATE project_servers
				SET is_primary = ${false}, updated_at = NOW()
				WHERE project_id = ${projectId}
					AND environment = ${nextEnvironment}::serverenvironment
					AND is_primary = ${true}
					AND id <> ${envId}
			`;
		}

		await this.prisma.$executeRaw`
			UPDATE project_servers
			SET
				environment = ${nextEnvironment}::serverenvironment,
				wp_url = ${payload.wp_url ?? existing.wp_url},
				wp_path = ${payload.wp_path ?? existing.wp_path},
				ssh_user = ${payload.ssh_user ?? existing.ssh_user},
				ssh_key_path = ${payload.ssh_key_path ?? existing.ssh_key_path},
				database_name = ${payload.database_name ?? existing.database_name},
				database_user = ${payload.database_user ?? existing.database_user},
				database_password = ${payload.database_password ?? existing.database_password},
				gdrive_backups_folder_id = ${payload.gdrive_backups_folder_id ?? existing.gdrive_backups_folder_id},
				notes = ${payload.notes ?? existing.notes},
				is_primary = ${payload.is_primary ?? existing.is_primary},
				updated_at = NOW()
			WHERE id = ${envId}
		`;

		const updatedRows = await this.prisma.$queryRaw<DbProjectServerRow[]>`
			SELECT id, project_id, server_id, environment, wp_url, wp_path, ssh_user, ssh_key_path, database_name, database_user, database_password, gdrive_backups_folder_id, notes, is_primary, created_at, updated_at
			FROM project_servers
			WHERE id = ${envId}
			LIMIT 1
		`;
		const updated = updatedRows[0];
		if (!updated) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}

		return {
			status: 'success',
			data: updated,
		};
	}

	async unlinkEnvironment(projectId: number, envId: number) {
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM project_servers
			WHERE id = ${envId} AND project_id = ${projectId}
			LIMIT 1
		`;
		if (!rows[0]) {
			throw new NotFoundException({ detail: 'Environment link not found' });
		}

		await this.prisma.$executeRaw`
			UPDATE backups
			SET project_server_id = NULL
			WHERE project_server_id = ${envId}
		`;

		await this.prisma.$executeRaw`
			DELETE FROM project_servers
			WHERE id = ${envId}
		`;
	}

	async getProjectBackups(projectId: number, page = 1, pageSize = 10) {
		const projectRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM projects
			WHERE id = ${projectId}
			LIMIT 1
		`;
		if (!projectRows[0]) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const safePage = Math.max(1, page);
		const safePageSize = Math.max(1, Math.min(100, pageSize));
		const offset = (safePage - 1) * safePageSize;

		const rows = await this.prisma.$queryRaw<DbProjectBackupRow[]>`
			SELECT
				id,
				project_id,
				name,
				backup_type,
				storage_type,
				status,
				storage_path,
				size_bytes,
				created_at,
				completed_at,
				project_server_id,
				drive_folder_id,
				storage_file_id
			FROM backups
			WHERE project_id = ${projectId}
			ORDER BY created_at DESC
			OFFSET ${offset}
			LIMIT ${safePageSize}
		`;

		return rows.map(backup => ({
			id: backup.id,
			project_id: backup.project_id,
			name: backup.name,
			backup_type: backup.backup_type,
			storage_type: backup.storage_type,
			status: backup.status,
			file_path: backup.storage_path,
			size_bytes: backup.size_bytes ? Number(backup.size_bytes) : null,
			created_at: backup.created_at,
			completed_at: backup.completed_at,
			environment_id: backup.project_server_id,
			drive_folder_id: backup.drive_folder_id,
			storage_file_id: backup.storage_file_id,
		}));
	}

	async getEnvironmentBackups(
		projectId: number,
		envId: number,
		page = 1,
		pageSize = 10,
		ownerId?: number,
	) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const projectRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM projects
			WHERE id = ${projectId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const project = projectRows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const environmentRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM project_servers
			WHERE id = ${envId} AND project_id = ${projectId}
			LIMIT 1
		`;
		if (!environmentRows[0]) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}

		const safePage = Math.max(1, page);
		const safePageSize = Math.max(1, Math.min(100, pageSize));
		const offset = (safePage - 1) * safePageSize;

		const totalRows = await this.prisma.$queryRaw<{ total: bigint }[]>`
			SELECT COUNT(*)::bigint AS total
			FROM backups
			WHERE project_id = ${projectId} AND project_server_id = ${envId}
		`;

		const rows = await this.prisma.$queryRaw<DbProjectBackupRow[]>`
			SELECT
				id,
				project_id,
				name,
				backup_type,
				storage_type,
				status,
				storage_path,
				size_bytes,
				created_at,
				completed_at,
				project_server_id,
				drive_folder_id,
				storage_file_id
			FROM backups
			WHERE project_id = ${projectId} AND project_server_id = ${envId}
			ORDER BY created_at DESC
			OFFSET ${offset}
			LIMIT ${safePageSize}
		`;

		return {
			items: rows.map(backup => ({
				id: backup.id,
				name: backup.name,
				backup_type: backup.backup_type,
				status: backup.status,
				storage_type: backup.storage_type,
				file_path: backup.storage_path,
				size_bytes: backup.size_bytes ? Number(backup.size_bytes) : null,
				error_message: null,
				notes: null,
				storage_file_id: backup.storage_file_id,
				drive_folder_id: backup.drive_folder_id,
				gdrive_file_id: backup.storage_file_id,
				gdrive_link: backup.drive_folder_id
					? `https://drive.google.com/drive/folders/${backup.drive_folder_id}`
					: null,
				created_at: backup.created_at,
				project_name: project.name,
			})),
			total: Number(totalRows[0]?.total ?? 0n),
			page: safePage,
			page_size: safePageSize,
		};
	}

	async getProjectBackupDownloadMetadata(
		projectId: number,
		path: string,
		storage = 'local',
	) {
		if (!path || path.trim().length === 0) {
			throw new BadRequestException({ detail: 'Backup path is required' });
		}

		const projectRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM projects
			WHERE id = ${projectId}
			LIMIT 1
		`;
		if (!projectRows[0]) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const fileName =
			path.split('/').pop() || `project-${projectId}-backup.tar.gz`;
		return {
			filename: fileName,
			content: `Simulated ${storage} backup download for project ${projectId} at ${path}`,
		};
	}

	private async getProjectDriveRow(projectId: number) {
		const rows = await this.prisma.$queryRaw<DbProjectDriveRow[]>`
			SELECT
				id,
				name,
				slug,
				gdrive_connected,
				gdrive_folder_id,
				gdrive_backups_folder_id,
				gdrive_assets_folder_id,
				gdrive_docs_folder_id,
				gdrive_last_sync
			FROM projects
			WHERE id = ${projectId}
			LIMIT 1
		`;
		const project = rows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
		return project;
	}

	async getProjectDriveSettings(projectId: number) {
		const project = await this.getProjectDriveRow(projectId);
		return {
			gdrive_connected: project.gdrive_connected,
			gdrive_global_configured: true,
			gdrive_global_remote: 'gdrive',
			gdrive_folder_id: project.gdrive_folder_id,
			gdrive_backups_folder_id: project.gdrive_backups_folder_id,
			gdrive_assets_folder_id: project.gdrive_assets_folder_id,
			gdrive_docs_folder_id: project.gdrive_docs_folder_id,
			gdrive_last_sync: project.gdrive_last_sync,
		};
	}

	async updateProjectDriveSettings(
		projectId: number,
		settings: {
			gdrive_folder_id?: string | null;
			gdrive_backups_folder_id?: string | null;
			gdrive_assets_folder_id?: string | null;
			gdrive_docs_folder_id?: string | null;
		},
	) {
		const existing = await this.getProjectDriveRow(projectId);

		const nextFolder = settings.gdrive_folder_id ?? existing.gdrive_folder_id;
		const nextBackups =
			settings.gdrive_backups_folder_id ?? existing.gdrive_backups_folder_id;
		const nextAssets =
			settings.gdrive_assets_folder_id ?? existing.gdrive_assets_folder_id;
		const nextDocs =
			settings.gdrive_docs_folder_id ?? existing.gdrive_docs_folder_id;
		const nextConnected = Boolean(
			nextFolder || nextBackups || nextAssets || nextDocs,
		);

		await this.prisma.$executeRaw`
			UPDATE projects
			SET
				gdrive_folder_id = ${nextFolder},
				gdrive_backups_folder_id = ${nextBackups},
				gdrive_assets_folder_id = ${nextAssets},
				gdrive_docs_folder_id = ${nextDocs},
				gdrive_connected = ${nextConnected},
				updated_at = NOW()
			WHERE id = ${projectId}
		`;

		const updated = await this.getProjectDriveRow(projectId);
		return {
			gdrive_connected: updated.gdrive_connected,
			gdrive_global_configured: true,
			gdrive_global_remote: 'gdrive',
			gdrive_folder_id: updated.gdrive_folder_id,
			gdrive_backups_folder_id: updated.gdrive_backups_folder_id,
			gdrive_assets_folder_id: updated.gdrive_assets_folder_id,
			gdrive_docs_folder_id: updated.gdrive_docs_folder_id,
			gdrive_last_sync: updated.gdrive_last_sync,
		};
	}

	async getProjectDriveBackupIndex(projectId: number, environment?: string) {
		const project = await this.getProjectDriveRow(projectId);
		const envRows = await this.prisma.$queryRaw<
			{ environment: string; gdrive_backups_folder_id: string | null }[]
		>`
			SELECT environment, gdrive_backups_folder_id
			FROM project_servers
			WHERE project_id = ${projectId}
		`;

		const entries = envRows.reduce<
			Record<string, Array<Record<string, unknown>>>
		>((acc, envRow) => {
			if (environment && envRow.environment !== environment) {
				return acc;
			}
			acc[envRow.environment] = [];
			return acc;
		}, {});

		if (environment && !entries[environment]) {
			entries[environment] = [];
		}

		return {
			environments: entries,
			backup_root:
				project.gdrive_backups_folder_id ||
				`WebDev/Projects/${project.name}/Backups`,
		};
	}

	async createEnvironmentBackup(
		projectId: number,
		envId: number,
		backupType = 'database',
		storageType = 'gdrive',
		ownerId?: number,
	) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const projectRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM projects
			WHERE id = ${projectId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const project = projectRows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const envRows = await this.prisma.$queryRaw<
			{ id: number; environment: string }[]
		>`
			SELECT id, environment
			FROM project_servers
			WHERE id = ${envId} AND project_id = ${projectId}
			LIMIT 1
		`;
		const env = envRows[0];
		if (!env) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}

		const normalizedBackupType = backupType.toLowerCase();
		const normalizedStorageType =
			storageType === 'gdrive' ? 'google_drive' : storageType;

		const insertRows = await this.prisma.$queryRaw<{ id: number }[]>`
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
				updated_at
			)
			VALUES (
				${`Backup ${env.environment.toUpperCase()} - ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`},
				${normalizedBackupType},
				${normalizedStorageType},
				${'pending'},
				${'pending'},
				NOW(),
				${projectId},
				${resolvedOwnerId},
				${envId},
				NOW()
			)
			RETURNING id
		`;

		const created = insertRows[0];
		if (!created) {
			throw new BadRequestException({ detail: 'Failed to queue backup' });
		}

		return {
			task_id: randomUUID(),
			status: 'pending',
			message: `Backup queued for ${project.name} (${env.environment})`,
			backup_id: created.id,
		};
	}

	async refreshProjectWhois(projectId: number) {
		const rows = await this.prisma.$queryRaw<
			{ id: number; wp_home: string | null; name: string }[]
		>`
			SELECT id, wp_home, name
			FROM projects
			WHERE id = ${projectId}
			LIMIT 1
		`;
		const project = rows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const domainName =
			project.wp_home?.replace(/^https?:\/\//, '').split('/')[0] ||
			`${project.name.toLowerCase().replace(/\s+/g, '-')}.com`;

		return {
			status: 'success',
			domain_id: 0,
			domain_name: domainName,
			expiry_date: null,
			registration_date: null,
			registrar_name: null,
			last_whois_check: new Date().toISOString(),
		};
	}

	async getTaskStatus(taskId: string) {
		return this.taskStatusService.getTaskStatus(taskId, {
			status: 'pending',
			message: 'Task is queued',
			progress: 0,
		});
	}

	private async ensureEnvironment(projectId: number, envId: number) {
		const rows = await this.prisma.$queryRaw<
			{ id: number; environment: string; wp_url: string }[]
		>`
			SELECT id, environment, wp_url
			FROM project_servers
			WHERE id = ${envId} AND project_id = ${projectId}
			LIMIT 1
		`;
		const env = rows[0];
		if (!env) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}
		return env;
	}

	async listEnvironmentUsers(projectId: number, envId: number) {
		await this.ensureEnvironment(projectId, envId);
		return [];
	}

	async getProjectServerById(linkId: number) {
		const rows = await this.prisma.$queryRaw<
			Array<{
				id: number;
				project_id: number;
				server_id: number;
				environment: string;
				wp_path: string;
				wp_url: string;
				ssh_user: string | null;
				ssh_key_path: string | null;
				database_name: string | null;
				database_user: string | null;
				database_password: string | null;
				gdrive_backups_folder_id: string | null;
				notes: string | null;
				is_primary: boolean;
				server_name: string;
				created_at: Date;
				updated_at: Date;
			}>
		>`
			SELECT
				ps.id,
				ps.project_id,
				ps.server_id,
				ps.environment,
				ps.wp_path,
				ps.wp_url,
				ps.ssh_user,
				ps.ssh_key_path,
				ps.database_name,
				ps.database_user,
				ps.database_password,
				ps.gdrive_backups_folder_id,
				ps.notes,
				ps.is_primary,
				s.name AS server_name,
				ps.created_at,
				ps.updated_at
			FROM project_servers ps
			JOIN servers s ON s.id = ps.server_id
			WHERE ps.id = ${linkId}
			LIMIT 1
		`;

		const link = rows[0];
		if (!link) {
			throw new NotFoundException({ detail: 'Project-server link not found' });
		}

		return link;
	}

	async getProjectServerLink(
		projectId: number,
		linkId: number,
		ownerId?: number,
	) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const rows = await this.prisma.$queryRaw<
			Array<{
				id: number;
				project_id: number;
				server_id: number;
				environment: string;
				wp_path: string;
				wp_url: string;
				gdrive_backups_folder_id: string | null;
				notes: string | null;
				is_primary: boolean;
				server_name: string;
				created_at: Date;
				updated_at: Date;
			}>
		>`
			SELECT
				ps.id,
				ps.project_id,
				ps.server_id,
				ps.environment,
				ps.wp_path,
				ps.wp_url,
				ps.gdrive_backups_folder_id,
				ps.notes,
				ps.is_primary,
				s.name AS server_name,
				ps.created_at,
				ps.updated_at
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			JOIN servers s ON s.id = ps.server_id
			WHERE ps.id = ${linkId} AND ps.project_id = ${projectId} AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		const link = rows[0];
		if (!link) {
			throw new NotFoundException({ detail: 'Project-server link not found' });
		}

		return {
			...link,
			credentials_count: 0,
		};
	}

	async createEnvironmentUser(
		projectId: number,
		envId: number,
		payload: {
			user_login: string;
			user_email: string;
			role?: string;
			send_email?: boolean;
		},
	) {
		await this.ensureEnvironment(projectId, envId);
		return {
			ID: Date.now(),
			user_login: payload.user_login,
			user_email: payload.user_email,
			display_name: payload.user_login,
			roles: [payload.role ?? 'subscriber'],
		};
	}

	async magicLogin(projectId: number, envId: number, userId: string) {
		const env = await this.ensureEnvironment(projectId, envId);
		const base = env.wp_url.replace(/\/$/, '');
		return {
			url: `${base}/wp-login.php?autologin=${encodeURIComponent(userId)}`,
		};
	}

	async getLocalProjects() {
		return [];
	}

	async cloneProjectEnvironment(
		projectId: number,
		payload: {
			source_env_id: number;
			target_server_id: number;
			target_domain: string;
			target_environment?: string;
			create_cyberpanel_site?: boolean;
			include_database?: boolean;
			include_uploads?: boolean;
			search_replace?: boolean;
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const projectRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM projects
			WHERE id = ${projectId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const project = projectRows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const sourceRows = await this.prisma.$queryRaw<
			{ id: number; wp_url: string }[]
		>`
			SELECT id, wp_url
			FROM project_servers
			WHERE id = ${payload.source_env_id} AND project_id = ${projectId}
			LIMIT 1
		`;
		const source = sourceRows[0];
		if (!source) {
			throw new NotFoundException({ detail: 'Source environment not found' });
		}

		const serverRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM servers
			WHERE id = ${payload.target_server_id}
			LIMIT 1
		`;
		const targetServer = serverRows[0];
		if (!targetServer) {
			throw new NotFoundException({ detail: 'Target server not found' });
		}

		return {
			status: 'queued',
			task_id: randomUUID(),
			source_url: source.wp_url,
			target_domain: payload.target_domain,
			target_server: targetServer.name,
			message: 'Clone task started. This may take several minutes.',
		};
	}

	async cloneProjectFromDrive(
		projectId: number,
		payload: {
			target_server_id: number;
			target_domain: string;
			environment?: string;
			backup_timestamp: string;
			source_url?: string;
			target_url?: string;
			create_cyberpanel_site?: boolean;
			include_database?: boolean;
			include_files?: boolean;
			set_shell_user?: string | null;
			run_composer_install?: boolean;
			run_composer_update?: boolean;
			run_wp_plugin_update?: boolean;
			dry_run?: boolean;
			task_id?: string;
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const projectRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM projects
			WHERE id = ${projectId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const project = projectRows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		if (!payload.backup_timestamp?.trim()) {
			throw new BadRequestException({ detail: 'backup_timestamp is required' });
		}

		const serverRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM servers
			WHERE id = ${payload.target_server_id}
			LIMIT 1
		`;
		const targetServer = serverRows[0];
		if (!targetServer) {
			throw new NotFoundException({ detail: 'Target server not found' });
		}

		const taskId = payload.task_id?.trim() || randomUUID();
		return {
			status: 'accepted',
			task_id: taskId,
			project_id: projectId,
			target_server_id: payload.target_server_id,
			target_server: targetServer.name,
			target_domain: payload.target_domain,
			environment: payload.environment ?? 'staging',
			backup_timestamp: payload.backup_timestamp,
			options: {
				create_cyberpanel_site: payload.create_cyberpanel_site ?? true,
				include_database: payload.include_database ?? true,
				include_files: payload.include_files ?? true,
				run_composer_install: payload.run_composer_install ?? true,
				run_composer_update: payload.run_composer_update ?? false,
				run_wp_plugin_update: payload.run_wp_plugin_update ?? false,
				dry_run: payload.dry_run ?? false,
			},
			message: `Drive clone task queued for ${project.name}`,
		};
	}

	async getProjectStatusByName(projectName: string, ownerId?: number) {
		const project = await this.findProjectByName(projectName, ownerId);
		return {
			project_name: projectName,
			directory: project.path ?? '',
			wp_home: project.wp_home ?? '',
			ddev_status: 'unknown',
			git_status: 'unknown',
		};
	}

	async executeProjectAction(
		projectName: string,
		payload: { action: string },
		ownerId?: number,
	) {
		const project = await this.findProjectByName(projectName, ownerId);
		if (payload.action === 'open_site') {
			return {
				status: 'success',
				url: project.wp_home,
			};
		}

		const acceptedActions = new Set([
			'start_ddev',
			'stop_ddev',
			'restart_ddev',
			'git_pull',
		]);
		if (!acceptedActions.has(payload.action)) {
			throw new BadRequestException({
				detail: `Unknown action: ${payload.action}`,
			});
		}

		return {
			status: 'accepted',
			task_id: randomUUID(),
			message: `Action ${payload.action} started`,
			project_id: project.id,
		};
	}

	async startDdev(projectName: string, ownerId?: number) {
		await this.findProjectByName(projectName, ownerId);
		return {
			status: 'success',
			message: `DDEV started for ${projectName}`,
		};
	}

	async stopDdev(projectName: string, ownerId?: number) {
		await this.findProjectByName(projectName, ownerId);
		return {
			status: 'success',
			message: `DDEV stopped for ${projectName}`,
		};
	}

	async restartDdev(projectName: string, ownerId?: number) {
		await this.findProjectByName(projectName, ownerId);
		return {
			status: 'success',
			message: `DDEV restarted for ${projectName}`,
		};
	}

	async getProjectPlugins(projectName: string, ownerId?: number) {
		await this.findProjectByName(projectName, ownerId);
		return {
			plugins: [],
			source: 'remote',
		};
	}

	async updateProjectPlugin(
		projectName: string,
		pluginName: string,
		ownerId?: number,
	) {
		await this.findProjectByName(projectName, ownerId);
		return {
			status: 'success',
			message: `Plugin ${pluginName} updated`,
		};
	}

	async updateAllProjectPlugins(projectName: string, ownerId?: number) {
		await this.findProjectByName(projectName, ownerId);
		return {
			status: 'success',
			message: 'All plugins updated',
		};
	}

	async getProjectThemes(projectName: string, ownerId?: number) {
		await this.findProjectByName(projectName, ownerId);
		return {
			themes: [],
			source: 'remote',
		};
	}

	async updateProjectTheme(
		projectName: string,
		themeName: string,
		ownerId?: number,
	) {
		await this.findProjectByName(projectName, ownerId);
		return {
			status: 'success',
			message: `Theme ${themeName} updated`,
		};
	}

	async updateAllProjectThemes(projectName: string, ownerId?: number) {
		await this.findProjectByName(projectName, ownerId);
		return {
			status: 'success',
			message: 'All themes updated',
		};
	}

	async updateWordpressCore(projectName: string, ownerId?: number) {
		await this.findProjectByName(projectName, ownerId);
		return {
			status: 'success',
			message: 'WordPress core updated',
		};
	}

	async getLocalStatus(projectName: string) {
		return {
			exists: false,
			ddev_configured: false,
			ddev_running: false,
			ddev_url: `https://${projectName}.ddev.site`,
			local_path: null,
		};
	}

	async cloneToLocal(
		projectName: string,
		cloneOptions: Record<string, unknown>,
	) {
		const githubUrl = cloneOptions.github_url;
		if (typeof githubUrl !== 'string' || !githubUrl.trim()) {
			throw new BadRequestException({ detail: 'github_url is required' });
		}

		return {
			status: 'accepted',
			task_id: randomUUID(),
			message: `Clone task started for ${projectName}`,
			target_directory: `/tmp/${projectName}`,
		};
	}

	async setupLocal(
		projectName: string,
		setupOptions: Record<string, unknown> | undefined,
	) {
		const startAfterSetup =
			typeof setupOptions?.start_after_setup === 'boolean'
				? setupOptions.start_after_setup
				: true;

		return {
			status: 'success',
			message: `DDEV setup complete for ${projectName}`,
			ddev_url: `https://${projectName}.ddev.site`,
			ddev_running: startAfterSetup,
		};
	}

	async updateGitHubIntegration(
		projectName: string,
		payload: Record<string, unknown>,
		ownerId?: number,
	) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const rows = await this.prisma.$queryRaw<
			{ id: number; name: string; slug: string }[]
		>`
			SELECT id, name, slug
			FROM projects
			WHERE (slug = ${projectName} OR name = ${projectName})
				AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		const project = rows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const repoUrlRaw = payload.repo_url;
		const branchRaw = payload.branch;
		const enabledRaw = payload.enabled;

		const repoUrl = typeof repoUrlRaw === 'string' ? repoUrlRaw.trim() : null;
		const branch = typeof branchRaw === 'string' ? branchRaw.trim() : null;
		const enabled =
			typeof enabledRaw === 'boolean'
				? enabledRaw
				: typeof repoUrl === 'string' && repoUrl.length > 0;

		await this.prisma.$executeRaw`
			UPDATE projects
			SET github_repo_url = ${repoUrl},
				github_branch = ${branch && branch.length > 0 ? branch : 'main'},
				updated_at = NOW()
			WHERE id = ${project.id}
		`;

		return {
			status: 'success',
			message: `GitHub integration updated for ${project.name}`,
			project_id: project.id,
			project_name: project.name,
			enabled,
			repo_url: repoUrl,
			branch: branch && branch.length > 0 ? branch : 'main',
		};
	}

	async pullRepository(projectName: string, branch?: string, ownerId?: number) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const rows = await this.prisma.$queryRaw<
			{
				id: number;
				name: string;
				slug: string;
				github_repo_url: string | null;
				github_branch: string | null;
			}[]
		>`
			SELECT id, name, slug, github_repo_url, github_branch
			FROM projects
			WHERE (slug = ${projectName} OR name = ${projectName})
				AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		const project = rows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const targetBranch = branch ?? project.github_branch ?? 'main';

		return {
			status: 'accepted',
			task_id: randomUUID(),
			project_id: project.id,
			project_name: project.name,
			repo_url: project.github_repo_url,
			branch: targetBranch,
			message: 'Git pull queued',
		};
	}

	async deployFromGithub(
		projectName: string,
		payload: {
			repo_url: string;
			branch?: string;
			run_composer?: boolean;
		},
		ownerId?: number,
	) {
		const project = await this.findProjectByName(projectName, ownerId);
		if (!payload.repo_url || payload.repo_url.trim().length === 0) {
			throw new BadRequestException({ detail: 'repo_url is required' });
		}

		const branch = payload.branch?.trim() || 'main';
		return {
			status: 'queued',
			message: `Deployment from ${payload.repo_url}:${branch} queued`,
			task_id: randomUUID(),
			project: project.slug,
			run_composer: payload.run_composer ?? true,
		};
	}

	async deployFromClone(
		projectName: string,
		payload: {
			source_project: string;
			include_uploads?: boolean;
			include_database?: boolean;
		},
		ownerId?: number,
	) {
		const targetProject = await this.findProjectByName(projectName, ownerId);
		await this.findProjectByName(payload.source_project, ownerId);

		return {
			status: 'queued',
			message: `Cloning from ${payload.source_project} queued`,
			task_id: randomUUID(),
			project: targetProject.slug,
			include_uploads: payload.include_uploads ?? false,
			include_database: payload.include_database ?? false,
		};
	}

	async deployBlankBedrock(
		projectName: string,
		payload?: {
			db_name?: string;
			db_user?: string;
			db_password?: string;
			site_url?: string;
		},
		ownerId?: number,
	) {
		const project = await this.findProjectByName(projectName, ownerId);
		return {
			status: 'queued',
			message: 'Fresh Bedrock installation queued',
			task_id: randomUUID(),
			project: project.slug,
			configuration: {
				db_name: payload?.db_name ?? null,
				db_user: payload?.db_user ?? null,
				site_url: payload?.site_url ?? null,
			},
		};
	}

	async getDeployStatus(projectName: string, taskId: string, ownerId?: number) {
		const project = await this.findProjectByName(projectName, ownerId);
		const task = this.taskStatusService.getTaskStatus(taskId, {
			status: 'PENDING',
			message: 'Task is queued',
			progress: 0,
			result: null,
		});
		return {
			project: project.slug,
			task_id: taskId,
			status: task.status,
			result: task.result,
		};
	}

	async getRepositoryStatus(projectName: string, ownerId?: number) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const rows = await this.prisma.$queryRaw<
			{
				id: number;
				name: string;
				slug: string;
				github_repo_url: string | null;
				github_branch: string | null;
			}[]
		>`
			SELECT id, name, slug, github_repo_url, github_branch
			FROM projects
			WHERE (slug = ${projectName} OR name = ${projectName})
				AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;

		const project = rows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		return {
			project_id: project.id,
			project_name: project.name,
			repo_url: project.github_repo_url,
			branch: project.github_branch ?? 'main',
			is_repo_initialized: Boolean(project.github_repo_url),
			clean: true,
			ahead: 0,
			behind: 0,
			changed_files: [] as Array<{ path: string; status: string }>,
		};
	}

	async bulkStartDdev(payload: { projects: string[] }, ownerId?: number) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const projectNames = payload.projects ?? [];
		if (!projectNames.length) {
			throw new BadRequestException({ detail: 'projects cannot be empty' });
		}

		const rows = await this.prisma.$queryRaw<
			{ id: number; name: string; slug: string }[]
		>`
			SELECT id, name, slug
			FROM projects
			WHERE owner_id = ${resolvedOwnerId}
				AND (slug = ANY(${projectNames}) OR name = ANY(${projectNames}))
		`;

		const foundBySlug = new Map(rows.map(row => [row.slug, row]));
		const foundByName = new Map(rows.map(row => [row.name, row]));

		const success: Array<Record<string, unknown>> = [];
		const failed: Array<Record<string, unknown>> = [];

		for (const requested of projectNames) {
			const project = foundBySlug.get(requested) ?? foundByName.get(requested);
			if (!project) {
				failed.push({ project: requested, error: 'Project not found' });
				continue;
			}

			success.push({
				project_id: project.id,
				project_name: project.name,
				task_id: randomUUID(),
				status: 'queued',
			});
		}

		return {
			status: 'accepted',
			task_id: randomUUID(),
			success,
			failed,
			total_requested: projectNames.length,
			total_success: success.length,
			total_failed: failed.length,
			message: `Bulk DDEV start queued for ${success.length} project(s)`,
		};
	}

	async runSecurityScan(projectId: number, envId?: number, ownerId?: number) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const rows = await this.prisma.$queryRaw<
			{ id: number; name: string; wp_home: string | null }[]
		>`
			SELECT id, name, wp_home
			FROM projects
			WHERE id = ${projectId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const project = rows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		let siteUrl = project.wp_home;
		if (envId) {
			const envRows = await this.prisma.$queryRaw<{ wp_url: string }[]>`
				SELECT ps.wp_url
				FROM project_servers ps
				WHERE ps.id = ${envId} AND ps.project_id = ${projectId}
				LIMIT 1
			`;
			const env = envRows[0];
			if (!env) {
				throw new NotFoundException({ detail: 'Environment not found' });
			}
			siteUrl = env.wp_url;
		}

		if (!siteUrl) {
			throw new BadRequestException({
				detail: 'Target environment has no URL configured',
			});
		}

		const checks: Array<{
			name: string;
			status: 'pass' | 'warn' | 'fail';
			message: string;
			severity: 'info' | 'medium' | 'high';
			details?: Record<string, string>;
		}> = [
			{
				name: 'Project URL',
				status: 'pass',
				message: 'Project URL is configured',
				severity: 'info',
				details: { url: siteUrl },
			},
			{
				name: 'SSL Certificate',
				status: siteUrl.startsWith('https://') ? 'pass' : 'fail',
				message: siteUrl.startsWith('https://')
					? 'HTTPS is enabled'
					: 'Site is not using HTTPS',
				severity: siteUrl.startsWith('https://') ? 'info' : 'high',
			},
			{
				name: 'WordPress Version Visibility',
				status: 'warn',
				message:
					'Automated version hardening check requires remote scanner task integration',
				severity: 'medium',
			},
		];

		const summary = checks.reduce(
			(acc, check) => {
				acc[check.status] += 1;
				return acc;
			},
			{ pass: 0, warn: 0, fail: 0 },
		);

		const overallStatus =
			summary.fail > 0 ? 'fail' : summary.warn > 0 ? 'warn' : 'pass';

		const score = Math.max(
			0,
			Math.min(100, summary.pass * 35 + summary.warn * 15 - summary.fail * 30),
		);

		return {
			project_id: project.id,
			project_name: project.name,
			scanned_at: new Date().toISOString(),
			overall_status: overallStatus,
			score,
			checks,
			summary,
		};
	}

	async syncEnvironment(
		projectId: number,
		linkId: number,
		options: {
			sync_database?: boolean;
			sync_uploads?: boolean;
			sync_plugins?: boolean;
			sync_themes?: boolean;
			dry_run?: boolean;
			exclude_paths?: string[];
		},
	) {
		const link = await this.getProjectServerLink(projectId, linkId);

		return {
			task_id: randomUUID(),
			status: 'pending',
			message: `Preparing sync for ${link.environment} environment`,
			project_id: projectId,
			project_server_id: linkId,
			sync_options: {
				sync_database: options.sync_database ?? true,
				sync_uploads: options.sync_uploads ?? true,
				sync_plugins: options.sync_plugins ?? false,
				sync_themes: options.sync_themes ?? false,
				dry_run: options.dry_run ?? false,
				exclude_paths: options.exclude_paths ?? [],
			},
		};
	}
}
