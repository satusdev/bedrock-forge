import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { mkdir, readFile, stat, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { dirname, resolve } from 'path';
import {
	RcloneAuthorizeRequestDto,
	RcloneS3RequestDto,
} from './dto/rclone.dto';

@Injectable()
export class RcloneService {
	private readonly configPath = this.resolveConfigPath();

	private resolveConfigPath() {
		const envPath = process.env.RCLONE_CONFIG?.trim();
		if (!envPath) {
			return resolve(`${homedir()}/.config/rclone/rclone.conf`);
		}
		return resolve(envPath);
	}

	private parseIniSections(raw: string) {
		const sections = new Map<string, Record<string, string>>();
		let currentSection: string | null = null;

		for (const line of raw.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
				continue;
			}
			if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
				currentSection = trimmed.slice(1, -1).trim();
				if (currentSection && !sections.has(currentSection)) {
					sections.set(currentSection, {});
				}
				continue;
			}
			if (!currentSection) {
				continue;
			}
			const separator = trimmed.indexOf('=');
			if (separator < 0) {
				continue;
			}
			const key = trimmed.slice(0, separator).trim();
			const value = trimmed.slice(separator + 1).trim();
			const section = sections.get(currentSection) ?? {};
			section[key] = value;
			sections.set(currentSection, section);
		}

		return sections;
	}

	private serializeIni(sections: Map<string, Record<string, string>>) {
		const chunks: string[] = [];
		for (const [name, values] of sections.entries()) {
			chunks.push(`[${name}]`);
			for (const [key, value] of Object.entries(values)) {
				chunks.push(`${key} = ${value}`);
			}
			chunks.push('');
		}
		return `${chunks.join('\n').trim()}\n`;
	}

	private async readConfigSections() {
		if (!existsSync(this.configPath)) {
			return new Map<string, Record<string, string>>();
		}
		const stats = await stat(this.configPath);
		if (stats.isDirectory()) {
			return new Map<string, Record<string, string>>();
		}
		const raw = await readFile(this.configPath, 'utf-8');
		return this.parseIniSections(raw);
	}

	private async writeConfigSections(
		sections: Map<string, Record<string, string>>,
	) {
		await mkdir(dirname(this.configPath), { recursive: true });
		await writeFile(this.configPath, this.serializeIni(sections), 'utf-8');
	}

	async listRemotes() {
		const sections = await this.readConfigSections();
		const remotes = Array.from(sections.entries()).map(([name, values]) => ({
			name,
			type: values.type ?? 'unknown',
			configured: true,
		}));

		return {
			remotes,
			rclone_installed: true,
			config_path: this.configPath,
			message: `Found ${remotes.length} remote(s)`,
		};
	}

	async authorize(payload: RcloneAuthorizeRequestDto) {
		let token: Record<string, unknown>;
		try {
			token = JSON.parse(payload.token) as Record<string, unknown>;
		} catch {
			throw new BadRequestException({
				detail:
					"Invalid token format. Please paste the entire JSON output from 'rclone authorize drive'",
			});
		}

		if (!token.access_token || !token.refresh_token) {
			throw new BadRequestException({
				detail: 'Token missing required fields: access_token, refresh_token',
			});
		}

		const remoteName = payload.remote_name ?? 'gdrive';
		const scope = payload.scope ?? 'drive';
		const sections = await this.readConfigSections();
		sections.set(remoteName, {
			type: 'drive',
			scope,
			token: payload.token,
			team_drive: '',
		});
		await this.writeConfigSections(sections);

		return {
			success: true,
			verified: false,
			remote_name: remoteName,
			config_path: this.configPath,
			message: `Config saved for '${remoteName}' remote`,
		};
	}

	async configureS3Remote(payload: RcloneS3RequestDto) {
		const name = payload.name ?? 's3';
		const sections = await this.readConfigSections();
		sections.set(name, {
			type: 's3',
			provider: payload.provider ?? 'AWS',
			env_auth: 'false',
			access_key_id: payload.access_key_id,
			secret_access_key: payload.secret_access_key,
			region: payload.region ?? 'us-east-1',
			endpoint: payload.endpoint ?? '',
		});
		await this.writeConfigSections(sections);

		return {
			success: true,
			verified: false,
			remote_name: name,
			message: `S3 remote '${name}' configured successfully`,
		};
	}

	async deleteRemote(remoteName: string) {
		if (!existsSync(this.configPath)) {
			throw new NotFoundException({ detail: 'No rclone config file found' });
		}
		const stats = await stat(this.configPath);
		if (stats.isDirectory()) {
			throw new NotFoundException({ detail: 'No rclone config file found' });
		}
		const sections = await this.readConfigSections();
		if (!sections.has(remoteName)) {
			throw new NotFoundException({
				detail: `Remote '${remoteName}' not found`,
			});
		}

		sections.delete(remoteName);
		await this.writeConfigSections(sections);
		return {
			success: true,
			message: `Remote '${remoteName}' deleted successfully`,
		};
	}

	getInstallInstructions() {
		return {
			instructions: {
				linux: 'curl https://rclone.org/install.sh | sudo bash',
				macos: 'brew install rclone',
				windows: 'Download from https://rclone.org/downloads/',
			},
			authorize_command: 'rclone authorize "drive"',
			description:
				'Run the authorize command on a machine with a web browser. After authentication, copy the JSON token and paste it here.',
		};
	}
}
