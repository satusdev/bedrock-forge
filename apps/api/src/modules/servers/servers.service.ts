import {
	Injectable,
	NotFoundException,
	BadRequestException,
	Logger,
} from '@nestjs/common';
import { ServersRepository } from './servers.repository';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { SettingsService } from '../settings/settings.service';
import {
	createRemoteExecutor,
	credentialParser,
} from '@bedrock-forge/remote-executor';
import { CreateServerDto, UpdateServerDto } from './dto/server.dto';
import {
	DetectBedrockDto,
	BedrockDetectionResult,
} from './dto/detect-bedrock.dto';
import { ScannedProject, ScanProjectsMultiDto } from './dto/scan-projects.dto';

@Injectable()
export class ServersService {
	private readonly logger = new Logger(ServersService.name);

	constructor(
		private readonly repo: ServersRepository,
		private readonly enc: EncryptionService,
		private readonly settings: SettingsService,
	) {}

	findAll(opts: { page?: number; limit?: number; search?: string } = {}) {
		return this.repo.findAll(opts);
	}

	async findOne(id: number) {
		const server = await this.repo.findById(BigInt(id));
		if (!server) throw new NotFoundException(`Server ${id} not found`);
		return server;
	}

	create(dto: CreateServerDto) {
		return this.repo.create(dto);
	}

	async update(id: number, dto: UpdateServerDto) {
		await this.findOne(id);
		return this.repo.update(BigInt(id), dto);
	}

	async remove(id: number) {
		await this.findOne(id);
		return this.repo.delete(BigInt(id));
	}

	/**
	 * Resolve a usable SSH private key for the given server.
	 * 1. Decrypt the per-server key and validate it is a real PEM/OpenSSH key.
	 * 2. If the per-server key is missing, decryption fails, or the decrypted
	 *    value is not a valid key (e.g. the seed placeholder "REPLACE_ME"),
	 *    fall back to the global SSH key from Settings.
	 * 3. Throw BadRequestException if neither source yields a valid key.
	 */
	private async resolvePrivateKey(server: {
		name: string;
		ssh_private_key_encrypted: string;
	}): Promise<string> {
		if (server.ssh_private_key_encrypted) {
			try {
				const decrypted = this.enc.decrypt(server.ssh_private_key_encrypted);
				if (decrypted && decrypted.trimStart().startsWith('-----BEGIN')) {
					return decrypted;
				}
			} catch {
				// Decryption failed (wrong ENCRYPTION_KEY or corrupted) — try global
			}
		}

		const globalKey = await this.settings.getDecrypted(
			'global_ssh_private_key',
		);
		if (globalKey && globalKey.trimStart().startsWith('-----BEGIN')) {
			return globalKey;
		}

		throw new BadRequestException(
			`No valid SSH key available for server "${server.name}". ` +
				'Set a PEM-formatted private key on the server edit page, ' +
				'or configure a global SSH key in Settings → SSH Key.',
		);
	}

	/** Execute a quick `echo ok` to verify SSH connectivity, and probe CyberPanel version */
	async testConnection(
		id: number,
	): Promise<{ success: boolean; message: string; cyberpanelVersion?: string }> {
		const server = await this.repo.findByIdWithKey(BigInt(id));
		if (!server) throw new NotFoundException(`Server ${id} not found`);

		const privateKey = await this.resolvePrivateKey(server);

		const executor = createRemoteExecutor({
			host: server.ip_address,
			port: server.ssh_port,
			username: server.ssh_user,
			privateKey,
		});

		try {
			const result = await executor.execute('echo ok');
			const success = result.code === 0;
			await this.repo.updateStatus(BigInt(id), success ? 'online' : 'offline');

			let cyberpanelVersion: string | undefined;
			if (success) {
				try {
					const versionResult = await executor.execute(
						"cat /usr/local/CyberCP/version.txt 2>/dev/null || echo ''",
				);
					const detected = versionResult.stdout.trim();
					if (detected) {
						cyberpanelVersion = detected;
						await this.repo
							.updateCyberPanelVersion(BigInt(id), detected)
							.catch(() => {});
					} else {
						// CyberPanel not installed — clear any stale version
						await this.repo
							.updateCyberPanelVersion(BigInt(id), null)
							.catch(() => {});
					}
				} catch {
					// Version detection is non-critical — ignore failures
				}
			}

			return { success, message: result.stdout.trim(), cyberpanelVersion };
		} catch (err: unknown) {
			await this.repo.updateStatus(BigInt(id), 'offline').catch(() => {});
			return {
				success: false,
				message: err instanceof Error ? err.message : String(err),
			};
		}
	}

	/**
	 * SSH into a server, probe the given path, and decide if it is a Bedrock WP install.
	 * Returns structured detection results including DB credentials parsed from .env.
	 */
	async detectBedrock(
		id: number,
		path: string,
	): Promise<BedrockDetectionResult> {
		const server = await this.repo.findByIdWithKey(BigInt(id));
		if (!server) throw new NotFoundException(`Server ${id} not found`);

		const privateKey = await this.resolvePrivateKey(server);

		const executor = createRemoteExecutor({
			host: server.ip_address,
			port: server.ssh_port,
			username: server.ssh_user,
			privateKey,
		});

		const rootPath = path.endsWith('/') ? path.slice(0, -1) : path;

		// Check existence of key files
		const checkFile = async (filePath: string): Promise<boolean> => {
			try {
				const r = await executor.execute(
					`test -f "${filePath}" && echo found || echo missing`,
				);
				return r.stdout.trim() === 'found';
			} catch {
				return false;
			}
		};

		const readFile = async (filePath: string): Promise<string | null> => {
			try {
				const r = await executor.execute(`cat "${filePath}"`);
				return r.code === 0 ? r.stdout : null;
			} catch {
				return null;
			}
		};

		const [hasComposer, hasAppConfig, hasEnvFile, hasWpConfig] =
			await Promise.all([
				checkFile(`${rootPath}/composer.json`),
				checkFile(`${rootPath}/config/application.php`),
				checkFile(`${rootPath}/.env`),
				checkFile(`${rootPath}/web/wp-config.php`),
			]);

		const isBedrock = hasAppConfig || (hasComposer && hasEnvFile);
		const isWordPress = hasWpConfig || isBedrock;

		// Parse composer.json for project name
		let composerJson: Record<string, unknown> | undefined;
		let projectName = rootPath.split('/').pop() ?? 'Unknown';
		if (hasComposer) {
			const raw = await readFile(`${rootPath}/composer.json`);
			if (raw) {
				try {
					composerJson = JSON.parse(raw) as Record<string, unknown>;
					if (typeof composerJson['name'] === 'string') {
						projectName = composerJson['name'].split('/').pop() ?? projectName;
					}
				} catch {
					/* ignore */
				}
			}
		}

		// Parse .env for DB credentials and WP_HOME
		let dbCredentials: BedrockDetectionResult['dbCredentials'];
		let siteUrl: string | undefined;
		if (hasEnvFile) {
			const raw = await readFile(`${rootPath}/.env`);
			if (raw) {
				const creds = credentialParser.parseEnvFile(raw);
				if (creds) {
					dbCredentials = {
						dbName: creds.dbName,
						dbUser: creds.dbUser,
						dbPassword: creds.dbPassword,
						dbHost: creds.dbHost,
					};
				}
				// Extract WP_HOME from .env lines
				const homeLine = raw.split('\n').find(l => l.startsWith('WP_HOME='));
				if (homeLine)
					siteUrl = homeLine.split('=')[1]?.trim().replace(/["']/g, '');
			}
		}

		// Fallback: try config/application.php if no DB creds yet
		if (!dbCredentials && hasAppConfig) {
			const raw = await readFile(`${rootPath}/config/application.php`);
			if (raw) {
				const creds = credentialParser.parse(raw);
				if (creds) {
					dbCredentials = {
						dbName: creds.dbName,
						dbUser: creds.dbUser,
						dbPassword: creds.dbPassword,
						dbHost: creds.dbHost,
					};
				}
			}
		}

		return {
			isBedrock,
			isWordPress,
			projectName,
			siteUrl,
			dbCredentials,
			composerJson,
			detectedPaths: {
				config: hasAppConfig ? `${rootPath}/config/application.php` : '',
				webRoot: hasWpConfig ? `${rootPath}/web` : rootPath,
			},
		};
	}

	// SSH into a server, run one shell command that iterates /home/{user}/public_html,
	// parses .env / wp-config.php for each site, and returns structured results.
	// Deduplicates against existing Environment records in the DB.
	async scanProjects(id: number): Promise<ScannedProject[]> {
		const server = await this.repo.findByIdWithKey(BigInt(id));
		if (!server) throw new NotFoundException(`Server ${id} not found`);

		const privateKey = await this.resolvePrivateKey(server);

		const executor = createRemoteExecutor({
			host: server.ip_address,
			port: server.ssh_port,
			username: server.ssh_user,
			privateKey,
		});

		// Single SSH command: iterate /home/*/public_html, emit delimited blocks
		const scanCmd = [
			`for dir in /home/*/public_html; do`,
			`  [ -d "$dir" ] || continue;`,
			`  [ -f "$dir/.env" ] || [ -f "$dir/wp-config.php" ] || [ -f "$dir/web/wp-config.php" ] || continue;`,
			`  echo '===START===';`,
			`  echo "PATH=$dir";`,
			`  if [ -f "$dir/composer.json" ]; then echo '===COMPOSER==='; head -c 10240 "$dir/composer.json"; fi;`,
			`  if [ -f "$dir/.env" ]; then echo '===ENV==='; head -c 10240 "$dir/.env"; fi;`,
			`  if [ -f "$dir/web/wp-config.php" ]; then echo '===WPCONFIG==='; head -c 10240 "$dir/web/wp-config.php"; fi;`,
			`  if [ -f "$dir/wp-config.php" ]; then echo '===WPCONFIG==='; head -c 10240 "$dir/wp-config.php"; fi;`,
			`  echo '===END===';`,
			`done`,
		].join(' ');

		let raw: string;
		try {
			const result = await executor.execute(scanCmd, { timeout: 60_000 });
			raw = result.stdout;
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			throw new BadRequestException(
				`SSH scan failed for server "${server.name}": ${msg}`,
			);
		}

		// Split output into per-project blocks
		const blocks = raw.split('===START===').slice(1);
		const discovered: Array<{
			path: string;
			name: string;
			isBedrock: boolean;
			isWordPress: boolean;
			siteUrl?: string;
			mainDomain?: string;
			dbCredentials?: ScannedProject['dbCredentials'];
		}> = [];

		for (const block of blocks) {
			const endIdx = block.indexOf('===END===');
			const content = endIdx >= 0 ? block.slice(0, endIdx) : block;

			// Extract PATH
			const pathMatch = content.match(/^PATH=(.+)/m);
			if (!pathMatch) continue;
			const sitePath = pathMatch[1].trim();

			// Extract sections
			const composerRaw = this.extractSection(content, 'COMPOSER');
			const envRaw = this.extractSection(content, 'ENV');
			const wpConfigRaw = this.extractSection(content, 'WPCONFIG');

			// Determine site type
			const hasComposer = composerRaw !== null;
			const hasEnv = envRaw !== null;
			const hasWpConfig = wpConfigRaw !== null;
			const isBedrock =
				hasEnv && (hasComposer || content.includes('application.php'));
			const isWordPress = hasWpConfig || isBedrock;

			if (!isWordPress) continue;

			// Derive project name: prefer domain from siteUrl, fall back to composer/dir
			let name =
				sitePath.split('/').filter(Boolean).slice(-2, -1)[0] ??
				sitePath.split('/').pop() ??
				'Unknown';
			if (composerRaw) {
				try {
					const pkg = JSON.parse(composerRaw) as Record<string, unknown>;
					if (typeof pkg['name'] === 'string') {
						name = pkg['name'].split('/').pop() ?? name;
					}
				} catch {
					/* ignore */
				}
			}

			// Parse DB credentials and extract siteUrl
			let dbCredentials: ScannedProject['dbCredentials'];
			let siteUrl: string | undefined;

			if (envRaw) {
				const creds = credentialParser.parseEnvFile(envRaw);
				if (creds) dbCredentials = creds;
				const homeLine = envRaw
					.split('\n')
					.find(l => l.startsWith('WP_HOME=') || l.startsWith('SITE_URL='));
				if (homeLine) {
					siteUrl = homeLine
						.split('=')
						.slice(1)
						.join('=')
						.trim()
						.replace(/["']/g, '');
				}
			}
			if (!dbCredentials && wpConfigRaw) {
				const creds = credentialParser.parse(wpConfigRaw);
				if (creds) dbCredentials = creds;
			}

			// Prefer the site URL hostname as the project name (e.g. example.com)
			let mainDomain: string | undefined;
			if (siteUrl) {
				try {
					const hostname = new URL(siteUrl).hostname.toLowerCase();
					if (hostname) name = hostname;
					mainDomain = this.extractMainDomain(hostname);
					// Only set mainDomain when it actually differs from hostname
					if (mainDomain === hostname) mainDomain = undefined;
				} catch {
					/* ignore malformed URL */
				}
			}

			discovered.push({
				path: sitePath,
				name,
				isBedrock,
				isWordPress,
				siteUrl,
				dbCredentials,
				mainDomain,
			});
		}

		// Dedup: find which paths already exist as environments on this server
		const allPaths = discovered.map(d => d.path);
		const existing = await this.repo.findExistingEnvironmentPaths(
			BigInt(id),
			allPaths,
		);
		const existingMap = new Map(
			existing.map(e => [e.root_path, e.project_id.toString()]),
		);

		return discovered.map(d => ({
			...d,
			hasDbCredentials: d.dbCredentials !== undefined,
			alreadyImported: existingMap.has(d.path),
			existingProjectId: existingMap.get(d.path),
			serverId: id,
			serverName: server.name,
		}));
	}

	/**
	 * Scan multiple servers in parallel and merge results.
	 * Uses Promise.allSettled so a single failing server does not abort the rest.
	 */
	async scanProjectsMulti(
		dto: ScanProjectsMultiDto,
	): Promise<ScannedProject[]> {
		const results = await Promise.allSettled(
			dto.serverIds.map(sid => this.scanProjects(sid)),
		);
		const merged: ScannedProject[] = [];
		const errors: string[] = [];
		for (const result of results) {
			if (result.status === 'fulfilled') {
				merged.push(...result.value);
			} else {
				const msg =
					result.reason instanceof Error
						? result.reason.message
						: String(result.reason);
				this.logger.warn(`[scanProjectsMulti] Server scan failed: ${msg}`);
				errors.push(msg);
			}
		}
		// If every server failed, surface the errors instead of returning empty
		if (merged.length === 0 && errors.length > 0) {
			throw new BadRequestException(errors.join(' | '));
		}
		return merged;
	}

	/** Extract the registrable root domain (last two labels, or last three for
	 *  known multi-part second-level TLDs like .co.uk).
	 */
	private extractMainDomain(hostname: string): string {
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

	/** Extract the content of a ===MARKER=== section from a scan block */
	private extractSection(block: string, marker: string): string | null {
		const startTag = `===${marker}===`;
		const startIdx = block.indexOf(startTag);
		if (startIdx < 0) return null;
		const after = block.slice(startIdx + startTag.length);
		// End at the next ===...=== marker or ===END===
		const nextMarker = after.search(/===\w+===/);
		const content = nextMarker >= 0 ? after.slice(0, nextMarker) : after;
		return content.trim() || null;
	}
}
