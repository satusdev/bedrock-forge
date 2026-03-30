import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EnvironmentsRepository } from './environments.repository';
import {
	CreateEnvironmentDto,
	UpdateEnvironmentDto,
	UpsertDbCredentialsDto,
} from './dto/environment.dto';
import { ServersService } from '../servers/servers.service';
import { MonitorsService } from '../monitors/monitors.service';
import { DomainsService } from '../domains/domains.service';

@Injectable()
export class EnvironmentsService {
	private readonly logger = new Logger(EnvironmentsService.name);

	constructor(
		private readonly repo: EnvironmentsRepository,
		private readonly serversService: ServersService,
		private readonly monitorsService: MonitorsService,
		private readonly domainsService: DomainsService,
	) {}

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

	create(projectId: number, dto: CreateEnvironmentDto) {
		return this.repo.create(BigInt(projectId), dto).then(async env => {
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
			// Auto-create a domain record from the environment URL
			try {
				const hostname = new URL(dto.url).hostname;
				await this.domainsService.create({
					name: hostname,
					project_id: projectId,
				});
			} catch (err) {
				this.logger.warn(
					`Failed to auto-create domain for env ${env.id}: ${err}`,
				);
			}
			return env;
		});
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
}
