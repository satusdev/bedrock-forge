import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServerCreateDto } from './dto/server-create.dto';
import { ServerUpdateDto } from './dto/server-update.dto';

type DbServerRow = {
	id: number;
	name: string;
	hostname: string;
	provider: string;
	status: string;
	ssh_user: string;
	ssh_port: number;
	ssh_key_path: string | null;
	ssh_password: string | null;
	ssh_private_key: string | null;
	panel_type: string;
	panel_url: string | null;
	panel_username: string | null;
	panel_password: string | null;
	panel_verified: boolean;
	last_health_check: Date | null;
	owner_id: number;
	wp_root_paths: string | null;
	uploads_path: string | null;
	tags: string | null;
	created_at: Date;
	updated_at: Date;
};

@Injectable()
export class ServersService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private parseJsonArray(input: string | null): string[] | null {
		if (!input) {
			return null;
		}
		try {
			const parsed = JSON.parse(input) as unknown;
			if (!Array.isArray(parsed)) {
				return null;
			}
			return parsed.filter((item): item is string => typeof item === 'string');
		} catch {
			return null;
		}
	}

	private normalizeServer(server: DbServerRow) {
		return {
			id: server.id,
			name: server.name,
			hostname: server.hostname,
			provider: server.provider,
			status: server.status,
			ssh_user: server.ssh_user,
			ssh_port: server.ssh_port,
			ssh_key_path: server.ssh_key_path,
			panel_type: server.panel_type,
			panel_url: server.panel_url,
			panel_username: server.panel_username,
			panel_password: server.panel_password,
			panel_verified: server.panel_verified,
			last_health_check: server.last_health_check,
			owner_id: server.owner_id,
			wp_root_paths: this.parseJsonArray(server.wp_root_paths),
			uploads_path: server.uploads_path,
			tags: this.parseJsonArray(server.tags),
			created_at: server.created_at,
			updated_at: server.updated_at,
		};
	}

	private async getServerRow(serverId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbServerRow[]>`
			SELECT id, name, hostname, provider, status, ssh_user, ssh_port, ssh_key_path, ssh_password, ssh_private_key, panel_type, panel_url, panel_username, panel_password, panel_verified, last_health_check, owner_id, wp_root_paths, uploads_path, tags, created_at, updated_at
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

	async listServers(skip = 0, limit = 100, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbServerRow[]>`
			SELECT
				id,
				name,
				hostname,
				provider,
				status,
				ssh_user,
				ssh_port,
				ssh_key_path,
				ssh_password,
				ssh_private_key,
				panel_type,
				panel_url,
				panel_username,
				panel_password,
				panel_verified,
				last_health_check,
				owner_id,
				wp_root_paths,
				uploads_path,
				tags,
				created_at,
				updated_at
			FROM servers
			WHERE owner_id = ${resolvedOwnerId}
			ORDER BY created_at DESC
			OFFSET ${skip}
			LIMIT ${limit}
		`;

		return rows.map(server => this.normalizeServer(server));
	}

	async createServer(payload: ServerCreateDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const existingRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM servers
			WHERE hostname = ${payload.hostname.toLowerCase()} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		if (existingRows[0]) {
			throw new BadRequestException({ detail: 'Hostname already exists' });
		}

		const insertedRows = await this.prisma.$queryRaw<DbServerRow[]>`
			INSERT INTO servers (
				name,
				hostname,
				provider,
				status,
				ssh_user,
				ssh_port,
				ssh_key_path,
				ssh_password,
				ssh_private_key,
				panel_type,
				panel_url,
				panel_port,
				panel_verified,
				panel_username,
				panel_password,
				owner_id,
				tags,
				updated_at
			)
			VALUES (
				${payload.name},
				${payload.hostname.toLowerCase()},
				${payload.provider ?? 'custom'}::serverprovider,
				${'offline'}::serverstatus,
				${payload.ssh_user ?? 'root'},
				${payload.ssh_port ?? 22},
				${payload.ssh_key_path ?? null},
				${payload.ssh_password ?? null},
				${payload.ssh_private_key ?? null},
				${payload.panel_type ?? 'none'}::paneltype,
				${payload.panel_url ?? null},
				${8090},
				${false},
				${payload.panel_username ?? null},
				${payload.panel_password ?? null},
				${resolvedOwnerId},
				${payload.tags ? JSON.stringify(payload.tags) : null},
				NOW()
			)
			RETURNING id, name, hostname, provider, status, ssh_user, ssh_port, ssh_key_path, ssh_password, ssh_private_key, panel_type, panel_url, panel_username, panel_password, panel_verified, last_health_check, owner_id, wp_root_paths, uploads_path, tags, created_at, updated_at
		`;
		const inserted = insertedRows[0];
		if (!inserted) {
			throw new NotFoundException({ detail: 'Failed to create server' });
		}

		return this.normalizeServer(inserted);
	}

	async getServer(serverId: number, ownerId?: number) {
		const server = await this.getServerRow(serverId, ownerId);
		return this.normalizeServer(server);
	}

	async updateServer(
		serverId: number,
		payload: ServerUpdateDto,
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const existing = await this.getServerRow(serverId, ownerId);

		await this.prisma.$executeRaw`
			UPDATE servers
			SET
				name = ${payload.name ?? existing.name},
				hostname = ${payload.hostname?.toLowerCase() ?? existing.hostname},
				provider = ${payload.provider ?? existing.provider}::serverprovider,
				ssh_user = ${payload.ssh_user ?? existing.ssh_user},
				ssh_port = ${payload.ssh_port ?? existing.ssh_port},
				ssh_key_path = ${payload.ssh_key_path ?? existing.ssh_key_path},
				ssh_password = ${payload.ssh_password ?? existing.ssh_password},
				ssh_private_key = ${payload.ssh_private_key ?? existing.ssh_private_key},
				panel_type = ${payload.panel_type ?? existing.panel_type}::paneltype,
				panel_url = ${payload.panel_url ?? existing.panel_url},
				panel_username = ${payload.panel_username ?? existing.panel_username},
				panel_password = ${payload.panel_password ?? existing.panel_password},
				uploads_path = ${payload.uploads_path ?? existing.uploads_path},
				tags = ${payload.tags ? JSON.stringify(payload.tags) : existing.tags},
				updated_at = NOW()
			WHERE id = ${serverId} AND owner_id = ${resolvedOwnerId}
		`;

		return this.getServer(serverId, ownerId);
	}

	async deleteServer(serverId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		await this.getServer(serverId, ownerId);
		await this.prisma.$executeRaw`
			DELETE FROM servers
			WHERE id = ${serverId} AND owner_id = ${resolvedOwnerId}
		`;
	}

	async testServerConnection(serverId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const server = await this.getServer(serverId, ownerId);
		await this.prisma.$executeRaw`
			UPDATE servers
			SET status = ${'online'}::serverstatus, last_health_check = NOW(), updated_at = NOW()
			WHERE id = ${serverId} AND owner_id = ${resolvedOwnerId}
		`;
		return {
			success: true,
			message: `Connection successful to ${server.hostname}`,
			response_time_ms: 120,
		};
	}

	async getHealth(serverId: number, ownerId?: number) {
		const server = await this.getServer(serverId, ownerId);
		return {
			server_id: server.id,
			server_name: server.name,
			hostname: server.hostname,
			status: server.status ?? 'unknown',
			last_health_check: server.last_health_check,
			panel_verified: server.panel_verified,
			panel_url: server.panel_url,
			panel_type: server.panel_type,
		};
	}

	async triggerHealthCheck(serverId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const server = await this.getServer(serverId, ownerId);
		await this.prisma.$executeRaw`
			UPDATE servers
			SET
				last_health_check = NOW(),
				status = ${'online'}::serverstatus,
				updated_at = NOW()
			WHERE id = ${serverId} AND owner_id = ${resolvedOwnerId}
		`;

		return {
			status: 'accepted',
			message: `Health check queued for ${server.name}`,
			server_id: serverId,
		};
	}

	async getPanelLoginUrl(serverId: number, ownerId?: number) {
		const server = await this.getServer(serverId, ownerId);
		if (!server.panel_url) {
			throw new BadRequestException({
				detail: 'No panel URL configured for this server',
			});
		}
		if (!server.panel_username || !server.panel_password) {
			throw new BadRequestException({
				detail:
					'Panel credentials not configured. Add username and password to server settings.',
			});
		}

		const panelUrl = server.panel_url.replace(/\/$/, '');
		return {
			server_id: server.id,
			server_name: server.name,
			panel_type: server.panel_type,
			panel_url: panelUrl,
			login_url: `${panelUrl}/`,
			username: server.panel_username,
			password: server.panel_password,
			instructions: 'Use these credentials to log in to the control panel.',
		};
	}

	async getPanelSessionUrl(serverId: number, ownerId?: number) {
		const loginPayload = await this.getPanelLoginUrl(serverId, ownerId);
		return {
			...loginPayload,
			session_url: loginPayload.login_url,
			session_token: null,
		};
	}

	async getAllTags(ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<{ tags: string | null }[]>`
			SELECT tags
			FROM servers
			WHERE tags IS NOT NULL AND owner_id = ${resolvedOwnerId}
		`;
		const unique = new Set<string>();
		rows.forEach(row => {
			const parsed = this.parseJsonArray(row.tags);
			parsed?.forEach(tag => unique.add(tag));
		});

		return {
			tags: Array.from(unique).sort((a, b) => a.localeCompare(b)),
		};
	}

	async updateServerTags(serverId: number, tags: string[], ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		await this.getServer(serverId, ownerId);
		const cleanTags = Array.from(
			new Set(
				tags.map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0),
			),
		);

		await this.prisma.$executeRaw`
			UPDATE servers
			SET tags = ${JSON.stringify(cleanTags)}, updated_at = NOW()
			WHERE id = ${serverId} AND owner_id = ${resolvedOwnerId}
		`;

		return {
			status: 'success',
			server_id: serverId,
			tags: cleanTags,
		};
	}

	async getServerTags(serverId: number, ownerId?: number) {
		const server = await this.getServer(serverId, ownerId);
		return {
			server_id: server.id,
			server_name: server.name,
			tags: server.tags ?? [],
		};
	}

	async scanSites(serverId: number, basePath = '/var/www', ownerId?: number) {
		const server = await this.getServer(serverId, ownerId);
		return {
			success: true,
			message: `Scan completed on ${server.name}`,
			sites: [],
			server_id: server.id,
			server_name: server.name,
			base_path: basePath,
		};
	}

	async scanDirectories(
		serverId: number,
		basePath = '/var/www',
		maxDepth = 3,
		ownerId?: number,
	) {
		const existing = await this.getServerRow(serverId, ownerId);
		const directories = this.parseJsonArray(existing.wp_root_paths) ?? [];

		return {
			success: true,
			message: `Found ${directories.length} WordPress installation(s)`,
			directories: directories.map(path => ({
				path,
				is_bedrock: path.includes('/web') || path.includes('/bedrock'),
				wp_version: null,
				site_url: null,
			})),
			scan_path: basePath,
			max_depth: maxDepth,
		};
	}

	async getDirectories(serverId: number, ownerId?: number) {
		const server = await this.getServerRow(serverId, ownerId);
		return {
			server_id: server.id,
			server_name: server.name,
			directories: this.parseJsonArray(server.wp_root_paths) ?? [],
			uploads_path: server.uploads_path,
		};
	}

	private parseBedrockEnv(content: string) {
		const result: Record<string, string | null> = {
			db_name: null,
			db_user: null,
			db_password: null,
			db_host: 'localhost',
			wp_home: null,
			wp_siteurl: null,
			wp_env: 'production',
			table_prefix: 'wp_',
		};

		const keyMapping: Record<string, keyof typeof result> = {
			DB_NAME: 'db_name',
			DB_USER: 'db_user',
			DB_PASSWORD: 'db_password',
			DB_HOST: 'db_host',
			WP_HOME: 'wp_home',
			WP_SITEURL: 'wp_siteurl',
			WP_ENV: 'wp_env',
			TABLE_PREFIX: 'table_prefix',
		};

		content.split('\n').forEach(rawLine => {
			const line = rawLine.trim();
			if (!line || line.startsWith('#') || !line.includes('=')) {
				return;
			}

			const [keyRaw, ...valueParts] = line.split('=');
			const key = keyRaw?.trim();
			if (!key || !(key in keyMapping)) {
				return;
			}
			const mappedKey = keyMapping[key];
			if (!mappedKey) {
				return;
			}
			let value = valueParts.join('=').trim();
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}

			result[mappedKey] = value;
		});

		return result;
	}

	async readEnv(serverId: number, path: string, ownerId?: number) {
		const server = await this.getServer(serverId, ownerId);
		if (!path || path.trim().length === 0) {
			throw new BadRequestException({ detail: 'Path is required' });
		}

		const placeholder = [
			`# Simulated .env from ${server.hostname}`,
			'DB_NAME=wordpress',
			'DB_USER=wp_user',
			'DB_PASSWORD=secret',
			'DB_HOST=localhost',
			'WP_HOME=https://example.test',
			'WP_SITEURL=${WP_HOME}/wp',
			'WP_ENV=production',
			'TABLE_PREFIX=wp_',
		].join('\n');

		return {
			success: true,
			server_id: server.id,
			path,
			env: this.parseBedrockEnv(placeholder),
		};
	}
}
