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
	project_name: string;
	environment: string;
	wp_url: string;
	wp_path: string;
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
		const rows = await this.prisma.$queryRaw<ServerRow[]>`
			SELECT id, name
			FROM servers
			WHERE id = ${serverId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const server = rows[0];
		if (!server) {
			throw new NotFoundException({ detail: 'Server not found' });
		}
		return server;
	}

	async listServerWebsites(serverId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		await this.getOwnedServer(serverId, resolvedOwnerId);

		const rows = await this.prisma.$queryRaw<ImportedWebsiteRow[]>`
			SELECT
				ps.project_id,
				p.name AS project_name,
				ps.environment::text AS environment,
				ps.wp_url,
				ps.wp_path
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE ps.server_id = ${serverId}
				AND p.owner_id = ${resolvedOwnerId}
			ORDER BY p.name ASC
		`;

		return rows.map(row => ({
			domain: this.normalizeDomain(row.wp_url),
			document_root: row.wp_path,
			admin_email: null,
			php_version: null,
			ssl_enabled: row.wp_url.startsWith('https://'),
			is_wordpress: true,
			wp_type: row.wp_path.includes('/web') ? 'bedrock' : 'standard',
			wp_version: null,
			site_title: row.project_name,
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

		const existingRows = await this.prisma.$queryRaw<Array<{ id: number }>>`
			SELECT ps.id
			FROM project_servers ps
			JOIN projects p ON p.id = ps.project_id
			WHERE ps.server_id = ${serverId}
				AND p.owner_id = ${resolvedOwnerId}
				AND (
					LOWER(REPLACE(REPLACE(ps.wp_url, 'https://', ''), 'http://', '')) = ${domain}
					OR LOWER(ps.wp_path) = ${docRoot.toLowerCase()}
				)
			LIMIT 1
		`;
		if (existingRows[0]) {
			throw new BadRequestException({
				detail: 'This website is already imported as a project',
			});
		}

		let slug = domain.replace(/\./g, '-');
		const slugRows = await this.prisma.$queryRaw<Array<{ id: number }>>`
			SELECT id
			FROM projects
			WHERE slug = ${slug}
			LIMIT 1
		`;
		if (slugRows[0]) {
			slug = `${slug}-${serverId}`;
		}

		const projectName =
			payload.project_name?.trim() || this.titleizeFromDomain(domain) || domain;
		const environment =
			payload.environment &&
			['production', 'staging', 'development'].includes(payload.environment)
				? payload.environment
				: 'production';

		const projectRows = await this.prisma.$queryRaw<
			Array<{ id: number; name: string }>
		>`
			INSERT INTO projects (
				name,
				slug,
				description,
				path,
				status,
				environment,
				wp_home,
				owner_id,
				tags,
				gdrive_connected,
				updated_at
			)
			VALUES (
				${projectName},
				${slug},
				${`Imported from ${server.name}: ${domain}`},
				${docRoot},
				${'active'},
				${environment},
				${wpUrl},
				${resolvedOwnerId},
				${'[]'},
				${false},
				NOW()
			)
			RETURNING id, name
		`;
		const project = projectRows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Failed to create project' });
		}

		await this.prisma.$executeRaw`
			INSERT INTO project_servers (
				project_id,
				server_id,
				environment,
				wp_url,
				wp_path,
				database_name,
				database_user,
				database_password,
				is_primary,
				updated_at
			)
			VALUES (
				${project.id},
				${serverId},
				${environment},
				${wpUrl},
				${docRoot},
				${`${slug}_db`},
				${`${slug}_user`},
				${'imported'},
				${true},
				NOW()
			)
		`;

		const createMonitor = payload.create_monitor ?? true;
		if (createMonitor) {
			await this.prisma.$executeRaw`
				INSERT INTO monitors (
					name,
					monitor_type,
					url,
					interval_seconds,
					timeout_seconds,
					is_active,
					alert_on_down,
					consecutive_failures,
					project_id,
					created_by_id,
					created_at,
					updated_at
				)
				VALUES (
					${`${projectName} - ${environment}`},
					${'uptime'}::monitortype,
					${wpUrl},
					${300},
					${30},
					${true},
					${true},
					${3},
					${project.id},
					${resolvedOwnerId},
					NOW(),
					NOW()
				)
			`;
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
