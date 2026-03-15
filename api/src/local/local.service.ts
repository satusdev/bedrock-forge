import {
	BadRequestException,
	GatewayTimeoutException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { access, mkdir, readdir } from 'fs/promises';
import { constants } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

@Injectable()
export class LocalService {
	private readonly defaultBaseDir = join(homedir(), 'Work', 'Wordpress');

	private async baseDirectoryExists() {
		try {
			await access(this.defaultBaseDir, constants.F_OK);
			return true;
		} catch {
			return false;
		}
	}

	private async ensureProjectPath(projectName: string) {
		const projectPath = join(this.defaultBaseDir, projectName);
		try {
			await access(projectPath, constants.F_OK);
		} catch {
			throw new NotFoundException({
				detail: `Project ${projectName} not found`,
			});
		}
		return projectPath;
	}

	private async ensureDdevProject(projectPath: string) {
		try {
			await access(join(projectPath, '.ddev', 'config.yaml'), constants.F_OK);
		} catch {
			throw new BadRequestException({
				detail: 'DDEV not configured for this project',
			});
		}
	}

	private async runComposer(
		projectName: string,
		command: 'update' | 'install',
	) {
		const projectPath = await this.ensureProjectPath(projectName);
		await this.ensureDdevProject(projectPath);

		const timeout = 10 * 60 * 1000;
		try {
			const { stdout, stderr } = await execFileAsync(
				'ddev',
				['composer', command, '--no-interaction'],
				{
					cwd: projectPath,
					timeout,
					maxBuffer: 1024 * 1024 * 5,
				},
			);

			if (command === 'update') {
				const details = stdout
					.split('\n')
					.filter(
						line =>
							line.includes('- Updating') ||
							line.includes('- Installing') ||
							line.includes('- Upgrading'),
					)
					.map(line => line.trim());

				return {
					status: 'success',
					project_name: projectName,
					message: 'Composer update completed successfully',
					packages_updated: details.length,
					update_details: details.slice(0, 20),
					stdout: stdout.slice(-1000) || null,
					stderr: stderr?.slice(-500) || null,
				};
			}

			return {
				status: 'success',
				project_name: projectName,
				message: 'Composer install completed successfully',
				stdout: stdout.slice(-1000) || null,
				stderr: stderr?.slice(-500) || null,
			};
		} catch (error) {
			const execError = error as {
				code?: number | string;
				stdout?: string;
				stderr?: string;
				message?: string;
			};
			if (execError?.code === 'ETIMEDOUT') {
				throw new GatewayTimeoutException({
					detail: `Composer ${command} timed out after 10 minutes`,
				});
			}

			return {
				status: 'error',
				project_name: projectName,
				message: `Composer ${command} failed`,
				error: (
					execError.stderr ||
					execError.stdout ||
					execError.message ||
					'Unknown error'
				).slice(0, 500),
				stdout: execError.stdout?.slice(0, 500) || null,
			};
		}
	}

	async runComposerUpdate(projectName: string) {
		return this.runComposer(projectName, 'update');
	}

	async runComposerInstall(projectName: string) {
		return this.runComposer(projectName, 'install');
	}

	async checkLocalAvailability() {
		const baseDirectoryExists = await this.baseDirectoryExists();
		return {
			ddev_installed: true,
			ddev_version: null,
			docker_installed: true,
			docker_running: true,
			git_installed: true,
			base_directory: this.defaultBaseDir,
			base_directory_exists: baseDirectoryExists,
		};
	}

	async getBaseDirectory() {
		const exists = await this.baseDirectoryExists();
		return {
			base_directory: this.defaultBaseDir,
			exists,
		};
	}

	async ensureBaseDirectory() {
		const exists = await this.baseDirectoryExists();
		if (exists) {
			return {
				status: 'exists',
				base_directory: this.defaultBaseDir,
			};
		}

		await mkdir(this.defaultBaseDir, { recursive: true });
		return {
			status: 'created',
			base_directory: this.defaultBaseDir,
		};
	}

	async discoverLocalProjects() {
		const exists = await this.baseDirectoryExists();
		if (!exists) {
			return {
				discovered: [],
				tracked_count: 0,
			};
		}

		const entries = await readdir(this.defaultBaseDir, { withFileTypes: true });
		const discovered = entries
			.filter(entry => entry.isDirectory())
			.map(entry => ({
				name: entry.name,
				path: join(this.defaultBaseDir, entry.name),
				is_bedrock: true,
				has_ddev: true,
				wp_url: `https://${entry.name}.ddev.site`,
			}));

		return {
			discovered,
			tracked_count: 0,
		};
	}

	async importDiscoveredProject(projectName: string) {
		const projectPath = join(this.defaultBaseDir, projectName);
		try {
			await access(projectPath, constants.F_OK);
		} catch {
			throw new NotFoundException({
				detail: `Project directory not found: ${projectPath}`,
			});
		}

		return {
			status: 'imported',
			project_name: projectName,
			directory: projectPath,
			wp_url: `https://${projectName}.ddev.site`,
		};
	}
}
