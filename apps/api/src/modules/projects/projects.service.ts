import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomBytes } from 'crypto';
import {
	QUEUES,
	JOB_TYPES,
	DEFAULT_JOB_OPTIONS,
	PaginationQuery,
} from '@bedrock-forge/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectsRepository } from './projects.repository';
import {
	CreateProjectDto,
	UpdateProjectDto,
	QueryProjectsDto,
} from './dto/project.dto';
import { ImportProjectDto } from './dto/import-project.dto';
import { BulkImportProjectsDto } from './dto/bulk-import-projects.dto';
import { CreateProjectFullDto } from './dto/create-project-full.dto';
import { DomainsService } from '../domains/domains.service';
import { MonitorsService } from '../monitors/monitors.service';

@Injectable()
export class ProjectsService {
	private readonly logger = new Logger(ProjectsService.name);

	constructor(
		private readonly repo: ProjectsRepository,
		private readonly prisma: PrismaService,
		@InjectQueue(QUEUES.PROJECTS) private readonly projectsQueue: Queue,
		private readonly domainsService: DomainsService,
		private readonly monitorsService: MonitorsService,
	) {}

	findAll(query: QueryProjectsDto) {
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
			this.logger.warn(
				`[import] Failed to create monitor for env ${environmentId}: ${err}`,
			);
		}

		// Domain: prefer the root/apex domain (mainDomain) over the full hostname.
		// If mainDomain is available and differs from the hostname, the hostname is
		// a subdomain — skip it and only track the apex domain to avoid clutter.
		try {
			const hostname = new URL(url).hostname;
			const domainToCreate =
				mainDomain ?? this.extractRegistrableDomain(hostname);
			if (domainToCreate) {
				await this.domainsService.findOrCreate({
					name: domainToCreate,
					project_id: projectId,
				});
			}
		} catch (err) {
			this.logger.warn(
				`[import] Failed to create domain for env ${environmentId}: ${err}`,
			);
		}
	}

	/**
	 * Extract the registrable root domain from a hostname.
	 * e.g. blog.example.com → example.com, shop.example.co.uk → example.co.uk
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

	async createBedrock(environmentId: number, jobExecutionId: bigint) {
		return this.projectsQueue.add(
			JOB_TYPES.PROJECT_CREATE_BEDROCK,
			{ environmentId, jobExecutionId: Number(jobExecutionId) },
			DEFAULT_JOB_OPTIONS,
		);
	}

	/**
	 * Provision a full Bedrock WordPress project end-to-end:
	 * 1. Create Project + Environment records in DB
	 * 2. Generate random DB credentials
	 * 3. Enqueue a PROJECT_CREATE_BEDROCK job with CyberPanel config
	 *    The worker handles: CyberPanel website/DB creation, Bedrock install,
	 *    DB credential storage, monitor + domain auto-creation.
	 */
	async createFull(dto: CreateProjectFullDto) {
		const { name, client_id, server_id, domain, admin_email } = dto;
		const phpVersion = dto.php_version ?? '8.3';
		const envType = dto.env_type ?? 'production';
		const rootPath = `/home/${domain}/public_html`;
		const siteUrl = `https://${domain}`;

		// Use user-provided DB credentials, or auto-generate random ones
		const dbSuffix = randomBytes(4).toString('hex');
		const dbName = dto.db_name?.trim() || `wp_${dbSuffix}`;
		const dbUser = dto.db_user?.trim() || `u_${dbSuffix}`;
		const dbPassword =
			dto.db_password?.trim() || randomBytes(16).toString('base64url');
		const dbHost = dto.db_host?.trim() || 'localhost';

		// Create Project + Environment in a transaction
		const { project, environment, jobExecution } =
			await this.prisma.$transaction(async tx => {
				const project = await tx.project.create({
					data: {
						name,
						client_id: BigInt(client_id),
						...(dto.hosting_package_id && {
							hosting_package_id: BigInt(dto.hosting_package_id),
						}),
					},
				});
				const environment = await tx.environment.create({
					data: {
						project_id: project.id,
						server_id: BigInt(server_id),
						type: envType,
						url: siteUrl,
						root_path: rootPath,
					},
				});
				const jobExecution = await tx.jobExecution.create({
					data: {
						queue_name: QUEUES.PROJECTS,
						bull_job_id: '0', // placeholder — updated by worker
						job_type: JOB_TYPES.PROJECT_CREATE_BEDROCK,
						environment_id: environment.id,
						server_id: BigInt(server_id),
						status: 'queued',
					},
				});
				return { project, environment, jobExecution };
			});

		// Enqueue the provisioning job
		const job = await this.projectsQueue.add(
			JOB_TYPES.PROJECT_CREATE_BEDROCK,
			{
				environmentId: Number(environment.id),
				jobExecutionId: Number(jobExecution.id),
				cyberpanel: {
					domain,
					dbName,
					dbUser,
					dbPassword,
					dbHost,
					phpVersion,
					adminEmail: admin_email,
				},
				sourceEnvironmentId: dto.source_environment_id,
			},
			{ ...DEFAULT_JOB_OPTIONS, attempts: 1 },
		);

		// Back-fill the bull_job_id now that we have it
		await this.prisma.jobExecution.update({
			where: { id: jobExecution.id },
			data: { bull_job_id: String(job.id) },
		});

		return {
			project: { id: Number(project.id), name: project.name },
			environment: { id: Number(environment.id), url: siteUrl },
			jobExecutionId: Number(jobExecution.id),
			jobId: String(job.id),
		};
	}
}
