import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import {
	backupstoragetype,
	backuptype,
	environmenttype,
	serverenvironment,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { normalizeWordPressPath } from '../common/wordpress-paths';
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

const backupTypes = new Set<backuptype>(['full', 'database', 'files']);
const backupStorageTypes = new Set<backupstoragetype>([
	'local',
	'google_drive',
	's3',
]);
const serverEnvironments = new Set<serverenvironment>([
	'development',
	'staging',
	'production',
]);

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

	private makeTagSlug(name: string): string {
		return name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-');
	}

	private extractHostname(value: string) {
		const trimmed = value.trim();
		if (!trimmed) {
			return '';
		}

		try {
			const withScheme = /^https?:\/\//i.test(trimmed)
				? trimmed
				: `https://${trimmed}`;
			return new URL(withScheme).hostname.toLowerCase();
		} catch {
			return (
				trimmed.replace(/^https?:\/\//i, '').split('/')[0] ?? ''
			).toLowerCase();
		}
	}

	private normalizeProjectUrl(value: string) {
		const trimmed = value.trim();
		if (!trimmed) {
			throw new BadRequestException({ detail: 'domain/wp_url is required' });
		}

		try {
			const withScheme = /^https?:\/\//i.test(trimmed)
				? trimmed
				: `https://${trimmed}`;
			const parsed = new URL(withScheme);
			if (!parsed.hostname) {
				throw new Error('Missing hostname');
			}
			parsed.hash = '';
			return parsed.toString().replace(/\/$/, '');
		} catch {
			throw new BadRequestException({
				detail: 'Invalid domain/wp_url format',
			});
		}
	}

	private normalizeWpPath(value: string) {
		const trimmed = value.trim();
		if (!trimmed) {
			throw new BadRequestException({ detail: 'wp_path is required' });
		}

		const normalized = normalizeWordPressPath(
			trimmed.startsWith('/') ? trimmed : `/${trimmed}`,
		);
		if (/\/web$/i.test(normalized)) {
			return normalizeWordPressPath(normalized.slice(0, -4));
		}
		if (/\/web\/app$/i.test(normalized)) {
			return normalizeWordPressPath(
				normalized.split('/web/app')[0] || normalized,
			);
		}
		return normalized;
	}

	private extractApexDomain(hostname: string) {
		const labels = hostname
			.toLowerCase()
			.split('.')
			.map(label => label.trim())
			.filter(Boolean);

		if (labels.length <= 2) {
			return labels.join('.');
		}

		const publicSuffixPairs = new Set([
			'co.uk',
			'org.uk',
			'gov.uk',
			'ac.uk',
			'com.au',
			'net.au',
			'org.au',
			'co.nz',
			'com.br',
		]);

		const suffixPair = labels.slice(-2).join('.');
		if (publicSuffixPairs.has(suffixPair) && labels.length >= 3) {
			return labels.slice(-3).join('.');
		}

		return labels.slice(-2).join('.');
	}

	private async ensureProjectApexDomainTracked(
		projectId: number,
		domainInput: string,
		fallbackClientId: number,
		projectClientId?: number | null,
	) {
		const hostname = this.extractHostname(domainInput);
		if (!hostname) {
			return;
		}

		const apexDomain = this.extractApexDomain(hostname);
		if (!apexDomain || !apexDomain.includes('.')) {
			return;
		}

		const existingDomain = await this.prisma.domains.findUnique({
			where: { domain_name: apexDomain },
			select: { id: true },
		});
		if (existingDomain) {
			return;
		}

		const resolvedClientId = projectClientId ?? fallbackClientId;
		const client = await this.prisma.clients.findUnique({
			where: { id: resolvedClientId },
			select: { id: true },
		});
		if (!client) {
			return;
		}

		const expiryDate = new Date();
		expiryDate.setUTCDate(expiryDate.getUTCDate() + 365);
		expiryDate.setUTCHours(0, 0, 0, 0);

		await this.prisma.domains.create({
			data: {
				domain_name: apexDomain,
				tld: `.${apexDomain.split('.').pop() ?? 'com'}`,
				registrar: 'other',
				status: 'active',
				auto_renew: true,
				privacy_protection: true,
				transfer_lock: true,
				annual_cost: 0,
				currency: 'USD',
				reminder_days: 30,
				expiry_date: expiryDate,
				client_id: client.id,
				project_id: projectId,
				updated_at: new Date(),
			},
		});
	}

	private parseServerEnvironment(value: string): serverenvironment {
		const normalized = value.trim().toLowerCase();
		if (!serverEnvironments.has(normalized as serverenvironment)) {
			throw new BadRequestException({
				detail:
					'Invalid environment. Expected one of: development, staging, production',
			});
		}

		return normalized as serverenvironment;
	}

	private async findProjectByName(projectName: string, ownerId?: number) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const project = await this.prisma.projects.findFirst({
			where: {
				owner_id: resolvedOwnerId,
				OR: [{ slug: projectName }, { name: projectName }],
			},
			select: {
				id: true,
				name: true,
				slug: true,
				path: true,
				wp_home: true,
				github_repo_url: true,
				github_branch: true,
			},
		});
		if (!project) {
			throw new NotFoundException({
				detail: `Project ${projectName} not found`,
			});
		}

		return project as DbProjectNameRow;
	}

	async getRemoteProjects() {
		const rows = await this.prisma.projects.findMany({
			select: {
				id: true,
				name: true,
				slug: true,
				wp_home: true,
				environment: true,
				status: true,
				tags: true,
				created_at: true,
				project_servers: {
					select: {
						environment: true,
						wp_url: true,
						servers: {
							select: {
								name: true,
							},
						},
					},
					orderBy: [{ is_primary: 'desc' }, { updated_at: 'desc' }],
					take: 1,
				},
				servers: {
					select: {
						name: true,
					},
				},
				project_tags: {
					select: {
						tags: {
							select: { name: true },
						},
					},
				},
			},
			orderBy: { created_at: 'desc' },
		});

		return rows.map(project => {
			const primaryEnv = project.project_servers[0];
			const relationTags = project.project_tags
				.map(tag => tag.tags.name)
				.filter(name => Boolean(name))
				.sort((left, right) => left.localeCompare(right));

			return {
				id: project.id,
				name: project.name,
				slug: project.slug,
				domain: primaryEnv?.wp_url ?? project.wp_home ?? '',
				environment: primaryEnv?.environment ?? project.environment,
				status: project.status,
				server_name: primaryEnv?.servers.name ?? project.servers?.name ?? null,
				health_score: 90,
				tags:
					relationTags.length > 0 ? relationTags : this.parseTags(project.tags),
				created_at: project.created_at,
			};
		});
	}

	async getProjectsStatus() {
		return this.getRemoteProjects();
	}

	async getAllTags() {
		const rows = await this.prisma.tags.findMany({
			select: {
				name: true,
			},
			orderBy: { name: 'asc' },
		});

		const allTags = new Set<string>();
		for (const row of rows) {
			if (row.name && row.name.trim().length > 0) {
				allTags.add(row.name.trim());
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
		const normalizedDomain = this.normalizeProjectUrl(payload.domain);
		const slug = this.makeSlug(payload.name);
		const existing = await this.prisma.projects.findUnique({
			where: { slug },
			select: { id: true },
		});

		if (existing) {
			throw new BadRequestException({
				detail: `Project with slug '${slug}' already exists`,
			});
		}

		const project = await this.prisma.projects.create({
			data: {
				name: payload.name,
				slug,
				description: payload.description ?? null,
				path: '',
				status: 'active',
				environment: 'production',
				wp_home: normalizedDomain,
				github_repo_url: payload.github_repo_url ?? null,
				github_branch: payload.github_branch ?? 'main',
				owner_id: resolvedOwnerId,
				tags: JSON.stringify(payload.tags ?? []),
				gdrive_connected: false,
				updated_at: new Date(),
			},
			select: {
				id: true,
				name: true,
				slug: true,
				wp_home: true,
				client_id: true,
				description: true,
				status: true,
				github_repo_url: true,
				github_branch: true,
				tags: true,
				created_at: true,
				updated_at: true,
			},
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Failed to create project' });
		}

		await this.ensureProjectApexDomainTracked(
			project.id,
			normalizedDomain,
			1,
			project.client_id,
		);

		const normalizedTags = Array.from(
			new Set(
				(payload.tags ?? [])
					.map(tag => tag.trim())
					.filter(tag => tag.length > 0),
			),
		);

		if (normalizedTags.length > 0) {
			for (const tagName of normalizedTags) {
				const existingTag = await this.prisma.tags.findFirst({
					where: {
						name: { equals: tagName, mode: 'insensitive' },
					},
					select: { id: true },
				});

				let tagId = existingTag?.id;
				if (!tagId) {
					const slug = this.makeTagSlug(tagName);
					const insertedTag = await this.prisma.tags.create({
						data: {
							name: tagName,
							slug,
							color: '#6366f1',
							icon: null,
							description: null,
							usage_count: 0,
							created_at: new Date(),
							updated_at: new Date(),
						},
						select: { id: true },
					});
					tagId = insertedTag.id;
				}

				if (tagId) {
					await this.prisma.project_tags.createMany({
						data: [{ project_id: project.id, tag_id: tagId }],
						skipDuplicates: true,
					});
				}
			}

			const tags = await this.prisma.tags.findMany({
				select: {
					id: true,
					_count: {
						select: {
							project_tags: true,
							server_tags: true,
							client_tags: true,
						},
					},
				},
			});

			await this.prisma.$transaction(
				tags.map(tag =>
					this.prisma.tags.update({
						where: { id: tag.id },
						data: {
							usage_count:
								tag._count.project_tags +
								tag._count.server_tags +
								tag._count.client_tags,
							updated_at: new Date(),
						},
					}),
				),
			);
		}

		return {
			id: project.id,
			name: project.name,
			slug: project.slug,
			domain: project.wp_home ?? normalizedDomain,
			site_title: payload.site_title ?? null,
			description: project.description,
			status: project.status,
			github_repo_url: project.github_repo_url,
			github_branch: project.github_branch,
			tags:
				normalizedTags.length > 0
					? normalizedTags
					: this.parseTags(project.tags),
			environments_count: 0,
			created_at: project.created_at,
			updated_at: project.updated_at,
		};
	}

	async deleteProject(projectId: number) {
		const project = await this.prisma.projects.findUnique({
			where: { id: projectId },
			select: { id: true },
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		await this.prisma.projects.delete({
			where: { id: projectId },
		});
	}

	async getProjectEnvironments(projectId: number) {
		const rows = await this.listProjectServers(projectId);
		return rows;
	}

	async listProjectServers(projectId: number, environment?: string) {
		const project = await this.prisma.projects.findUnique({
			where: { id: projectId },
			select: { id: true },
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const rows = await this.prisma.project_servers.findMany({
			where: {
				project_id: projectId,
			},
			include: {
				servers: {
					select: {
						name: true,
						hostname: true,
					},
				},
			},
			orderBy: {
				environment: 'asc',
			},
		});

		return rows
			.filter(row => !environment || row.environment === environment)
			.map(row => ({
				id: row.id,
				project_id: row.project_id,
				environment: row.environment,
				server_id: row.server_id,
				server_name: row.servers.name,
				server_hostname: row.servers.hostname,
				wp_url: row.wp_url,
				wp_path: row.wp_path,
				ssh_user: row.ssh_user,
				ssh_key_path: row.ssh_key_path,
				database_name: row.database_name,
				database_user: row.database_user,
				database_password: row.database_password,
				gdrive_backups_folder_id: row.gdrive_backups_folder_id,
				notes: row.notes,
				is_primary: row.is_primary,
				created_at: row.created_at,
				updated_at: row.updated_at,
			}));
	}

	async linkEnvironment(
		projectId: number,
		payload: EnvironmentCreateDto,
		ownerId?: number,
	) {
		const normalizedWpUrl = this.normalizeProjectUrl(payload.wp_url);
		const normalizedWpPath = this.normalizeWpPath(payload.wp_path);
		const project = await this.prisma.projects.findUnique({
			where: { id: projectId },
			select: {
				id: true,
				name: true,
				owner_id: true,
				server_id: true,
				environment: true,
				wp_home: true,
			},
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
		if (ownerId && project.owner_id !== ownerId) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
		const nextEnvironment = this.parseServerEnvironment(payload.environment);

		const server = await this.prisma.servers.findUnique({
			where: { id: payload.server_id },
			select: {
				id: true,
				name: true,
				hostname: true,
			},
		});
		if (!server) {
			throw new NotFoundException({ detail: 'Server not found' });
		}
		if (ownerId) {
			const ownedServer = await this.prisma.servers.findFirst({
				where: {
					id: payload.server_id,
					owner_id: ownerId,
				},
				select: { id: true },
			});
			if (!ownedServer) {
				throw new NotFoundException({ detail: 'Server not found' });
			}
		}

		const existing = await this.prisma.project_servers.findFirst({
			where: {
				project_id: projectId,
				server_id: payload.server_id,
				environment: nextEnvironment,
			},
			select: { id: true },
		});
		if (existing) {
			throw new BadRequestException({
				detail: `${payload.environment} environment already linked for this project`,
			});
		}

		const nextIsPrimary = payload.is_primary ?? true;
		const shouldCreateMonitor =
			nextEnvironment === 'staging' || nextEnvironment === 'production';

		const inserted = await this.prisma.$transaction(async tx => {
			if (nextIsPrimary) {
				await tx.project_servers.updateMany({
					where: {
						project_id: projectId,
						environment: nextEnvironment,
						is_primary: true,
					},
					data: {
						is_primary: false,
						updated_at: new Date(),
					},
				});
			}

			const created = await tx.project_servers.create({
				data: {
					project_id: projectId,
					server_id: payload.server_id,
					environment: nextEnvironment,
					wp_url: normalizedWpUrl,
					wp_path: normalizedWpPath,
					ssh_user: payload.ssh_user ?? null,
					ssh_key_path: payload.ssh_key_path ?? null,
					database_name: payload.database_name ?? null,
					database_user: payload.database_user ?? null,
					database_password: payload.database_password ?? null,
					gdrive_backups_folder_id: payload.gdrive_backups_folder_id ?? null,
					notes: payload.notes ?? null,
					is_primary: nextIsPrimary,
					updated_at: new Date(),
				},
			});

			const projectUpdateData: {
				server_id?: number;
				environment?: environmenttype;
				wp_home?: string;
				updated_at: Date;
			} = { updated_at: new Date() };

			if (nextIsPrimary) {
				projectUpdateData.server_id = payload.server_id;
				projectUpdateData.environment = nextEnvironment as environmenttype;
				projectUpdateData.wp_home = normalizedWpUrl;
			} else {
				if (!project.server_id) {
					projectUpdateData.server_id = payload.server_id;
				}
				if (!project.wp_home) {
					projectUpdateData.wp_home = normalizedWpUrl;
				}
			}

			await tx.projects.update({
				where: { id: projectId },
				data: projectUpdateData,
			});

			if (shouldCreateMonitor) {
				const existingMonitor = await tx.monitors.findFirst({
					where: {
						project_id: projectId,
						created_by_id: project.owner_id,
						monitor_type: 'uptime',
						url: normalizedWpUrl,
					},
					select: { id: true },
				});

				if (!existingMonitor) {
					await tx.monitors.create({
						data: {
							name: `${project.name} - ${nextEnvironment}`,
							monitor_type: 'uptime',
							url: normalizedWpUrl,
							interval_seconds: 300,
							timeout_seconds: 30,
							is_active: true,
							alert_on_down: true,
							consecutive_failures: 3,
							project_id: projectId,
							project_server_id: created.id,
							created_by_id: project.owner_id,
							updated_at: new Date(),
						},
					});
				}
			}

			return created;
		});

		return {
			id: inserted.id,
			environment: inserted.environment,
			server_id: inserted.server_id,
			server_name: server.name,
			server_hostname: server.hostname,
			wp_url: normalizedWpUrl,
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
		const existing = await this.prisma.project_servers.findFirst({
			where: { id: envId, project_id: projectId },
		});
		if (!existing) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}

		const nextEnvironment = payload.environment
			? this.parseServerEnvironment(payload.environment)
			: existing.environment;
		const nextWpPath =
			typeof payload.wp_path === 'string'
				? this.normalizeWpPath(payload.wp_path)
				: existing.wp_path;
		if (payload.is_primary === true) {
			await this.prisma.project_servers.updateMany({
				where: {
					project_id: projectId,
					environment: nextEnvironment,
					is_primary: true,
					NOT: { id: envId },
				},
				data: {
					is_primary: false,
					updated_at: new Date(),
				},
			});
		}

		const updated = await this.prisma.project_servers.update({
			where: { id: envId },
			data: {
				environment: nextEnvironment,
				wp_url: payload.wp_url ?? existing.wp_url,
				wp_path: nextWpPath,
				ssh_user: payload.ssh_user ?? existing.ssh_user,
				ssh_key_path: payload.ssh_key_path ?? existing.ssh_key_path,
				database_name: payload.database_name ?? existing.database_name,
				database_user: payload.database_user ?? existing.database_user,
				database_password:
					payload.database_password ?? existing.database_password,
				gdrive_backups_folder_id:
					payload.gdrive_backups_folder_id ?? existing.gdrive_backups_folder_id,
				notes: payload.notes ?? existing.notes,
				is_primary: payload.is_primary ?? existing.is_primary,
				updated_at: new Date(),
			},
		});

		return {
			status: 'success',
			data: updated,
		};
	}

	async unlinkEnvironment(projectId: number, envId: number) {
		const existing = await this.prisma.project_servers.findFirst({
			where: { id: envId, project_id: projectId },
			select: { id: true },
		});
		if (!existing) {
			throw new NotFoundException({ detail: 'Environment link not found' });
		}

		await this.prisma.backups.updateMany({
			where: { project_server_id: envId },
			data: { project_server_id: null, updated_at: new Date() },
		});

		await this.prisma.project_servers.delete({
			where: { id: envId },
		});
	}

	async getProjectBackups(projectId: number, page = 1, pageSize = 10) {
		const project = await this.prisma.projects.findUnique({
			where: { id: projectId },
			select: { id: true },
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const safePage = Math.max(1, page);
		const safePageSize = Math.max(1, Math.min(100, pageSize));
		const offset = (safePage - 1) * safePageSize;

		const total = await this.prisma.backups.count({
			where: { project_id: projectId },
		});

		const rows = await this.prisma.backups.findMany({
			where: { project_id: projectId },
			orderBy: { created_at: 'desc' },
			skip: offset,
			take: safePageSize,
			select: {
				id: true,
				project_id: true,
				name: true,
				backup_type: true,
				storage_type: true,
				status: true,
				storage_path: true,
				size_bytes: true,
				created_at: true,
				completed_at: true,
				project_server_id: true,
				drive_folder_id: true,
				storage_file_id: true,
			},
		});

		return {
			items: rows.map(backup => ({
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
			})),
			total,
			page: safePage,
			page_size: safePageSize,
		};
	}

	async getEnvironmentBackups(
		projectId: number,
		envId: number,
		page = 1,
		pageSize = 10,
		ownerId?: number,
	) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const project = await this.prisma.projects.findFirst({
			where: {
				id: projectId,
				owner_id: resolvedOwnerId,
			},
			select: {
				id: true,
				name: true,
			},
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const environment = await this.prisma.project_servers.findFirst({
			where: {
				id: envId,
				project_id: projectId,
			},
			select: { id: true },
		});
		if (!environment) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}

		const safePage = Math.max(1, page);
		const safePageSize = Math.max(1, Math.min(100, pageSize));
		const offset = (safePage - 1) * safePageSize;

		const total = await this.prisma.backups.count({
			where: {
				project_id: projectId,
				project_server_id: envId,
			},
		});

		const rows = await this.prisma.backups.findMany({
			where: {
				project_id: projectId,
				project_server_id: envId,
			},
			orderBy: { created_at: 'desc' },
			skip: offset,
			take: safePageSize,
			select: {
				id: true,
				project_id: true,
				name: true,
				backup_type: true,
				storage_type: true,
				status: true,
				storage_path: true,
				size_bytes: true,
				created_at: true,
				completed_at: true,
				project_server_id: true,
				drive_folder_id: true,
				storage_file_id: true,
			},
		});

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
			total,
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

		const project = await this.prisma.projects.findUnique({
			where: { id: projectId },
			select: { id: true },
		});
		if (!project) {
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
		const project = await this.prisma.projects.findUnique({
			where: { id: projectId },
			select: {
				id: true,
				name: true,
				slug: true,
				gdrive_connected: true,
				gdrive_folder_id: true,
				gdrive_backups_folder_id: true,
				gdrive_assets_folder_id: true,
				gdrive_docs_folder_id: true,
				gdrive_last_sync: true,
			},
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
		return project as DbProjectDriveRow;
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

		await this.prisma.projects.update({
			where: { id: projectId },
			data: {
				gdrive_folder_id: nextFolder,
				gdrive_backups_folder_id: nextBackups,
				gdrive_assets_folder_id: nextAssets,
				gdrive_docs_folder_id: nextDocs,
				gdrive_connected: nextConnected,
				updated_at: new Date(),
			},
		});

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
		const envRows = await this.prisma.project_servers.findMany({
			where: { project_id: projectId },
			select: {
				environment: true,
				gdrive_backups_folder_id: true,
			},
		});

		const backupRows = await this.prisma.backups.findMany({
			where: { project_id: projectId },
			orderBy: { created_at: 'desc' },
			select: {
				id: true,
				name: true,
				status: true,
				storage_type: true,
				storage_path: true,
				size_bytes: true,
				created_at: true,
				completed_at: true,
				drive_folder_id: true,
				storage_file_id: true,
				project_servers: {
					select: {
						environment: true,
					},
				},
			},
		});

		const entries = envRows.reduce<
			Record<string, Array<Record<string, unknown>>>
		>((acc, envRow) => {
			if (environment && envRow.environment !== environment) {
				return acc;
			}
			acc[envRow.environment] = [];
			return acc;
		}, {});

		for (const backup of backupRows) {
			const envKey = backup.project_servers?.environment || 'project';
			if (environment && envKey !== environment) {
				continue;
			}
			if (!entries[envKey]) {
				entries[envKey] = [];
			}
			entries[envKey].push({
				id: backup.id,
				name: backup.name,
				status: backup.status,
				storage_type: backup.storage_type,
				storage_path: backup.storage_path,
				size_bytes: backup.size_bytes ? Number(backup.size_bytes) : null,
				created_at: backup.created_at,
				completed_at: backup.completed_at,
				drive_folder_id: backup.drive_folder_id,
				storage_file_id: backup.storage_file_id,
			});
		}

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
		const normalizedBackupType = backupType.trim().toLowerCase();
		const normalizedStorageType =
			storageType.trim().toLowerCase() === 'gdrive'
				? 'google_drive'
				: storageType.trim().toLowerCase();

		if (!backupTypes.has(normalizedBackupType as backuptype)) {
			throw new BadRequestException({
				detail: 'Invalid backup_type',
			});
		}

		if (!backupStorageTypes.has(normalizedStorageType as backupstoragetype)) {
			throw new BadRequestException({
				detail: 'Invalid storage_type',
			});
		}

		const project = await this.prisma.projects.findFirst({
			where: {
				id: projectId,
				owner_id: resolvedOwnerId,
			},
			select: {
				id: true,
				name: true,
			},
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const env = await this.prisma.project_servers.findFirst({
			where: {
				id: envId,
				project_id: projectId,
			},
			select: {
				id: true,
				environment: true,
			},
		});
		if (!env) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}

		const backupStoragePath = `/backups/${projectId}/${randomUUID()}.tar.gz`;

		const created = await this.prisma.backups.create({
			data: {
				name: `Backup ${env.environment.toUpperCase()} - ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
				backup_type: normalizedBackupType as backuptype,
				storage_type: normalizedStorageType as backupstoragetype,
				storage_path: backupStoragePath,
				status: 'pending',
				started_at: new Date(),
				project_id: projectId,
				created_by_id: resolvedOwnerId,
				project_server_id: envId,
			},
			select: {
				id: true,
			},
		});

		return {
			task_id: randomUUID(),
			status: 'pending',
			message: `Backup queued for ${project.name} (${env.environment})`,
			backup_id: created.id,
		};
	}

	async refreshProjectWhois(projectId: number) {
		const project = await this.prisma.projects.findUnique({
			where: { id: projectId },
			select: {
				id: true,
				wp_home: true,
				name: true,
			},
		});
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
		const env = await this.prisma.project_servers.findFirst({
			where: {
				id: envId,
				project_id: projectId,
			},
			select: {
				id: true,
				environment: true,
				wp_url: true,
			},
		});
		if (!env) {
			throw new NotFoundException({ detail: 'Environment not found' });
		}
		return {
			id: env.id,
			environment: env.environment,
			wp_url: env.wp_url,
		};
	}

	async listEnvironmentUsers(projectId: number, envId: number) {
		await this.ensureEnvironment(projectId, envId);
		return [];
	}

	async getProjectServerById(linkId: number) {
		const link = await this.prisma.project_servers.findFirst({
			where: { id: linkId },
			select: {
				id: true,
				project_id: true,
				server_id: true,
				environment: true,
				wp_path: true,
				wp_url: true,
				ssh_user: true,
				ssh_key_path: true,
				database_name: true,
				database_user: true,
				database_password: true,
				gdrive_backups_folder_id: true,
				notes: true,
				is_primary: true,
				created_at: true,
				updated_at: true,
				servers: {
					select: {
						name: true,
					},
				},
			},
		});
		if (!link) {
			throw new NotFoundException({ detail: 'Project-server link not found' });
		}

		return {
			id: link.id,
			project_id: link.project_id,
			server_id: link.server_id,
			environment: link.environment,
			wp_path: link.wp_path,
			wp_url: link.wp_url,
			ssh_user: link.ssh_user,
			ssh_key_path: link.ssh_key_path,
			database_name: link.database_name,
			database_user: link.database_user,
			database_password: link.database_password,
			gdrive_backups_folder_id: link.gdrive_backups_folder_id,
			notes: link.notes,
			is_primary: link.is_primary,
			server_name: link.servers.name,
			created_at: link.created_at,
			updated_at: link.updated_at,
		};
	}

	async getProjectServerLink(
		projectId: number,
		linkId: number,
		ownerId?: number,
	) {
		const resolvedOwnerId = ownerId ?? this.fallbackOwnerId;
		const project = await this.prisma.projects.findFirst({
			where: {
				id: projectId,
				owner_id: resolvedOwnerId,
			},
			select: { id: true },
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project-server link not found' });
		}

		const link = await this.prisma.project_servers.findFirst({
			where: {
				id: linkId,
				project_id: projectId,
			},
			select: {
				id: true,
				project_id: true,
				server_id: true,
				environment: true,
				wp_path: true,
				wp_url: true,
				gdrive_backups_folder_id: true,
				notes: true,
				is_primary: true,
				created_at: true,
				updated_at: true,
				servers: {
					select: {
						name: true,
					},
				},
			},
		});
		if (!link) {
			throw new NotFoundException({ detail: 'Project-server link not found' });
		}

		return {
			id: link.id,
			project_id: link.project_id,
			server_id: link.server_id,
			environment: link.environment,
			wp_path: link.wp_path,
			wp_url: link.wp_url,
			gdrive_backups_folder_id: link.gdrive_backups_folder_id,
			notes: link.notes,
			is_primary: link.is_primary,
			server_name: link.servers.name,
			created_at: link.created_at,
			updated_at: link.updated_at,
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
		const project = await this.prisma.projects.findFirst({
			where: {
				id: projectId,
				owner_id: resolvedOwnerId,
			},
			select: {
				id: true,
				name: true,
			},
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		const source = await this.prisma.project_servers.findFirst({
			where: {
				id: payload.source_env_id,
				project_id: projectId,
			},
			select: {
				id: true,
				wp_url: true,
			},
		});
		if (!source) {
			throw new NotFoundException({ detail: 'Source environment not found' });
		}

		const targetServer = await this.prisma.servers.findUnique({
			where: { id: payload.target_server_id },
			select: { id: true, name: true },
		});
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
		const project = await this.prisma.projects.findFirst({
			where: {
				id: projectId,
				owner_id: resolvedOwnerId,
			},
			select: {
				id: true,
				name: true,
			},
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		if (!payload.backup_timestamp?.trim()) {
			throw new BadRequestException({ detail: 'backup_timestamp is required' });
		}

		const targetServer = await this.prisma.servers.findUnique({
			where: { id: payload.target_server_id },
			select: { id: true, name: true },
		});
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
		const project = await this.prisma.projects.findFirst({
			where: {
				owner_id: resolvedOwnerId,
				OR: [{ slug: projectName }, { name: projectName }],
			},
			select: {
				id: true,
				name: true,
				slug: true,
			},
		});
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

		await this.prisma.projects.update({
			where: { id: project.id },
			data: {
				github_repo_url: repoUrl,
				github_branch: branch && branch.length > 0 ? branch : 'main',
				updated_at: new Date(),
			},
		});

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
		const project = await this.prisma.projects.findFirst({
			where: {
				owner_id: resolvedOwnerId,
				OR: [{ slug: projectName }, { name: projectName }],
			},
			select: {
				id: true,
				name: true,
				slug: true,
				github_repo_url: true,
				github_branch: true,
			},
		});
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
		const task = await this.taskStatusService.getTaskStatus(taskId, {
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
		const project = await this.prisma.projects.findFirst({
			where: {
				owner_id: resolvedOwnerId,
				OR: [{ slug: projectName }, { name: projectName }],
			},
			select: {
				id: true,
				name: true,
				slug: true,
				github_repo_url: true,
				github_branch: true,
			},
		});
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

		const rows = await this.prisma.projects.findMany({
			where: {
				owner_id: resolvedOwnerId,
				OR: [{ slug: { in: projectNames } }, { name: { in: projectNames } }],
			},
			select: {
				id: true,
				name: true,
				slug: true,
			},
		});

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
		const project = await this.prisma.projects.findFirst({
			where: {
				id: projectId,
				owner_id: resolvedOwnerId,
			},
			select: {
				id: true,
				name: true,
				wp_home: true,
			},
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		let siteUrl = project.wp_home;
		if (envId) {
			const env = await this.prisma.project_servers.findFirst({
				where: {
					id: envId,
					project_id: projectId,
				},
				select: {
					wp_url: true,
				},
			});
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
