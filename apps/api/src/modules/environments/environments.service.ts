import {
	BadRequestException,
	InternalServerErrorException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { EnvironmentsRepository } from './environments.repository';
import {
	CreateEnvironmentDto,
	UpdateEnvironmentDto,
	UpsertDbCredentialsDto,
} from './dto/environment.dto';
import { WpQuickLoginDto } from './dto/wp-quick-login.dto';
import { ServersService } from '../servers/servers.service';
import {
	createRemoteExecutor,
	credentialParser,
} from '@bedrock-forge/remote-executor';
import { MonitorsService } from '../monitors/monitors.service';
import { DomainsService } from '../domains/domains.service';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface WpUser {
	id: number;
	user_login: string;
	user_email: string;
	display_name: string;
	user_registered: string;
	roles: string[];
}

@Injectable()
export class EnvironmentsService {
	private readonly logger = new Logger(EnvironmentsService.name);

	constructor(
		private readonly repo: EnvironmentsRepository,
		private readonly serversService: ServersService,
		private readonly monitorsService: MonitorsService,
		private readonly domainsService: DomainsService,
	) {}

	existsById(id: bigint): Promise<boolean> {
		return this.repo.existsById(id);
	}

	findAll() {
		return this.repo.findAll();
	}

	findByProject(projectId: number) {
		return this.repo.findByProject(BigInt(projectId));
	}

	async findOne(id: number) {
		const env = await this.repo.findById(BigInt(id));
		if (!env) throw new NotFoundException(`Environment ${id} not found`);
		return env;
	}

	async assertBelongsToProject(
		envId: number,
		projectId: number,
	): Promise<void> {
		const env = await this.repo.findById(BigInt(envId));
		if (!env || env.project_id !== BigInt(projectId))
			throw new NotFoundException(`Environment ${envId} not found`);
	}

	async create(projectId: number, dto: CreateEnvironmentDto) {
		const env = await this.repo.create(BigInt(projectId), dto);
		// Store DB credentials extracted during server scan (if provided)
		if (dto.db_credentials) {
			try {
				await this.repo.upsertDbCredentials(env.id, dto.db_credentials);
			} catch (err) {
				this.logger.warn(
					`Failed to store DB credentials for env ${env.id}: ${err}`,
				);
			}
		}
		// Auto-create a monitor for the new environment
		try {
			await this.monitorsService.create({
				environment_id: Number(env.id),
				interval_seconds: 600,
				enabled: true,
			});
		} catch (err) {
			this.logger.warn(
				`Failed to auto-create monitor for env ${env.id}: ${err}`,
			);
		}
		// Auto-create a domain record from the registrable root domain
		try {
			const hostname = new URL(dto.url).hostname;
			const domain = this.extractRegistrableDomain(hostname);
			await this.domainsService.findOrCreate(domain);
		} catch (err) {
			this.logger.warn(
				`Failed to auto-create domain for env ${env.id}: ${err}`,
			);
		}
		return env;
	}

	async update(id: number, dto: UpdateEnvironmentDto) {
		await this.findOne(id);
		return this.repo.update(BigInt(id), dto);
	}

	async remove(id: number) {
		await this.findOne(id);
		return this.repo.delete(BigInt(id));
	}

	async getDbCredentials(id: number) {
		await this.findOne(id);
		return this.repo.getDbCredentials(BigInt(id));
	}

	async upsertDbCredentials(id: number, dto: UpsertDbCredentialsDto) {
		await this.findOne(id);
		return this.repo.upsertDbCredentials(BigInt(id), dto);
	}

	/**
	 * Scan a server for WordPress installations and return discovered sites,
	 * marking which ones are already environments in this specific project.
	 * Used by the Add Environment wizard.
	 */
	async scanServerForNewEnv(projectId: number, serverId: number) {
		// Run the full server scan (SSH-based WP discovery)
		const scanned = await this.serversService.scanProjects(serverId);

		// Build a set of root_paths already used in THIS project
		const projectEnvs = await this.repo.findByProject(BigInt(projectId));
		const projectPaths = new Set(projectEnvs.map(e => e.root_path));

		// Annotate each result with a project-specific flag and filter to this server
		return scanned
			.filter(site => site.serverId === serverId)
			.map(site => ({
				...site,
				alreadyInThisProject: projectPaths.has(site.path),
			}));
	}

	/**
	 * SSH into the environment's server and return a sorted list of all MySQL
	 * table names in the WP database.  Uses stored DB credentials if available,
	 * otherwise falls back to parsing .env / config/application.php on the server.
	 */
	async listDbTables(envId: number): Promise<string[]> {
		const env = await this.findOne(envId);

		// Resolve SSH config for the server
		const sshConfig = await this.serversService.getServerSshConfig(
			Number(env.server_id),
		);
		const executor = createRemoteExecutor(sshConfig);

		// 1. Try stored encrypted credentials
		let creds = await this.repo.getDbCredentials(BigInt(envId));

		// 2. Fallback: parse .env from root_path
		if (!creds) {
			const rootPath = env.root_path.replace(/\/$/, '');
			const envRes = await executor
				.execute(`cat "${rootPath}/.env" 2>/dev/null || true`)
				.catch(() => null);
			if (envRes?.code === 0 && envRes.stdout.trim()) {
				const parsed = credentialParser.parseEnvFile(envRes.stdout);
				if (parsed) creds = parsed;
			}
		}

		// 3. Fallback: parse config/application.php
		if (!creds) {
			const rootPath = env.root_path.replace(/\/$/, '');
			const appRes = await executor
				.execute(`cat "${rootPath}/config/application.php" 2>/dev/null || true`)
				.catch(() => null);
			if (appRes?.code === 0 && appRes.stdout.trim()) {
				const parsed = credentialParser.parse(appRes.stdout);
				if (parsed) creds = parsed;
			}
		}

		if (!creds) {
			throw new BadRequestException(
				`No DB credentials found for environment ${envId}. ` +
					'Add credentials on the environment settings first.',
			);
		}

		// Write creds to a temp .my.cnf via base64 (safe: no shell-special chars)
		const cnfContent = `[client]\nhost=${creds.dbHost}\nuser=${creds.dbUser}\npassword=${creds.dbPassword}\n`;
		const cnfB64 = Buffer.from(cnfContent).toString('base64');
		const tmpDir = `/tmp/bf-dbt-${Date.now()}`;
		const cnfPath = `${tmpDir}/.my.cnf`;

		try {
			await executor.execute(`mkdir -p "${tmpDir}" && chmod 700 "${tmpDir}"`);
			await executor.execute(
				`echo '${cnfB64}' | base64 -d > "${cnfPath}" && chmod 600 "${cnfPath}"`,
			);

			const result = await executor.execute(
				`mysql --defaults-extra-file="${cnfPath}" "${creds.dbName}" -e "SHOW TABLES" 2>&1`,
			);

			if (result.code !== 0) {
				throw new InternalServerErrorException(
					`Failed to list tables: ${result.stdout.trim() || result.stderr?.trim() || 'unknown error'}`,
				);
			}

			// First line is the header "Tables_in_<db>" — skip it
			const tables = result.stdout
				.split('\n')
				.slice(1)
				.map(l => l.trim())
				.filter(l => l.length > 0)
				.sort();

			return tables;
		} finally {
			await executor.execute(`rm -rf "${tmpDir}"`).catch(() => {});
		}
	}

	/**
	 * SSH into the environment's server, deploy a PHP user-scanner script,
	 * and return all WordPress users with their roles.
	 *
	 * Credential resolution mirrors listDbTables — TypeScript credentialParser
	 * handles all real-world .env formats before falling back to PHP-side search.
	 */
	async getWpUsers(envId: number): Promise<WpUser[]> {
		const env = await this.findOne(envId);
		const sshConfig = await this.serversService.getServerSshConfig(
			Number(env.server_id),
		);
		const executor = createRemoteExecutor(sshConfig);

		const scriptsPath = join(__dirname, '../../../../worker/scripts');
		const ts = Date.now();
		const remoteScript = `/tmp/bf-wp-users-${ts}.php`;
		let remoteCredsFile = '';

		try {
			// ── Step 1: resolve DB credentials in TypeScript ─────────────────
			let creds = await this.repo.getDbCredentials(BigInt(envId));

			if (!creds && env.root_path) {
				const rootPath = env.root_path.replace(/\/$/, '');
				const envRes = await executor
					.execute(`cat "${rootPath}/.env" 2>/dev/null || true`)
					.catch(() => null);
				if (envRes?.code === 0 && envRes.stdout.trim()) {
					creds = credentialParser.parseEnvFile(envRes.stdout);
				}
			}

			if (!creds && env.root_path) {
				const rootPath = env.root_path.replace(/\/$/, '');
				const appRes = await executor
					.execute(
						`cat "${rootPath}/config/application.php" 2>/dev/null || true`,
					)
					.catch(() => null);
				if (appRes?.code === 0 && appRes.stdout.trim()) {
					creds = credentialParser.parse(appRes.stdout);
				}
			}

			// ── Step 2: push PHP script ───────────────────────────────────────
			const scriptContent = readFileSync(join(scriptsPath, 'wp-users.php'));
			await executor.pushFile({
				remotePath: remoteScript,
				content: scriptContent,
			});

			// ── Step 3: build command ─────────────────────────────────────────
			let phpCmd: string;
			if (creds) {
				// Write creds to a temp file (600) so the password is never
				// exposed in the process list via CLI args.
				remoteCredsFile = `/tmp/bf-wp-creds-${ts}.json`;
				const credsJson = JSON.stringify({
					dbHost: creds.dbHost,
					dbUser: creds.dbUser,
					dbPassword: creds.dbPassword,
					dbName: creds.dbName,
				});
				const credsB64 = Buffer.from(credsJson).toString('base64');
				await executor.execute(
					`echo ${shellEscape(credsB64)} | base64 -d > ${shellEscape(remoteCredsFile)} && chmod 600 ${shellEscape(remoteCredsFile)}`,
				);
				phpCmd = `php ${remoteScript} --creds-file=${shellEscape(remoteCredsFile)}`;
			} else {
				// Credentials not pre-resolved — let the PHP script search for
				// .env / wp-config.php on the remote filesystem as a last resort.
				phpCmd = `php ${remoteScript} --docroot=${shellEscape(env.root_path ?? '')}`;
			}

			const result = await executor.execute(phpCmd, { timeout: 30_000 });

			if (result.code !== 0) {
				throw new InternalServerErrorException(
					`wp-users scan failed: ${result.stderr?.trim() || result.stdout.trim() || 'unknown error'}`,
				);
			}

			const parsed = JSON.parse(result.stdout.trim()) as {
				users?: WpUser[];
				error?: string;
			};
			if (parsed.error) {
				throw new InternalServerErrorException(`wp-users: ${parsed.error}`);
			}
			return parsed.users ?? [];
		} finally {
			await executor
				.execute(`rm -f ${shellEscape(remoteScript)}`)
				.catch(() => {});
			if (remoteCredsFile) {
				await executor
					.execute(`rm -f ${shellEscape(remoteCredsFile)}`)
					.catch(() => {});
			}
		}
	}

	/**
	 * Deploy a self-deleting PHP quick-login file to the environment's web root.
	 * Returns the one-time login URL and its expiry timestamp (10 min from now).
	 */
	async createWpQuickLogin(
		envId: number,
		dto: WpQuickLoginDto,
	): Promise<{ loginUrl: string; expiresAt: string }> {
		const env = await this.findOne(envId);
		const sshConfig = await this.serversService.getServerSshConfig(
			Number(env.server_id),
		);
		const executor = createRemoteExecutor(sshConfig);

		// Generate a cryptographically random token
		const fileToken = randomBytes(12).toString('hex'); // used in filename
		const queryToken = randomBytes(24).toString('hex'); // used in ?t= param
		const expiryTs = Math.floor(Date.now() / 1000) + 10 * 60; // 10 minutes
		const filename = `bf-login-${fileToken}.php`;

		/* Determine web root:
		 *   Bedrock: root_path/web  (CyberPanel vhost root is public_html/web)
		 *   Standard WP: root_path
		 * Indicator: web/wp-config.php exists in Bedrock (same check as detectBedrock).
		 * NOTE: wp-load.php lives at web/wp/wp-load.php in Bedrock, NOT web/wp-load.php.
		 */
		const rootPath = env.root_path.replace(/\/$/, '');
		const bedrockCheckResult = await executor
			.execute(
				`test -f "${rootPath}/web/wp-config.php" && echo "bedrock" || echo "standard"`,
			)
			.catch(() => null);
		const isBedrock = bedrockCheckResult?.stdout?.trim() === 'bedrock';
		const webRoot = isBedrock ? `${rootPath}/web` : rootPath;
		const remotePath = `${webRoot}/${filename}`;

		// Build the PHP file from the template
		const scriptsPath = join(__dirname, '../../../../worker/scripts');
		const template = readFileSync(
			join(scriptsPath, 'wp-quick-login.php'),
			'utf-8',
		);
		const phpContent = template
			.replaceAll('{TOKEN}', queryToken)
			.replaceAll('{EXPIRY_TS}', String(expiryTs))
			.replaceAll('{USER_ID}', String(dto.userId));

		await executor.pushFile({ remotePath, content: Buffer.from(phpContent) });

		// 644: owner write, web server (www-data/nobody) needs read to serve the file.
		// Security comes from the unguessable filename + query token, not file perms.
		await executor.execute(`chmod 644 "${remotePath}"`).catch(() => {});

		const loginUrl = `${env.url.replace(/\/$/, '')}/${filename}?t=${queryToken}`;
		const expiresAt = new Date(expiryTs * 1000).toISOString();
		return { loginUrl, expiresAt };
	}

	/**
	 * Extract the registrable root domain from a hostname.
	 * e.g. blog.example.com → example.com
	 */
	private extractRegistrableDomain(hostname: string): string {
		const MULTI_TLD = new Set([
			'co.uk',
			'com.au',
			'co.nz',
			'org.uk',
			'net.au',
			'co.za',
		]);
		const parts = hostname.split('.');
		if (parts.length <= 2) return hostname;
		const twoLabel = parts.slice(-2).join('.');
		if (MULTI_TLD.has(twoLabel)) return parts.slice(-3).join('.');
		return twoLabel;
	}

	// ── PHP Info ──────────────────────────────────────────────────────────────

	async getPhpInfo(envId: number): Promise<Record<string, string>> {
		const env = await this.findOne(envId);
		const sshConfig = await this.serversService.getServerSshConfig(
			Number(env.server_id),
		);
		const executor = createRemoteExecutor(sshConfig);
		const cmd =
			`php -r "echo json_encode([` +
			`'memory_limit'=>ini_get('memory_limit'),` +
			`'max_execution_time'=>ini_get('max_execution_time'),` +
			`'upload_max_filesize'=>ini_get('upload_max_filesize'),` +
			`'post_max_size'=>ini_get('post_max_size'),` +
			`'display_errors'=>ini_get('display_errors'),` +
			`'php_version'=>PHP_VERSION]);" 2>/dev/null`;
		const result = await executor.execute(cmd, { timeout: 15_000 });
		if (result.code !== 0) {
			throw new InternalServerErrorException('PHP info fetch failed');
		}
		return JSON.parse(result.stdout.trim()) as Record<string, string>;
	}

	// ── Tags ──────────────────────────────────────────────────────────────────

	async addTag(envId: number, tagId: number) {
		await this.findOne(envId);
		return this.repo.addTag(BigInt(envId), BigInt(tagId));
	}

	async removeTag(envId: number, tagId: number) {
		await this.findOne(envId);
		return this.repo.removeTag(BigInt(envId), BigInt(tagId));
	}

	async listTags(envId: number) {
		await this.findOne(envId);
		return this.repo.listTags(BigInt(envId));
	}
}

function shellEscape(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}
