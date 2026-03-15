import {
	BadRequestException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
	buildWordPressSearchBases,
	deriveWordPressRuntimeCandidatesFromConfigPaths,
	deriveWordPressRuntimeCandidatesFromPathCandidates,
	expandWordPressPathCandidates,
	normalizeWordPressPath,
} from '../common/wordpress-paths';
import { WpRepository } from './wp.repository';
import { RunCommandRequestDto } from './dto/run-command-request.dto';
import { promisify } from 'util';

type DbSiteStateRow = {
	project_server_id: number;
	project_name: string | null;
	server_name: string | null;
	environment: string;
	wp_version: string | null;
	wp_update_available: string | null;
	php_version: string | null;
	plugins_count: number | null;
	plugins_update_count: number | null;
	themes_count: number | null;
	themes_update_count: number | null;
	users_count: number | null;
	last_scanned_at: Date | null;
	scan_error: string | null;
};

type DbUpdateHistoryRow = {
	id: number;
	project_server_id: number;
	update_type: string;
	package_name: string;
	from_version: string | null;
	to_version: string | null;
	status: string;
	applied_at: Date | null;
	error_message: string | null;
	created_at: Date;
};

type OwnedProjectServerContext = {
	project_server_id: number;
	project_name: string;
	environment: string;
	wp_path: string;
	server_id: number;
	server_name: string;
	hostname: string;
	ssh_user: string;
	ssh_port: number;
	ssh_key_path: string | null;
	ssh_password: string | null;
	ssh_private_key: string | null;
};

type ResolvedWpRuntimeContext = {
	wpRoot: string;
	wpPath: string;
	wpCommand: string;
};

@Injectable()
export class WpService {
	constructor(private readonly wpRepository: WpRepository) {}

	private readonly execFileAsync = promisify(execFile);

	private requireOwnerId(ownerId?: number) {
		if (!ownerId || !Number.isFinite(ownerId) || ownerId <= 0) {
			throw new UnauthorizedException({ detail: 'Authentication required' });
		}
		return ownerId;
	}

	private shellQuote(value: string) {
		return `'${value.replace(/'/g, `'"'"'`)}'`;
	}

	private normalizePath(input: string) {
		return normalizeWordPressPath(input);
	}

	private getWpRootCandidates(storedPath: string) {
		return expandWordPressPathCandidates([storedPath]);
	}

	private isWpPathResolutionError(errorSummary: string) {
		const normalized = errorSummary.toLowerCase();
		return [
			'no wordpress installation found',
			'does not seem to be a wordpress installation',
			'path is not a wordpress install',
			'this does not seem to be a wordpress installation',
		].some(fragment => normalized.includes(fragment));
	}

	private async resolveWpRuntimeContext(
		context: OwnedProjectServerContext,
		keyFilePath: string,
	): Promise<ResolvedWpRuntimeContext> {
		const directCandidates = deriveWordPressRuntimeCandidatesFromPathCandidates(
			this.getWpRootCandidates(context.wp_path),
		);
		const discoveredConfigPaths = await this.findRemoteWpConfigPaths(
			context,
			keyFilePath,
			buildWordPressSearchBases(this.getWpRootCandidates(context.wp_path)),
		);
		const discoveredCandidates =
			deriveWordPressRuntimeCandidatesFromConfigPaths(discoveredConfigPaths);
		const runtimeCandidates = [
			...discoveredCandidates,
			...directCandidates,
		].filter(
			(candidate, index, array) =>
				array.findIndex(
					entry =>
						entry.wpRoot === candidate.wpRoot &&
						entry.wpPath === candidate.wpPath,
				) === index,
		);

		const triedCandidates: string[] = [];
		for (const candidate of runtimeCandidates) {
			triedCandidates.push(`${candidate.wpRoot} -> ${candidate.wpPath}`);
			const resolved = await this.tryResolveWpRuntimeCandidate(
				context,
				keyFilePath,
				candidate,
			);
			if (resolved) {
				return resolved;
			}
		}

		throw new BadRequestException({
			detail: `No WordPress installation found for the configured wp_path. Tried: ${triedCandidates.join(' | ')}`,
		});
	}

	private async findRemoteWpConfigPaths(
		context: OwnedProjectServerContext,
		keyFilePath: string,
		searchBases: string[],
	) {
		const discovered: string[] = [];
		for (const base of searchBases) {
			const command = `find ${this.shellQuote(base)} -maxdepth 4 -type f -name 'wp-config.php' 2>/dev/null || true`;
			try {
				const result = await this.runSshCommand(context, command, keyFilePath);
				const lines = this.stripBenignSshWarnings(result.stdout || '')
					.split(/\r?\n/)
					.map(line => this.normalizePath(line))
					.filter(line => line.endsWith('/wp-config.php'));
				discovered.push(...lines);
			} catch {
				continue;
			}
		}

		return discovered.filter(
			(value, index, array) => array.indexOf(value) === index,
		);
	}

	private async tryResolveWpRuntimeCandidate(
		context: OwnedProjectServerContext,
		keyFilePath: string,
		candidate: { wpRoot: string; wpPath: string },
	): Promise<ResolvedWpRuntimeContext | null> {
		const command = [
			`ROOT=${this.shellQuote(candidate.wpRoot)}`,
			`WP_PATH=${this.shellQuote(candidate.wpPath)}`,
			`if [ -x "$ROOT/vendor/bin/wp" ]; then WP_CMD="$ROOT/vendor/bin/wp"; elif [ -x "$(dirname "$ROOT")/vendor/bin/wp" ]; then WP_CMD="$(dirname "$ROOT")/vendor/bin/wp"; elif command -v wp >/dev/null 2>&1; then WP_CMD="wp"; else echo __FORGE_WP_MISSING__; exit 0; fi`,
			`if [ -d "$WP_PATH/wp-admin" ] || [ -d "$WP_PATH/wp-includes" ] || [ -f "$WP_PATH/wp-load.php" ] || [ -f "$WP_PATH/wp-config.php" ] || [ -d "$WP_PATH/wp" ]; then printf '__FORGE_WP_OK__\\n%s\\n%s\\n%s' "$ROOT" "$WP_PATH" "$WP_CMD"; else printf '__FORGE_WP_INVALID__\\n%s\\n%s' "$ROOT" "$WP_PATH"; fi`,
		].join(' ; ');

		const result = await this.runSshCommand(context, command, keyFilePath);
		const lines = this.stripBenignSshWarnings(result.stdout || '')
			.split(/\r?\n/)
			.map(line => line.trim())
			.filter(Boolean);
		if (lines.includes('__FORGE_WP_MISSING__')) {
			throw new BadRequestException({
				detail: 'wp-cli not found on remote host',
			});
		}
		const markerIndex = lines.indexOf('__FORGE_WP_OK__');
		if (markerIndex >= 0 && lines.length >= markerIndex + 4) {
			return {
				wpRoot: lines[markerIndex + 1] || candidate.wpRoot,
				wpPath: lines[markerIndex + 2] || candidate.wpPath,
				wpCommand: lines[markerIndex + 3] || 'wp',
			};
		}

		return null;
	}

	private async persistResolvedWpPath(
		projectServerId: number,
		storedPath: string,
		resolvedPath: string,
	) {
		if (this.normalizePath(storedPath) === this.normalizePath(resolvedPath)) {
			return;
		}
		await this.wpRepository.persistResolvedWpPath(
			projectServerId,
			resolvedPath,
		);
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

	private async isReadableFile(filePath: string) {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	private async getSystemPrivateKey() {
		return this.wpRepository.getSystemPrivateKey();
	}

	private async resolveSshKeyPath(context: OwnedProjectServerContext) {
		let keyFilePath: string | undefined;
		let tempDirectory: string | undefined;

		if (context.ssh_key_path) {
			const expandedPath = this.expandHomePath(context.ssh_key_path);
			if (expandedPath && (await this.isReadableFile(expandedPath))) {
				keyFilePath = expandedPath;
			}
		}

		if (!keyFilePath) {
			const inlinePrivateKeyRaw =
				context.ssh_private_key && context.ssh_private_key.trim().length > 0
					? context.ssh_private_key
					: await this.getSystemPrivateKey();
			const inlinePrivateKey = inlinePrivateKeyRaw
				? inlinePrivateKeyRaw.replace(/\r\n/g, '\n').replace(/\\n/g, '\n')
				: null;

			if (inlinePrivateKey && inlinePrivateKey.trim().length > 0) {
				tempDirectory = await fs.mkdtemp(
					path.join(os.tmpdir(), 'forge-wp-ssh-'),
				);
				keyFilePath = path.join(tempDirectory, 'id_rsa');
				await fs.writeFile(keyFilePath, `${inlinePrivateKey.trim()}\n`, {
					encoding: 'utf-8',
					mode: 0o600,
				});
			}
		}

		return {
			keyFilePath,
			tempDirectory,
		};
	}

	private async runSshCommand(
		context: OwnedProjectServerContext,
		command: string,
		privateKeyPath?: string,
	) {
		const args = ['-p', String(context.ssh_port ?? 22), '-o', 'BatchMode=yes'];
		args.push('-o', 'LogLevel=ERROR');
		args.push('-o', 'StrictHostKeyChecking=no');
		args.push('-o', 'UserKnownHostsFile=/dev/null');
		if (privateKeyPath) {
			args.push('-i', privateKeyPath);
		}
		const target = `${context.ssh_user || 'root'}@${context.hostname}`;
		args.push(target, command);
		return this.execFileAsync('ssh', args, {
			timeout: 120000,
			maxBuffer: 1024 * 1024 * 2,
		});
	}

	private stripBenignSshWarnings(value: string) {
		return value
			.split(/\r?\n/)
			.map(line => line.trimEnd())
			.filter(
				line =>
					line.trim().length > 0 &&
					!/^Warning: Permanently added '.+' \(.+\) to the list of known hosts\.$/i.test(
						line.trim(),
					),
			)
			.join('\n')
			.trim();
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

		const stderr = this.stripBenignSshWarnings(
			typeof execError.stderr === 'string' ? execError.stderr : '',
		);
		const stdout = this.stripBenignSshWarnings(
			typeof execError.stdout === 'string' ? execError.stdout : '',
		);
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

	private async getOwnedProjectServerContext(
		projectServerId: number,
		ownerId: number,
	) {
		const row = await this.wpRepository.getOwnedProjectServerContext(
			projectServerId,
			ownerId,
		);
		if (!row.wp_path || row.wp_path.trim().length === 0) {
			throw new BadRequestException({
				detail: 'Environment wp_path is required for WP scan',
			});
		}
		return { ...row, wp_path: this.normalizePath(row.wp_path) };
	}

	private async persistScanFailure(projectServerId: number, scanError: string) {
		await this.wpRepository.persistScanFailure(projectServerId, scanError);
	}

	private async runWpScalarCommand(
		context: OwnedProjectServerContext,
		keyFilePath: string,
		resolvedRuntime: ResolvedWpRuntimeContext,
		cliArgs: string[],
	) {
		const operation = cliArgs.map(arg => this.shellQuote(arg)).join(' ');
		const command = [
			`ROOT=${this.shellQuote(resolvedRuntime.wpRoot)}`,
			`WP_PATH=${this.shellQuote(resolvedRuntime.wpPath)}`,
			`WP_CMD=${this.shellQuote(resolvedRuntime.wpCommand)}`,
			`cd "$ROOT" || exit 19`,
			`WP_CLI_ALLOW_ROOT=1 "$WP_CMD" --allow-root --skip-plugins --skip-themes --path="$WP_PATH" ${operation}`,
		].join(' ; ');

		try {
			const result = await this.runSshCommand(context, command, keyFilePath);
			const stdout = this.stripBenignSshWarnings(result.stdout || '');
			if (stdout.includes('__FORGE_WP_MISSING__')) {
				throw new BadRequestException({
					detail: 'wp-cli not found on remote host',
				});
			}
			return stdout.trim();
		} catch (error) {
			const summary = this.summarizeSshError(error);
			throw new Error(`wp ${cliArgs.join(' ')} failed: ${summary}`);
		}
	}

	/**
	 * Same as runWpScalarCommand but without --skip-plugins / --skip-themes.
	 * Required for plugin list and theme list commands which must enumerate
	 * the actual plugins/themes installed (including Bedrock paths).
	 */
	private async runWpCommandNoSkip(
		context: OwnedProjectServerContext,
		keyFilePath: string,
		resolvedRuntime: ResolvedWpRuntimeContext,
		cliArgs: string[],
	) {
		const operation = cliArgs.map(arg => this.shellQuote(arg)).join(' ');
		const command = [
			`ROOT=${this.shellQuote(resolvedRuntime.wpRoot)}`,
			`WP_PATH=${this.shellQuote(resolvedRuntime.wpPath)}`,
			`WP_CMD=${this.shellQuote(resolvedRuntime.wpCommand)}`,
			`cd "$ROOT" || exit 19`,
			`WP_CLI_ALLOW_ROOT=1 "$WP_CMD" --allow-root --path="$WP_PATH" ${operation}`,
		].join(' ; ');

		try {
			const result = await this.runSshCommand(context, command, keyFilePath);
			const stdout = this.stripBenignSshWarnings(result.stdout || '');
			if (stdout.includes('__FORGE_WP_MISSING__')) {
				throw new BadRequestException({
					detail: 'wp-cli not found on remote host',
				});
			}
			return stdout.trim();
		} catch (error) {
			const summary = this.summarizeSshError(error);
			throw new Error(`wp ${cliArgs.join(' ')} failed: ${summary}`);
		}
	}

	/**
	 * Fallback plugin listing via SSH filesystem scan.
	 * Tries Bedrock path (web/app/plugins) first, then classic (wp-content/plugins).
	 */
	private async scanPluginsViaFilesystem(
		context: OwnedProjectServerContext,
		keyFilePath: string,
		wpRoot: string,
	): Promise<
		Array<{ name: string; status: string; version: string; update: string }>
	> {
		const candidates = [
			`${wpRoot}/web/app/plugins`,
			`${wpRoot}/wp-content/plugins`,
		];
		for (const dir of candidates) {
			try {
				const cmd = `find ${this.shellQuote(dir)} -maxdepth 1 -mindepth 1 -type d 2>/dev/null || true`;
				const result = await this.runSshCommand(context, cmd, keyFilePath);
				const names = this.stripBenignSshWarnings(result.stdout || '')
					.split(/\r?\n/)
					.map(line => line.trim().split('/').pop() ?? '')
					.filter(name => name.length > 0);
				if (names.length > 0) {
					return names.map(name => ({
						name,
						status: 'unknown',
						version: 'unknown',
						update: 'none',
					}));
				}
			} catch {
				continue;
			}
		}
		return [];
	}

	/**
	 * Fallback theme listing via SSH filesystem scan.
	 * Tries Bedrock path (web/app/themes) first, then classic (wp-content/themes).
	 */
	private async scanThemesViaFilesystem(
		context: OwnedProjectServerContext,
		keyFilePath: string,
		wpRoot: string,
	): Promise<
		Array<{ name: string; status: string; version: string; update: string }>
	> {
		const candidates = [
			`${wpRoot}/web/app/themes`,
			`${wpRoot}/wp-content/themes`,
		];
		for (const dir of candidates) {
			try {
				const cmd = `find ${this.shellQuote(dir)} -maxdepth 1 -mindepth 1 -type d 2>/dev/null || true`;
				const result = await this.runSshCommand(context, cmd, keyFilePath);
				const names = this.stripBenignSshWarnings(result.stdout || '')
					.split(/\r?\n/)
					.map(line => line.trim().split('/').pop() ?? '')
					.filter(name => name.length > 0);
				if (names.length > 0) {
					return names.map(name => ({
						name,
						status: 'unknown',
						version: 'unknown',
						update: 'none',
					}));
				}
			} catch {
				continue;
			}
		}
		return [];
	}

	private async ensureOwnedProjectServer(
		projectServerId: number,
		ownerId?: number,
	) {
		const resolvedOwnerId = this.requireOwnerId(ownerId);
		await this.wpRepository.ensureOwnedProjectServer(
			projectServerId,
			resolvedOwnerId,
		);
	}

	async getSiteState(projectServerId: number, ownerId?: number) {
		const resolvedOwnerId = this.requireOwnerId(ownerId);
		const row = await this.wpRepository.getSiteState(
			projectServerId,
			resolvedOwnerId,
		);

		return {
			project_server_id: row.project_server_id,
			project_name: row.project_name,
			server_name: row.server_name,
			environment: row.environment,
			wp_version: row.wp_version,
			wp_update_available: row.wp_update_available,
			php_version: row.php_version,
			plugins_count: row.plugins_count ?? 0,
			plugins_update_count: row.plugins_update_count ?? 0,
			themes_count: row.themes_count ?? 0,
			themes_update_count: row.themes_update_count ?? 0,
			users_count: row.users_count ?? 0,
			last_scanned_at: row.last_scanned_at,
			scan_error: row.scan_error,
		};
	}

	async triggerSiteScan(projectServerId: number, ownerId?: number) {
		const resolvedOwnerId = this.requireOwnerId(ownerId);
		const context = await this.getOwnedProjectServerContext(
			projectServerId,
			resolvedOwnerId,
		);

		let keyFilePath: string | undefined;
		let tempDirectory: string | undefined;
		try {
			const resolved = await this.resolveSshKeyPath(context);
			keyFilePath = resolved.keyFilePath;
			tempDirectory = resolved.tempDirectory;

			if (!keyFilePath && context.ssh_password) {
				throw new BadRequestException({
					detail:
						'SSH password auth is configured, but non-interactive WP scan requires SSH key auth.',
				});
			}
			if (!keyFilePath) {
				throw new BadRequestException({
					detail: 'No readable SSH key is configured for this environment',
				});
			}

			const resolvedRuntime = await this.resolveWpRuntimeContext(
				context,
				keyFilePath,
			);
			await this.persistResolvedWpPath(
				projectServerId,
				context.wp_path,
				resolvedRuntime.wpRoot,
			);

			const wpVersion = await this.runWpScalarCommand(
				context,
				keyFilePath,
				resolvedRuntime,
				['core', 'version'],
			);
			const phpVersion = await this.runWpScalarCommand(
				context,
				keyFilePath,
				resolvedRuntime,
				['eval', 'echo PHP_VERSION;'],
			);
			// Plugin listing: use runWpCommandNoSkip so Bedrock plugin paths are enumerated.
			// Falls back to SSH filesystem scan if wp-cli fails (e.g. not installed).
			let plugins: unknown[];
			let pluginsUpdates: unknown[];
			try {
				const pluginsRaw = await this.runWpCommandNoSkip(
					context,
					keyFilePath,
					resolvedRuntime,
					['plugin', 'list', '--format=json'],
				);
				plugins = JSON.parse(pluginsRaw) as unknown[];
				try {
					const pluginsUpdateRaw = await this.runWpCommandNoSkip(
						context,
						keyFilePath,
						resolvedRuntime,
						['plugin', 'list', '--update=available', '--format=json'],
					);
					pluginsUpdates = JSON.parse(pluginsUpdateRaw) as unknown[];
				} catch {
					pluginsUpdates = [];
				}
			} catch {
				plugins = await this.scanPluginsViaFilesystem(
					context,
					keyFilePath,
					resolvedRuntime.wpRoot,
				);
				pluginsUpdates = [];
			}

			// Theme listing: same pattern — no --skip-plugins/themes, with filesystem fallback.
			let themes: unknown[];
			let themesUpdates: unknown[];
			try {
				const themesRaw = await this.runWpCommandNoSkip(
					context,
					keyFilePath,
					resolvedRuntime,
					['theme', 'list', '--format=json'],
				);
				themes = JSON.parse(themesRaw) as unknown[];
				try {
					const themesUpdateRaw = await this.runWpCommandNoSkip(
						context,
						keyFilePath,
						resolvedRuntime,
						['theme', 'list', '--update=available', '--format=json'],
					);
					themesUpdates = JSON.parse(themesUpdateRaw) as unknown[];
				} catch {
					themesUpdates = [];
				}
			} catch {
				themes = await this.scanThemesViaFilesystem(
					context,
					keyFilePath,
					resolvedRuntime.wpRoot,
				);
				themesUpdates = [];
			}

			const usersCountRaw = await this.runWpScalarCommand(
				context,
				keyFilePath,
				resolvedRuntime,
				['user', 'list', '--format=count'],
			);
			const coreUpdatesRaw = await this.runWpScalarCommand(
				context,
				keyFilePath,
				resolvedRuntime,
				['core', 'check-update', '--format=json'],
			);

			const coreUpdates = JSON.parse(coreUpdatesRaw) as Array<{
				version?: string;
			}>;
			const wpVersionAvailable = coreUpdates[0]?.version ?? null;
			const usersCountParsed = Number.parseInt(usersCountRaw, 10);

			await this.wpRepository.upsertSiteState(projectServerId, {
				wpVersion: wpVersion || null,
				wpVersionAvailable,
				phpVersion: phpVersion || null,
				plugins,
				themes,
				pluginsCount: plugins.length,
				pluginsUpdateCount: pluginsUpdates.length,
				themesCount: themes.length,
				themesUpdateCount: themesUpdates.length,
				usersCount: Number.isFinite(usersCountParsed) ? usersCountParsed : 0,
			});

			return {
				status: 'completed',
				message: 'WP scan completed',
				project_server_id: context.project_server_id,
				project_name: context.project_name,
				environment: context.environment,
				wp_version: wpVersion,
				wp_version_available: wpVersionAvailable,
				php_version: phpVersion,
				plugins_count: plugins.length,
				plugins_update_count: pluginsUpdates.length,
				themes_count: themes.length,
				themes_update_count: themesUpdates.length,
				users_count: Number.isFinite(usersCountParsed) ? usersCountParsed : 0,
			};
		} catch (error) {
			const detail =
				error instanceof BadRequestException
					? JSON.stringify(error.getResponse())
					: error instanceof Error
						? error.message
						: this.summarizeSshError(error);
			const scanError = detail.slice(0, 500);
			await this.persistScanFailure(projectServerId, scanError);
			return {
				status: 'failed',
				message: 'WP scan failed',
				project_server_id: context.project_server_id,
				error: scanError,
			};
		} finally {
			if (tempDirectory) {
				await fs.rm(tempDirectory, { recursive: true, force: true });
			}
		}
	}

	async getPendingUpdates(ownerId?: number) {
		const resolvedOwnerId = this.requireOwnerId(ownerId);
		const rows = await this.wpRepository.getPendingUpdates(resolvedOwnerId);

		const updates: Array<Record<string, unknown>> = [];
		for (const row of rows) {
			if (!row.wp_update_available) {
				continue;
			}

			updates.push({
				project_server_id: row.project_server_id,
				project_name: row.project_name ?? '',
				server_name: row.server_name ?? '',
				environment: row.environment,
				update_type: 'core',
				package_name: 'wordpress',
				current_version: row.wp_version ?? 'unknown',
				available_version: row.wp_update_available,
			});
		}

		const sitesWithUpdates = new Set(
			updates.map(update => Number(update.project_server_id ?? 0)),
		).size;

		return {
			total_sites: rows.length,
			sites_with_updates: sitesWithUpdates,
			total_updates: updates.length,
			updates,
		};
	}

	async runCommand(payload: RunCommandRequestDto, ownerId?: number) {
		const resolvedOwnerId = this.requireOwnerId(ownerId);
		await this.ensureOwnedProjectServer(payload.project_server_id, ownerId);

		const taskId = randomUUID();
		const details = JSON.stringify({
			command: payload.command,
			args: payload.args ?? [],
			status: 'queued',
			task_id: taskId,
		});

		await this.wpRepository.insertAuditLog(
			resolvedOwnerId,
			String(payload.project_server_id),
			details,
		);

		return {
			task_id: taskId,
			status: 'queued',
			message: 'Command queued',
		};
	}

	async triggerBulkUpdate(
		payload: {
			update_type?: string;
			project_server_ids?: number[];
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = this.requireOwnerId(ownerId);
		const projectServerIds = payload.project_server_ids ?? [];
		const ids = await this.wpRepository.getBulkUpdateProjectServerIds(
			resolvedOwnerId,
			projectServerIds,
		);

		if (!ids.length) {
			throw new BadRequestException({ detail: 'No sites found to update' });
		}

		const updateType = (payload.update_type ?? 'all').toLowerCase();
		const queued = ['core', 'all'].includes(updateType) ? ids.length : 0;

		return {
			task_id: randomUUID(),
			sites_queued: queued,
			message: `Update queued for ${queued} sites`,
		};
	}

	async getUpdateHistory(
		projectServerId?: number,
		limit = 50,
		ownerId?: number,
	) {
		const resolvedOwnerId = this.requireOwnerId(ownerId);
		const safeLimit = Math.max(1, Math.min(200, limit));

		const rows = await this.wpRepository.getUpdateHistory(
			resolvedOwnerId,
			projectServerId,
			safeLimit,
		);

		return {
			total: rows.length,
			updates: rows.map(row => ({
				id: row.id,
				project_server_id: row.project_server_id,
				update_type: row.update_type,
				package_name: row.package_name,
				from_version: row.from_version,
				to_version: row.to_version,
				status: row.status,
				applied_at: row.applied_at,
				error_message: row.error_message,
			})),
		};
	}

	/**
	 * Scans a single site without an ownership check — for use by WpRunnerService only.
	 * Fetches the project-server context without owner filtering, then runs the full scan.
	 */
	async triggerSiteScanForRunner(projectServerId: number) {
		const rawContext =
			await this.wpRepository.getProjectServerContextUnscoped(projectServerId);
		if (!rawContext.wp_path || rawContext.wp_path.trim().length === 0) {
			return;
		}
		const context = {
			...rawContext,
			wp_path: this.normalizePath(rawContext.wp_path),
		};

		let keyFilePath: string | undefined;
		let tempDirectory: string | undefined;
		try {
			const resolved = await this.resolveSshKeyPath(context);
			keyFilePath = resolved.keyFilePath;
			tempDirectory = resolved.tempDirectory;

			if (!keyFilePath) {
				// Cannot scan without key auth
				await this.wpRepository.persistScanFailure(
					projectServerId,
					'No SSH key configured — runner cannot scan this environment',
				);
				return;
			}

			const resolvedRuntime = await this.resolveWpRuntimeContext(
				context,
				keyFilePath,
			);
			await this.persistResolvedWpPath(
				projectServerId,
				context.wp_path,
				resolvedRuntime.wpRoot,
			);

			const wpVersion = await this.runWpScalarCommand(
				context,
				keyFilePath,
				resolvedRuntime,
				['core', 'version'],
			);
			const phpVersion = await this.runWpScalarCommand(
				context,
				keyFilePath,
				resolvedRuntime,
				['eval', 'echo PHP_VERSION;'],
			);

			let plugins: unknown[];
			let pluginsUpdates: unknown[];
			try {
				const pluginsRaw = await this.runWpCommandNoSkip(
					context,
					keyFilePath,
					resolvedRuntime,
					['plugin', 'list', '--format=json'],
				);
				plugins = JSON.parse(pluginsRaw) as unknown[];
				try {
					const pluginsUpdateRaw = await this.runWpCommandNoSkip(
						context,
						keyFilePath,
						resolvedRuntime,
						['plugin', 'list', '--update=available', '--format=json'],
					);
					pluginsUpdates = JSON.parse(pluginsUpdateRaw) as unknown[];
				} catch {
					pluginsUpdates = [];
				}
			} catch {
				plugins = await this.scanPluginsViaFilesystem(
					context,
					keyFilePath,
					resolvedRuntime.wpRoot,
				);
				pluginsUpdates = [];
			}

			let themes: unknown[];
			let themesUpdates: unknown[];
			try {
				const themesRaw = await this.runWpCommandNoSkip(
					context,
					keyFilePath,
					resolvedRuntime,
					['theme', 'list', '--format=json'],
				);
				themes = JSON.parse(themesRaw) as unknown[];
				try {
					const themesUpdateRaw = await this.runWpCommandNoSkip(
						context,
						keyFilePath,
						resolvedRuntime,
						['theme', 'list', '--update=available', '--format=json'],
					);
					themesUpdates = JSON.parse(themesUpdateRaw) as unknown[];
				} catch {
					themesUpdates = [];
				}
			} catch {
				themes = await this.scanThemesViaFilesystem(
					context,
					keyFilePath,
					resolvedRuntime.wpRoot,
				);
				themesUpdates = [];
			}

			const usersCountRaw = await this.runWpScalarCommand(
				context,
				keyFilePath,
				resolvedRuntime,
				['user', 'list', '--format=count'],
			);
			const coreUpdatesRaw = await this.runWpScalarCommand(
				context,
				keyFilePath,
				resolvedRuntime,
				['core', 'check-update', '--format=json'],
			);

			const coreUpdates = JSON.parse(coreUpdatesRaw) as Array<{
				version?: string;
			}>;
			const wpVersionAvailable = coreUpdates[0]?.version ?? null;
			const usersCountParsed = Number.parseInt(usersCountRaw, 10);

			await this.wpRepository.upsertSiteState(projectServerId, {
				wpVersion: wpVersion || null,
				wpVersionAvailable,
				phpVersion: phpVersion || null,
				plugins,
				themes,
				pluginsCount: plugins.length,
				pluginsUpdateCount: pluginsUpdates.length,
				themesCount: themes.length,
				themesUpdateCount: themesUpdates.length,
				usersCount: Number.isFinite(usersCountParsed) ? usersCountParsed : 0,
			});
		} catch (error) {
			const detail =
				error instanceof BadRequestException
					? JSON.stringify(error.getResponse())
					: error instanceof Error
						? error.message
						: this.summarizeSshError(error);
			await this.wpRepository.persistScanFailure(
				projectServerId,
				detail.slice(0, 500),
			);
		} finally {
			if (tempDirectory) {
				await fs.rm(tempDirectory, { recursive: true, force: true });
			}
		}
	}
}
