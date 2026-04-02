import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { PaginationQuery } from '@bedrock-forge/shared';
import type { QueryProjectsDto } from './dto/project.dto';

interface CreateProjectData {
	name: string;
	client_id: bigint;
	hosting_package_id?: bigint;
	support_package_id?: bigint;
	status?: string;
}

interface UpdateProjectData {
	name?: string;
	client_id?: bigint;
	hosting_package_id?: bigint;
	support_package_id?: bigint;
	status?: string;
}

interface ImportProjectData {
	name: string;
	client_id: bigint;
	environment: {
		server_id: bigint;
		type: string;
		url: string;
		root_path: string;
	};
	dbCredentials?: {
		dbName: string;
		dbUser: string;
		dbPassword: string;
		dbHost: string;
	};
}

interface BulkImportEntry {
	name: string;
	client_id: bigint;
	server_id: bigint;
	type: string;
	url: string;
	root_path: string;
	dbCredentials?: {
		dbName: string;
		dbUser: string;
		dbPassword: string;
		dbHost: string;
	};
	mainDomain?: string;
}

const PROJECT_LIST_INCLUDE = {
	client: true,
	_count: { select: { environments: true } },
	environments: {
		select: {
			id: true,
			url: true,
			type: true,
			server: { select: { id: true, name: true, ip_address: true } },
		},
		orderBy: { created_at: 'asc' as const },
	},
} as const;

const PROJECT_DETAIL_INCLUDE = {
	client: true,
	hosting_package: { select: { id: true, name: true, price_monthly: true } },
	support_package: { select: { id: true, name: true, price_monthly: true } },
	environments: {
		include: {
			server: {
				select: { id: true, name: true, ip_address: true, status: true },
			},
		},
		orderBy: { created_at: 'asc' as const },
	},
} as const;

@Injectable()
export class ProjectsRepository {
	constructor(
		private readonly prisma: PrismaService,
		private readonly enc: EncryptionService,
	) {}

	async findAllPaginated(query: QueryProjectsDto) {
		const page = query.page ?? 1;
		const limit = query.limit ?? 20;
		const skip = (page - 1) * limit;
		const where: Record<string, unknown> = {};
		if (query.search)
			where.name = { contains: query.search, mode: 'insensitive' as const };
		if (query.client_id) where.client_id = BigInt(query.client_id);

		const [items, total] = await this.prisma.$transaction([
			this.prisma.project.findMany({
				where,
				skip,
				take: limit,
				include: PROJECT_LIST_INCLUDE,
				orderBy: { name: 'asc' },
			}),
			this.prisma.project.count({ where }),
		]);

		return { items, total, page, limit };
	}

	async findById(id: bigint) {
		const project = await this.prisma.project.findUnique({
			where: { id },
			include: PROJECT_DETAIL_INCLUDE,
		});
		if (!project) throw new NotFoundException(`Project ${id} not found`);
		return project;
	}

	async create(data: CreateProjectData) {
		return this.prisma.project.create({
			data: {
				name: data.name,
				client_id: data.client_id,
				...(data.hosting_package_id && {
					hosting_package_id: data.hosting_package_id,
				}),
				...(data.support_package_id && {
					support_package_id: data.support_package_id,
				}),
				...(data.status && { status: data.status as never }),
			},
			include: PROJECT_LIST_INCLUDE,
		});
	}

	async update(id: bigint, data: UpdateProjectData) {
		return this.prisma.project.update({
			where: { id },
			data: {
				...(data.name !== undefined && { name: data.name }),
				...(data.client_id !== undefined && { client_id: data.client_id }),
				...(data.hosting_package_id !== undefined && {
					hosting_package_id: data.hosting_package_id,
				}),
				...(data.support_package_id !== undefined && {
					support_package_id: data.support_package_id,
				}),
				...(data.status !== undefined && { status: data.status as never }),
			},
		});
	}

	async remove(id: bigint) {
		return this.prisma.project.delete({ where: { id } });
	}

	/**
	 * Create a project and its first environment atomically.
	 * Used when importing an existing site from a server folder.
	 */
	async importFromServer(data: ImportProjectData) {
		return this.prisma.$transaction(async tx => {
			const project = await tx.project.create({
				data: {
					name: data.name,
					client_id: data.client_id,
					status: 'active',
				},
			});

			const environment = await tx.environment.create({
				data: {
					project_id: project.id,
					server_id: data.environment.server_id,
					type: data.environment.type,
					url: data.environment.url,
					root_path: data.environment.root_path,
				},
				include: {
					server: {
						select: { id: true, name: true, ip_address: true, status: true },
					},
				},
			});

			if (data.dbCredentials) {
				await tx.wpDbCredentials.create({
					data: {
						environment_id: environment.id,
						db_name_encrypted: this.enc.encrypt(data.dbCredentials.dbName),
						db_user_encrypted: this.enc.encrypt(data.dbCredentials.dbUser),
						db_password_encrypted: this.enc.encrypt(
							data.dbCredentials.dbPassword,
						),
						db_host_encrypted: this.enc.encrypt(data.dbCredentials.dbHost),
					},
				});
			}

			return { project, environment };
		});
	}

	/**
	 * Import multiple projects in a single transaction.
	 * For each entry: creates Project → Environment → WpDbCredentials (encrypted).
	 */
	async importBulk(entries: BulkImportEntry[]): Promise<
		Array<{
			project: { id: bigint; name: string };
			environment: { id: bigint; url: string };
		}>
	> {
		return this.prisma.$transaction(async tx => {
			const results: Array<{
				project: { id: bigint; name: string };
				environment: { id: bigint; url: string };
			}> = [];

			for (const entry of entries) {
				const project = await tx.project.create({
					data: {
						name: entry.name,
						client_id: entry.client_id,
						status: 'active',
					},
					select: { id: true, name: true },
				});

				const environment = await tx.environment.create({
					data: {
						project_id: project.id,
						server_id: entry.server_id,
						type: entry.type,
						url: entry.url,
						root_path: entry.root_path,
					},
					select: { id: true, url: true },
				});

				if (entry.dbCredentials) {
					await tx.wpDbCredentials.create({
						data: {
							environment_id: environment.id,
							db_name_encrypted: this.enc.encrypt(entry.dbCredentials.dbName),
							db_user_encrypted: this.enc.encrypt(entry.dbCredentials.dbUser),
							db_password_encrypted: this.enc.encrypt(
								entry.dbCredentials.dbPassword,
							),
							db_host_encrypted: this.enc.encrypt(entry.dbCredentials.dbHost),
						},
					});
				}

				results.push({ project, environment });
			}

			return results;
		});
	}
}
