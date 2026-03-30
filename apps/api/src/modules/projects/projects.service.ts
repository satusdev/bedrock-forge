import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
	QUEUES,
	JOB_TYPES,
	DEFAULT_JOB_OPTIONS,
	PaginationQuery,
} from '@bedrock-forge/shared';
import { ProjectsRepository } from './projects.repository';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { ImportProjectDto } from './dto/import-project.dto';
import { BulkImportProjectsDto } from './dto/bulk-import-projects.dto';
import { DomainsService } from '../domains/domains.service';
import { MonitorsService } from '../monitors/monitors.service';

@Injectable()
export class ProjectsService {
	private readonly logger = new Logger(ProjectsService.name);

	constructor(
		private readonly repo: ProjectsRepository,
		@InjectQueue(QUEUES.PROJECTS) private readonly projectsQueue: Queue,
		private readonly domainsService: DomainsService,
		private readonly monitorsService: MonitorsService,
	) {}

	findAll(query: PaginationQuery) {
		return this.repo.findAllPaginated(query);
	}

	findOne(id: number) {
		return this.repo.findById(BigInt(id));
	}

	create(dto: CreateProjectDto) {
		return this.repo.create({
			name: dto.name,
			client_id: BigInt(dto.client_id),
			...(dto.hosting_package_id && {
				hosting_package_id: BigInt(dto.hosting_package_id),
			}),
			...(dto.support_package_id && {
				support_package_id: BigInt(dto.support_package_id),
			}),
			...(dto.status && { status: dto.status }),
		});
	}

	async update(id: number, dto: UpdateProjectDto) {
		await this.findOne(id);
		return this.repo.update(BigInt(id), {
			...(dto.name !== undefined && { name: dto.name }),
			...(dto.client_id !== undefined && {
				client_id: BigInt(dto.client_id),
			}),
			...(dto.hosting_package_id !== undefined && {
				hosting_package_id: BigInt(dto.hosting_package_id),
			}),
			...(dto.support_package_id !== undefined && {
				support_package_id: BigInt(dto.support_package_id),
			}),
			...(dto.status !== undefined && { status: dto.status }),
		});
	}

	async remove(id: number) {
		await this.findOne(id);
		return this.repo.remove(BigInt(id));
	}

	/**
	 * Create a project + environment from an existing server folder in one transaction.
	 * Typically called after a successful detect-bedrock validation.
	 */
	async importFromServer(dto: ImportProjectDto) {
		const { project, environment } = await this.repo.importFromServer({
			name: dto.name,
			client_id: BigInt(dto.client_id),
			environment: {
				server_id: BigInt(dto.server_id),
				type: dto.type ?? 'production',
				url: dto.url,
				root_path: dto.root_path,
			},
		});
		await this.autoCreateDomainAndMonitor({
			projectId: Number(project.id),
			environmentId: Number(environment.id),
			url: dto.url,
		});
		return { project, environment };
	}

	/**
	 * Bulk-import multiple projects discovered by the server scanner.
	 * Each entry creates Project + Environment + WpDbCredentials in one transaction.
	 * After the transaction, auto-creates a domain record (+ WHOIS job) and a monitor
	 * for each imported environment.
	 */
	async importBulk(dto: BulkImportProjectsDto) {
		const entries = dto.projects.map(p => ({
			name: p.name,
			client_id: BigInt(p.client_id),
			server_id: BigInt(p.server_id),
			type: p.type ?? 'production',
			url: p.url,
			root_path: p.root_path,
			dbCredentials: p.db_credentials,
			mainDomain: p.main_domain,
		}));
		const results = await this.repo.importBulk(entries);

		// After the DB transaction: create domains and monitors (non-blocking per item)
		for (let i = 0; i < results.length; i++) {
			const { project, environment } = results[i];
			const entry = entries[i];
			await this.autoCreateDomainAndMonitor({
				projectId: Number(project.id),
				environmentId: Number(environment.id),
				url: environment.url,
				mainDomain: entry.mainDomain,
			});
		}

		return results;
	}

	/**
	 * Auto-create a monitor (10 min interval) and domain record(s) for a newly
	 * created environment. All errors are swallowed — this is best-effort.
	 */
	private async autoCreateDomainAndMonitor(opts: {
		projectId: number;
		environmentId: number;
		url: string;
		mainDomain?: string;
	}) {
		const { projectId, environmentId, url, mainDomain } = opts;

		// Monitor — 10-minute interval
		try {
			await this.monitorsService.create({
				environment_id: environmentId,
				interval_seconds: 600,
				enabled: true,
			});
		} catch (err) {
			this.logger.warn(`[import] Failed to create monitor for env ${environmentId}: ${err}`);
		}

		// Primary domain from environment URL
		try {
			const hostname = new URL(url).hostname;
			if (hostname) {
				await this.domainsService.create({ name: hostname, project_id: projectId });
			}
		} catch (err) {
			this.logger.warn(`[import] Failed to create domain for env ${environmentId}: ${err}`);
		}

		// Main domain (root of the subdomain), if present and different
		if (mainDomain) {
			try {
				await this.domainsService.create({ name: mainDomain, project_id: projectId });
			} catch (err) {
				this.logger.warn(`[import] Failed to create main domain ${mainDomain}: ${err}`);
			}
		}
	}

	async createBedrock(environmentId: number, jobExecutionId: bigint) {
		return this.projectsQueue.add(
			JOB_TYPES.PROJECT_CREATE_BEDROCK,
			{ environmentId, jobExecutionId: Number(jobExecutionId) },
			DEFAULT_JOB_OPTIONS,
		);
	}
}
