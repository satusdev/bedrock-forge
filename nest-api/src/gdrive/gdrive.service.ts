import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { DriveRuntimeConfigService } from '../drive-runtime/drive-runtime-config.service';
import { PrismaService } from '../prisma/prisma.service';

type RcloneLsjsonEntry = {
	Path?: string;
	Name?: string;
	ID?: string;
	IsDir?: boolean;
};

@Injectable()
export class GdriveService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly driveRuntimeConfigService: DriveRuntimeConfigService,
	) {}

	private normalizePath(value: string | null | undefined) {
		return (value ?? '').trim().replace(/^\/+|\/+$/g, '');
	}

	private isDriveFolderId(value: string | null | undefined) {
		return /^[A-Za-z0-9_-]{10,}$/.test((value ?? '').trim());
	}

	private async runRcloneJson(args: string[]) {
		return new Promise<RcloneLsjsonEntry[]>((resolvePromise, rejectPromise) => {
			const child = spawn('rclone', args, {
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			let stdout = '';
			let stderr = '';

			child.stdout.on('data', chunk => {
				stdout += chunk.toString();
			});

			child.stderr.on('data', chunk => {
				stderr += chunk.toString();
			});

			child.on('error', error => {
				rejectPromise(error);
			});

			child.on('close', code => {
				if (code !== 0) {
					rejectPromise(
						new Error(
							`rclone exited with code ${code ?? 'unknown'}${stderr ? `: ${stderr.trim()}` : ''}`,
						),
					);
					return;
				}

				try {
					const parsed = JSON.parse(stdout) as RcloneLsjsonEntry[];
					resolvePromise(parsed);
				} catch (error) {
					rejectPromise(
						new Error(
							`Failed to parse rclone JSON output${
								error instanceof Error ? `: ${error.message}` : ''
							}`,
						),
					);
				}
			});
		});
	}

	private buildRemoteTarget(remoteName: string, pathOrId?: string) {
		const target = this.normalizePath(pathOrId);
		if (!target) {
			return `${remoteName}:`;
		}
		if (this.isDriveFolderId(target) && !target.includes('/')) {
			return `${remoteName},root_folder_id=${target}:`;
		}
		return `${remoteName}:${target}`;
	}

	private async listFolderSet(options: {
		remoteName: string;
		configPath: string;
		path?: string;
		query?: string;
		maxResults: number;
		includeShared: boolean;
		source: 'base' | 'shared';
	}) {
		const query = (options.query ?? '').trim().toLowerCase();
		const normalizedPath = this.normalizePath(options.path);
		const remoteTarget = this.buildRemoteTarget(
			options.remoteName,
			options.path,
		);
		const baseArgs = [
			'--config',
			options.configPath,
			'lsjson',
			remoteTarget,
			'--dirs-only',
			'--metadata',
			'--fast-list',
		];

		if (options.includeShared) {
			baseArgs.push('--drive-shared-with-me');
		}

		if (query.length > 0) {
			baseArgs.push('--recursive');
		}

		const rawEntries = await this.runRcloneJson(baseArgs);
		const directories = rawEntries
			.filter(entry => entry.IsDir !== false)
			.map(entry => {
				const name = (entry.Name ?? entry.Path ?? '').trim();
				const entryPath = (entry.Path ?? name).trim().replace(/\/+$/g, '');
				const displayPath = normalizedPath
					? this.normalizePath(`${normalizedPath}/${entryPath}`)
					: this.normalizePath(entryPath);
				const id = (entry.ID ?? '').trim() || null;
				const tokenPath = id ?? displayPath;

				return {
					id,
					name: name || (displayPath.split('/').pop() ?? tokenPath),
					path: tokenPath,
					display_path: displayPath || name || tokenPath,
					parent_path: normalizedPath || null,
					source: options.source,
					drive_type: options.includeShared ? 'shared_with_me' : 'my_drive',
				};
			})
			.filter(folder => {
				if (!folder.path) {
					return false;
				}
				if (!query) {
					return true;
				}
				const haystack =
					`${folder.name} ${folder.display_path} ${folder.path}`.toLowerCase();
				return haystack.includes(query);
			});

		return directories.slice(0, options.maxResults);
	}

	async getStatus() {
		const config = await this.driveRuntimeConfigService.getRuntimeConfig();
		const status =
			await this.driveRuntimeConfigService.checkRemoteConfigured(config);

		return {
			configured: status.configured,
			message: status.message,
			remote_name: config.remoteName,
			remote_source: config.remoteSource,
			base_path: this.normalizePath(config.basePath),
			config_path: config.configPath,
		};
	}

	async getStorageUsage() {
		const usageRows = await this.prisma.$queryRaw<
			{
				total_size_bytes: bigint | null;
				backups_count: bigint | null;
				last_backup_at: Date | null;
			}[]
		>`
			SELECT
				SUM(size_bytes)::bigint AS total_size_bytes,
				COUNT(*)::bigint AS backups_count,
				MAX(created_at) AS last_backup_at
			FROM backups
			WHERE storage_type::text = 'google_drive'
		`;

		const usage = usageRows[0];
		return {
			storage_usage: {
				total_size_bytes: Number(usage?.total_size_bytes ?? 0n),
				backups_count: Number(usage?.backups_count ?? 0n),
				last_backup_at: usage?.last_backup_at ?? null,
			},
		};
	}

	async listFolders(payload: {
		query?: string;
		path?: string;
		shared_with_me?: boolean;
		max_results?: number;
	}) {
		const runtimeConfig =
			await this.driveRuntimeConfigService.getRuntimeConfig();
		const remoteStatus =
			await this.driveRuntimeConfigService.checkRemoteConfigured(runtimeConfig);
		const basePathNorm = this.normalizePath(runtimeConfig.basePath);
		const queryFilter = (payload.query ?? '').trim();
		const maxResults = Math.max(1, Math.min(1000, payload.max_results ?? 200));
		const includeShared = payload.shared_with_me !== false;
		const requestedPath = this.normalizePath(payload.path);
		const listingPath = requestedPath || (queryFilter ? '' : basePathNorm);

		if (!remoteStatus.configured) {
			return {
				folders: [],
				count: 0,
				remote_name: runtimeConfig.remoteName,
				remote_source: runtimeConfig.remoteSource,
				base_path: basePathNorm,
				configured: false,
				message: remoteStatus.message,
			};
		}

		const [baseFolders, sharedFolders] = await Promise.all([
			this.listFolderSet({
				remoteName: runtimeConfig.remoteName,
				configPath: runtimeConfig.configPath,
				path: listingPath,
				query: queryFilter,
				maxResults,
				includeShared: false,
				source: 'base',
			}),
			includeShared
				? this.listFolderSet({
						remoteName: runtimeConfig.remoteName,
						configPath: runtimeConfig.configPath,
						path: listingPath,
						query: queryFilter,
						maxResults,
						includeShared: true,
						source: 'shared',
					})
				: Promise.resolve([]),
		]);

		const deduped = new Map<string, (typeof baseFolders)[number]>();
		for (const entry of [...baseFolders, ...sharedFolders]) {
			const dedupeKey = this.normalizePath(entry.id ?? entry.path);
			if (!dedupeKey || deduped.has(dedupeKey)) {
				continue;
			}
			deduped.set(dedupeKey, entry);
		}

		const folders = Array.from(deduped.values()).slice(0, maxResults);

		return {
			folders,
			count: folders.length,
			remote_name: runtimeConfig.remoteName,
			remote_source: runtimeConfig.remoteSource,
			base_path: basePathNorm,
			configured: true,
			message: 'ok',
		};
	}
}
