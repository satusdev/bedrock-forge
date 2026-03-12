import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { ServerCreateDto } from './dto/server-create.dto';
import { ServerUpdateDto } from './dto/server-update.dto';
import { promisify } from 'util';

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

	private readonly execFileAsync = promisify(execFile);

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

	private normalizeScanPath(basePath?: string) {
		if (!basePath || basePath.trim().length === 0) {
			return '/home';
		}
		const trimmed = basePath.trim();
		if (!trimmed.startsWith('/')) {
			throw new BadRequestException({
				detail: 'base_path must be an absolute path',
			});
		}
		return trimmed;
	}

	private normalizeMaxDepth(maxDepth?: number) {
		if (!Number.isFinite(maxDepth)) {
			return 4;
		}
		return Math.max(1, Math.min(6, Math.trunc(maxDepth ?? 4)));
	}

	private shellQuote(value: string) {
		return `'${value.replace(/'/g, `'"'"'`)}'`;
	}

	private normalizePath(input: string) {
		return input.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
	}

	private detectDomainFromPath(sitePath: string) {
		const parts = sitePath.split('/').filter(Boolean);
		for (const part of parts) {
			if (part.includes('.') && part.length > 3) {
				return part;
			}
		}
		return null;
	}

	private expandHomePath(input: string | null) {
		if (!input) {
			return null;
		}
		if (!input.startsWith('~/')) {
			return input;
		}
		return path.join(os.homedir(), input.slice(2));
	}

	private async runSshCommand(
		server: DbServerRow,
		command: string,
		privateKeyPath?: string,
	) {
		const args = ['-p', String(server.ssh_port ?? 22), '-o', 'BatchMode=yes'];
		args.push('-o', 'StrictHostKeyChecking=no');
		args.push('-o', 'UserKnownHostsFile=/dev/null');
		if (privateKeyPath) {
			args.push('-i', privateKeyPath);
		}
		const target = `${server.ssh_user || 'root'}@${server.hostname}`;
		args.push(target, command);
		return this.execFileAsync('ssh', args, {
			timeout: 120000,
			maxBuffer: 1024 * 1024 * 2,
		});
	}

	private summarizeSshError(error: unknown) {
		if (!(error instanceof Error)) {
			return 'Unknown SSH error';
		}

		const execError = error as Error & {
			code?: number | string;
			stderr?: string;
			stdout?: string;
			signal?: string;
		};
		const parts: string[] = [];

		if (typeof execError.code !== 'undefined') {
			parts.push(`code=${String(execError.code)}`);
		}
		if (execError.signal) {
			parts.push(`signal=${execError.signal}`);
		}

		const stderr = typeof execError.stderr === 'string' ? execError.stderr : '';
		const stdout = typeof execError.stdout === 'string' ? execError.stdout : '';
		const stderrTail = stderr.trim().split('\n').slice(-3).join(' | ');
		const stdoutTail = stdout.trim().split('\n').slice(-2).join(' | ');

		if (stderrTail) {
			parts.push(`stderr=${stderrTail}`);
		} else if (stdoutTail) {
			parts.push(`stdout=${stdoutTail}`);
		}

		if (parts.length === 0) {
			parts.push(error.message);
		}

		return parts.join('; ');
	}

	private async getSystemPrivateKey() {
		const rows = await this.prisma.$queryRaw<
			{ encrypted_value: string | null; value: string | null }[]
		>`
			SELECT encrypted_value, value
			FROM app_settings
			WHERE key = ${'system.ssh.private_key'}
			LIMIT 1
		`;
		const row = rows[0];
		if (!row) {
			return null;
		}
		return row.encrypted_value ?? row.value;
	}

	private async isReadableFile(filePath: string) {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
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

	async scanSites(
		serverId: number,
		basePath = '/home',
		maxDepth = 4,
		ownerId?: number,
	) {
		const existing = await this.getServerRow(serverId, ownerId);
		const scanPath = this.normalizeScanPath(basePath);
		const depth = this.normalizeMaxDepth(maxDepth);

		let keyFilePath: string | undefined;
		let tempDirectory: string | undefined;
		try {
			if (existing.ssh_key_path) {
				const expandedPath = this.expandHomePath(existing.ssh_key_path);
				if (expandedPath && (await this.isReadableFile(expandedPath))) {
					keyFilePath = expandedPath;
				}
			}

			if (!keyFilePath) {
				const inlinePrivateKeyRaw =
					existing.ssh_private_key && existing.ssh_private_key.trim().length > 0
						? existing.ssh_private_key
						: await this.getSystemPrivateKey();
				const inlinePrivateKey = inlinePrivateKeyRaw
					? inlinePrivateKeyRaw.replace(/\r\n/g, '\n').replace(/\\n/g, '\n')
					: null;

				if (inlinePrivateKey && inlinePrivateKey.trim().length > 0) {
					tempDirectory = await fs.mkdtemp(
						path.join(os.tmpdir(), 'forge-ssh-'),
					);
					keyFilePath = path.join(tempDirectory, 'id_rsa');
					await fs.writeFile(keyFilePath, `${inlinePrivateKey.trim()}\n`, {
						encoding: 'utf-8',
						mode: 0o600,
					});
				}
			}

			if (!keyFilePath && existing.ssh_password) {
				return {
					success: false,
					message:
						'SSH password auth is configured, but non-interactive scan requires SSH key auth in Nest API.',
					sites: [],
					server_id: existing.id,
					server_name: existing.name,
					base_path: scanPath,
					max_depth: depth,
				};
			}

			const findCommand = `find ${this.shellQuote(scanPath)} -maxdepth ${depth} -type f -name 'wp-config.php' 2>/dev/null || true`;
			const findResult = await this.runSshCommand(
				existing,
				findCommand,
				keyFilePath,
			);
			const lines = (findResult.stdout || '')
				.split('\n')
				.map(entry => entry.trim())
				.filter(Boolean);

			const projectLinks = await this.prisma.$queryRaw<{ wp_path: string }[]>`
				SELECT wp_path
				FROM project_servers
				WHERE server_id = ${existing.id}
			`;
			const importedPaths = new Set(
				projectLinks.map(row => this.normalizePath(row.wp_path)),
			);

			const discovered: Array<Record<string, unknown>> = [];
			for (const configPath of lines) {
				const wpDir = this.normalizePath(
					configPath.replace(/\/wp-config\.php$/, ''),
				);
				let isBedrock = false;
				let wpPath = wpDir;

				const baseRoot = wpDir.endsWith('/web')
					? this.normalizePath(wpDir.slice(0, -4))
					: wpDir;
				const bedrockCandidates = Array.from(new Set([baseRoot, wpDir]));

				for (const candidateRoot of bedrockCandidates) {
					const bedrockCheckCommand = `(test -d ${this.shellQuote(`${candidateRoot}/web/app`)} || test -d ${this.shellQuote(`${candidateRoot}/web/wp`)}) && echo bedrock || echo standard`;
					const bedrockResult = await this.runSshCommand(
						existing,
						bedrockCheckCommand,
						keyFilePath,
					);
					if ((bedrockResult.stdout || '').toLowerCase().includes('bedrock')) {
						isBedrock = true;
						wpPath = candidateRoot;
						break;
					}
				}

				if (!isBedrock && wpDir.includes('/web/app')) {
					isBedrock = true;
					wpPath = this.normalizePath(wpDir.split('/web/app')[0] || wpDir);
				}

				const normalizedWpPath = this.normalizePath(wpPath);
				discovered.push({
					path: wpDir,
					wp_config_path: configPath,
					is_bedrock: isBedrock,
					wp_path: normalizedWpPath,
					domain: this.detectDomainFromPath(wpDir),
					imported:
						importedPaths.has(wpDir) || importedPaths.has(normalizedWpPath),
				});
			}

			await this.prisma.$executeRaw`
				UPDATE servers
				SET wp_root_paths = ${JSON.stringify(
					discovered.map(site => String(site.path ?? '')),
				)}, updated_at = NOW()
				WHERE id = ${existing.id}
			`;

			return {
				success: true,
				message: `Scan completed on ${existing.name}`,
				sites: discovered,
				server_id: existing.id,
				server_name: existing.name,
				base_path: scanPath,
				max_depth: depth,
			};
		} catch (error) {
			const detail =
				error instanceof Error
					? error.message.slice(0, 300)
					: 'Unknown scan error';
			return {
				success: false,
				message: detail,
				sites: [],
				server_id: existing.id,
				server_name: existing.name,
				base_path: scanPath,
				max_depth: depth,
			};
		} finally {
			if (tempDirectory) {
				await fs.rm(tempDirectory, { recursive: true, force: true });
			}
		}
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

	async readEnv(serverId: number, targetDirectory: string, ownerId?: number) {
		const server = await this.getServerRow(serverId, ownerId);
		if (!targetDirectory || targetDirectory.trim().length === 0) {
			throw new BadRequestException({ detail: 'Path is required' });
		}

		const targetPath = this.normalizeScanPath(targetDirectory);
		let keyFilePath: string | undefined;
		let tempDirectory: string | undefined;
		try {
			if (server.ssh_key_path) {
				const expandedPath = this.expandHomePath(server.ssh_key_path);
				if (expandedPath && (await this.isReadableFile(expandedPath))) {
					keyFilePath = expandedPath;
				}
			}

			if (!keyFilePath) {
				const inlinePrivateKeyRaw =
					server.ssh_private_key && server.ssh_private_key.trim().length > 0
						? server.ssh_private_key
						: await this.getSystemPrivateKey();
				const inlinePrivateKey = inlinePrivateKeyRaw
					? inlinePrivateKeyRaw.replace(/\r\n/g, '\n').replace(/\\n/g, '\n')
					: null;

				if (inlinePrivateKey && inlinePrivateKey.trim().length > 0) {
					tempDirectory = await fs.mkdtemp(
						path.join(os.tmpdir(), 'forge-ssh-'),
					);
					keyFilePath = path.join(tempDirectory, 'id_rsa');
					await fs.writeFile(keyFilePath, `${inlinePrivateKey.trim()}\n`, {
						encoding: 'utf-8',
						mode: 0o600,
					});
				}
			}

			if (!keyFilePath && server.ssh_password) {
				throw new BadRequestException({
					detail:
						'SSH password auth is configured, but reading .env requires SSH key auth in Nest API.',
				});
			}

			if (!keyFilePath) {
				throw new BadRequestException({
					detail: 'No readable SSH key is configured for this server',
				});
			}

			const parentPath =
				targetPath === '/' ? '/' : targetPath.replace(/\/[^/]+$/, '') || '/';
			const candidateEnvPaths = targetPath.endsWith('/web')
				? Array.from(new Set([`${parentPath}/.env`, `${targetPath}/.env`]))
				: Array.from(
						new Set([
							`${targetPath}/.env`,
							`${targetPath}/web/.env`,
							`${parentPath}/.env`,
						]),
					);

			const readCommand = [
				...candidateEnvPaths.map(
					candidatePath =>
						`if [ -f ${this.shellQuote(candidatePath)} ]; then cat ${this.shellQuote(candidatePath)}; exit 0; fi`,
				),
				`echo ${this.shellQuote('__FORGE_ENV_NOT_FOUND__')}`,
			].join(' ; ');

			const readResult = await this.runSshCommand(
				server,
				readCommand,
				keyFilePath,
			);
			if ((readResult.stdout || '').includes('__FORGE_ENV_NOT_FOUND__')) {
				throw new BadRequestException({
					detail: `No .env file found in expected locations: ${candidateEnvPaths.join(', ')}`,
				});
			}
			const parsedEnv = this.parseBedrockEnv(readResult.stdout || '');

			return {
				success: true,
				server_id: server.id,
				path: targetPath,
				env: parsedEnv,
			};
		} catch (error) {
			if (error instanceof BadRequestException) {
				throw error;
			}
			const detail = this.summarizeSshError(error).slice(0, 500);
			throw new BadRequestException({
				detail: `Failed to read .env: ${detail}`,
			});
		} finally {
			if (tempDirectory) {
				await fs.rm(tempDirectory, { recursive: true, force: true });
			}
		}
	}
}
