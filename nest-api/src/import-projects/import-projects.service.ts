import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ServerRow = {
	id: number;
	name: string;
};

type ImportedWebsiteRow = {
	project_id: number;
	environment: string;
	wp_url: string;
	wp_path: string;
	projects: {
		name: string;
	};
};

@Injectable()
export class ImportProjectsService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private normalizeDomain(wpUrl: string) {
		return wpUrl
			.replace(/^https?:\/\//, '')
			.replace(/\/$/, '')
			.toLowerCase();
	}

	private titleizeFromDomain(domain: string) {
		const base = domain.split('.')[0] ?? domain;
		return base
			.split('-')
			.filter(Boolean)
			.map(chunk => chunk.charAt(0).toUpperCase() + chunk.slice(1))
			.join(' ');
	}

	private async getOwnedServer(serverId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const server = await this.prisma.servers.findFirst({
			where: {
				id: serverId,
				owner_id: resolvedOwnerId,
			},
			select: {
				id: true,
				name: true,
			},
		});
		if (!server) {
			throw new NotFoundException({ detail: 'Server not found' });
		}
		return server as ServerRow;
	}

	async listServerWebsites(serverId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		await this.getOwnedServer(serverId, resolvedOwnerId);

		const rows = await this.prisma.project_servers.findMany({
			where: {
				server_id: serverId,
				projects: {
					is: {
						owner_id: resolvedOwnerId,
					},
				},
			},
			select: {
				project_id: true,
				environment: true,
				wp_url: true,
				wp_path: true,
				projects: {
					select: {
						name: true,
					},
				},
			},
			orderBy: {
				projects: {
					name: 'asc',
				},
			},
		});

		return rows.map(row => ({
			domain: this.normalizeDomain(row.wp_url),
			document_root: row.wp_path,
			admin_email: null,
			php_version: null,
			ssl_enabled: row.wp_url.startsWith('https://'),
			is_wordpress: true,
			wp_type: row.wp_path.includes('/web') ? 'bedrock' : 'standard',
			wp_version: null,
			site_title: row.projects.name,
			already_imported: true,
			project_id: row.project_id,
		}));
	}

	async importWebsite(
		serverId: number,
		payload: {
			domain: string;
			project_name?: string;
			environment?: string;
			create_monitor?: boolean;
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const server = await this.getOwnedServer(serverId, resolvedOwnerId);
		const domain = payload.domain.toLowerCase().trim();
		if (!domain) {
			throw new BadRequestException({ detail: 'domain is required' });
		}

		const wpUrl = `https://${domain}`;
		const docRoot = `/home/${domain}/public_html`;

		const existing = await this.prisma.project_servers.findFirst({
			where: {
				server_id: serverId,
				projects: {
					is: {
						owner_id: resolvedOwnerId,
					},
				},
				OR: [
					{ wp_url: { equals: `https://${domain}`, mode: 'insensitive' } },
					{ wp_url: { equals: `http://${domain}`, mode: 'insensitive' } },
					{ wp_path: { equals: docRoot, mode: 'insensitive' } },
				],
			},
			select: { id: true },
		});
		if (existing) {
			throw new BadRequestException({
				detail: 'This website is already imported as a project',
			});
		}

		let slug = domain.replace(/\./g, '-');
		const duplicateSlug = await this.prisma.projects.findUnique({
			where: { slug },
			select: { id: true },
		});
		if (duplicateSlug) {
			slug = `${slug}-${serverId}`;
		}

		const projectName =
			payload.project_name?.trim() || this.titleizeFromDomain(domain) || domain;
		const environment: 'production' | 'staging' | 'development' =
			payload.environment === 'production' ||
			payload.environment === 'staging' ||
			payload.environment === 'development'
				? payload.environment
				: 'production';

		const project = await this.prisma.projects.create({
			data: {
				name: projectName,
				slug,
				description: `Imported from ${server.name}: ${domain}`,
				path: docRoot,
				status: 'active',
				environment,
				wp_home: wpUrl,
				owner_id: resolvedOwnerId,
				tags: '[]',
				gdrive_connected: false,
				updated_at: new Date(),
			},
			select: {
				id: true,
				name: true,
			},
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Failed to create project' });
		}

		await this.prisma.project_servers.create({
			data: {
				project_id: project.id,
				server_id: serverId,
				environment,
				wp_url: wpUrl,
				wp_path: docRoot,
				database_name: `${slug}_db`,
				database_user: `${slug}_user`,
				database_password: 'imported',
				is_primary: true,
				updated_at: new Date(),
			},
		});

		const createMonitor = payload.create_monitor ?? true;
		if (createMonitor) {
			await this.prisma.monitors.create({
				data: {
					name: `${projectName} - ${environment}`,
					monitor_type: 'uptime',
					url: wpUrl,
					interval_seconds: 300,
					timeout_seconds: 30,
					is_active: true,
					alert_on_down: true,
					consecutive_failures: 3,
					project_id: project.id,
					created_by_id: resolvedOwnerId,
					created_at: new Date(),
					updated_at: new Date(),
				},
			});
		}

		return {
			success: true,
			project_id: project.id,
			project_name: project.name,
			message: `Successfully imported ${domain} as '${project.name}'`,
			monitor_created: createMonitor,
		};
	}

	async importAllWebsites(
		serverId: number,
		options: {
			environment?: string;
			create_monitors?: boolean;
			wordpress_only?: boolean;
		},
		ownerId?: number,
	) {
		const websites = await this.listServerWebsites(serverId, ownerId);

		const results: Array<Record<string, unknown>> = [];
		let imported = 0;
		let skipped = 0;

		for (const website of websites) {
			if (website.already_imported) {
				skipped += 1;
				continue;
			}

			if ((options.wordpress_only ?? true) && !website.is_wordpress) {
				skipped += 1;
				continue;
			}

			try {
				const result = await this.importWebsite(
					serverId,
					{
						domain: String(website.domain),
						environment: options.environment,
						create_monitor: options.create_monitors,
					},
					ownerId,
				);
				results.push(result);
				if (result.success) {
					imported += 1;
				}
			} catch (error) {
				results.push({
					success: false,
					message:
						error instanceof Error
							? error.message
							: `Failed to import ${String(website.domain)}`,
				});
			}
		}

		return {
			total_websites: websites.length,
			imported,
			skipped,
			results,
		};
	}
}
