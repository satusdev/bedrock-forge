import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';

type SettingRow = {
	value: string | null;
	encrypted_value: string | null;
};

type ProjectDriveFoldersRow = {
	name: string;
	gdrive_folder_id: string | null;
	gdrive_backups_folder_id: string | null;
	gdrive_assets_folder_id: string | null;
	gdrive_docs_folder_id: string | null;
};

@Injectable()
export class GdriveService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly remoteKey = 'gdrive_rclone_remote';
	private readonly basePathKey = 'gdrive_base_path';

	private async getSetting(key: string) {
		const rows = await this.prisma.$queryRaw<SettingRow[]>`
			SELECT value, encrypted_value
			FROM app_settings
			WHERE key = ${key}
			LIMIT 1
		`;
		return rows[0] ?? null;
	}

	private async getConfig() {
		const remote = await this.getSetting(this.remoteKey);
		const basePath = await this.getSetting(this.basePathKey);
		return {
			remoteName:
				(remote?.value ?? remote?.encrypted_value ?? 'gdrive').trim() ||
				'gdrive',
			basePath:
				(
					basePath?.value ??
					basePath?.encrypted_value ??
					'WebDev/Projects'
				).trim() || 'WebDev/Projects',
		};
	}

	private getConfigPath() {
		const envPath = process.env.RCLONE_CONFIG?.trim();
		if (!envPath) {
			return resolve(`${homedir()}/.config/rclone/rclone.conf`);
		}
		return resolve(envPath);
	}

	private async hasConfiguredRemote(remoteName: string, configPath: string) {
		if (!existsSync(configPath)) {
			return {
				configured: false,
				message: 'rclone config file not found',
			};
		}

		const stats = await stat(configPath);
		if (stats.isDirectory()) {
			return {
				configured: false,
				message: 'rclone config path points to a directory',
			};
		}

		const raw = await readFile(configPath, 'utf-8');
		const sectionPattern = new RegExp(
			`^\\[${remoteName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\]$`,
			'm',
		);
		const configured = sectionPattern.test(raw);
		return {
			configured,
			message: configured
				? 'rclone remote configured'
				: `Remote '${remoteName}' not found in rclone config`,
		};
	}

	private normalizePath(value: string | null | undefined) {
		return (value ?? '').trim().replace(/^\/+|\/+$/g, '');
	}

	private isDriveFolderId(value: string | null | undefined) {
		return /^[A-Za-z0-9_-]{10,}$/.test((value ?? '').trim());
	}

	async getStatus() {
		const { remoteName, basePath } = await this.getConfig();
		const configPath = this.getConfigPath();
		const status = await this.hasConfiguredRemote(remoteName, configPath);

		return {
			configured: status.configured,
			message: status.message,
			remote_name: remoteName,
			base_path: this.normalizePath(basePath),
			config_path: configPath,
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
		const { remoteName, basePath } = await this.getConfig();
		const basePathNorm = this.normalizePath(basePath);
		const pathFilter = this.normalizePath(payload.path);
		const queryFilter = (payload.query ?? '').trim().toLowerCase();
		const maxResults = Math.max(1, Math.min(1000, payload.max_results ?? 200));

		const rows = await this.prisma.$queryRaw<ProjectDriveFoldersRow[]>`
			SELECT
				name,
				gdrive_folder_id,
				gdrive_backups_folder_id,
				gdrive_assets_folder_id,
				gdrive_docs_folder_id
			FROM projects
			ORDER BY name ASC
		`;

		const folderCandidates = rows.flatMap(row => {
			const projectPrefix = `${basePathNorm}/${row.name}`.replace(
				/^\/+|\/+$/g,
				'',
			);
			const entries: Array<{
				id: string | null;
				path: string;
				name: string;
				source: 'base' | 'shared';
			}> = [
				{
					id: null,
					path: projectPrefix,
					name: row.name,
					source: 'base',
				},
			];

			if (row.gdrive_folder_id) {
				entries.push({
					id: this.isDriveFolderId(row.gdrive_folder_id)
						? this.normalizePath(row.gdrive_folder_id)
						: null,
					path: this.normalizePath(row.gdrive_folder_id),
					name: row.name,
					source: 'base',
				});
			}
			if (row.gdrive_backups_folder_id) {
				entries.push({
					id: this.isDriveFolderId(row.gdrive_backups_folder_id)
						? this.normalizePath(row.gdrive_backups_folder_id)
						: null,
					path: this.normalizePath(row.gdrive_backups_folder_id),
					name: `${row.name} Backups`,
					source: this.isDriveFolderId(row.gdrive_backups_folder_id)
						? 'shared'
						: 'base',
				});
			}
			if (row.gdrive_assets_folder_id) {
				entries.push({
					id: this.isDriveFolderId(row.gdrive_assets_folder_id)
						? this.normalizePath(row.gdrive_assets_folder_id)
						: null,
					path: this.normalizePath(row.gdrive_assets_folder_id),
					name: `${row.name} Assets`,
					source: this.isDriveFolderId(row.gdrive_assets_folder_id)
						? 'shared'
						: 'base',
				});
			}
			if (row.gdrive_docs_folder_id) {
				entries.push({
					id: this.isDriveFolderId(row.gdrive_docs_folder_id)
						? this.normalizePath(row.gdrive_docs_folder_id)
						: null,
					path: this.normalizePath(row.gdrive_docs_folder_id),
					name: `${row.name} Docs`,
					source: this.isDriveFolderId(row.gdrive_docs_folder_id)
						? 'shared'
						: 'base',
				});
			}

			return entries;
		});

		const seen = new Set<string>();
		const filtered = folderCandidates.filter(entry => {
			const normalized = this.normalizePath(entry.id ?? entry.path);
			if (!normalized || seen.has(normalized)) {
				return false;
			}
			seen.add(normalized);
			const pathValue = this.normalizePath(entry.path);
			const idValue = this.normalizePath(entry.id);
			if (
				pathFilter &&
				!pathValue.startsWith(pathFilter) &&
				!idValue.startsWith(pathFilter)
			) {
				return false;
			}
			const haystack = `${pathValue} ${idValue} ${entry.name}`.toLowerCase();
			if (queryFilter && !haystack.includes(queryFilter)) {
				return false;
			}
			return true;
		});

		const folders = filtered.slice(0, maxResults).map(entry => ({
			id: entry.id,
			name: entry.name,
			path: this.normalizePath(entry.path),
			source: entry.source,
		}));

		return {
			folders,
			count: folders.length,
			remote_name: remoteName,
			base_path: basePathNorm,
		};
	}
}
