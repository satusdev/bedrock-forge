import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';

type SettingRow = {
	key: string;
	value: string | null;
	encrypted_value: string | null;
};

type DriveRemoteSource = 'env' | 'settings' | 'default';

export type DriveRuntimeConfig = {
	remoteName: string;
	remoteSource: DriveRemoteSource;
	basePath: string;
	configPath: string;
};

@Injectable()
export class DriveRuntimeConfigService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly remoteSettingKey = 'gdrive_rclone_remote';
	private readonly basePathSettingKey = 'gdrive_base_path';

	private normalizePath(value: string | null | undefined) {
		return (value ?? '').trim().replace(/^\/+|\/+$/g, '');
	}

	private async getSettingValues() {
		const rows = await this.prisma.$queryRaw<SettingRow[]>`
			SELECT key, value, encrypted_value
			FROM app_settings
			WHERE key IN (${this.remoteSettingKey}, ${this.basePathSettingKey})
		`;
		const map = new Map<string, string>();
		for (const row of rows) {
			const value = (row.value ?? row.encrypted_value ?? '').trim();
			if (value.length > 0) {
				map.set(row.key, value);
			}
		}
		return map;
	}

	resolveConfigPath() {
		const envPath = process.env.RCLONE_CONFIG?.trim();
		if (!envPath) {
			return resolve(`${homedir()}/.config/rclone/rclone.conf`);
		}
		return resolve(envPath);
	}

	async getRuntimeConfig(): Promise<DriveRuntimeConfig> {
		const values = await this.getSettingValues();
		const envRemoteName = process.env.FORGE_BACKUP_GDRIVE_REMOTE?.trim();
		const settingsRemoteName = values.get(this.remoteSettingKey)?.trim();
		const resolvedRemoteName = envRemoteName || settingsRemoteName || 'gdrive';
		const remoteSource: DriveRemoteSource = envRemoteName
			? 'env'
			: settingsRemoteName
				? 'settings'
				: 'default';
		const basePath =
			this.normalizePath(values.get(this.basePathSettingKey)) ||
			'WebDev/Projects';

		return {
			remoteName: resolvedRemoteName,
			remoteSource,
			basePath,
			configPath: this.resolveConfigPath(),
		};
	}

	private getRemoteSectionPattern(remoteName: string) {
		return new RegExp(
			`^\\[${remoteName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\]$`,
			'm',
		);
	}

	async checkRemoteConfigured(config?: DriveRuntimeConfig) {
		const runtime = config ?? (await this.getRuntimeConfig());
		if (!existsSync(runtime.configPath)) {
			return {
				configured: false,
				message: `rclone config not found at ${runtime.configPath}`,
				runtime,
			};
		}

		const configStats = await stat(runtime.configPath);
		if (configStats.isDirectory()) {
			return {
				configured: false,
				message: `RCLONE_CONFIG points to a directory (${runtime.configPath})`,
				runtime,
			};
		}

		const rawConfig = await readFile(runtime.configPath, 'utf-8');
		const sectionPattern = this.getRemoteSectionPattern(runtime.remoteName);
		if (!sectionPattern.test(rawConfig)) {
			return {
				configured: false,
				message: `Remote '${runtime.remoteName}' not found in ${runtime.configPath}`,
				runtime,
			};
		}

		return {
			configured: true,
			message: 'rclone remote configured',
			runtime,
		};
	}
}
