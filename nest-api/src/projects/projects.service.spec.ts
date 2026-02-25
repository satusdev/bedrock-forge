import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { TaskStatusService } from '../task-status/task-status.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('ProjectsService', () => {
	let prisma: MockPrisma;
	let service: ProjectsService;
	let taskStatusService: TaskStatusService;

	beforeEach(() => {
		prisma = {
			$queryRaw: jest.fn(),
			$executeRaw: jest.fn(),
		};
		taskStatusService = new TaskStatusService();
		service = new ProjectsService(prisma as unknown as any, taskStatusService);
	});

	it('returns remote projects with parsed tags and domain', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Acme Site',
				slug: 'acme-site',
				wp_home: 'https://acme.test',
				environment: 'production',
				status: 'active',
				server_name: 'srv-1',
				tags: '["vip","client"]',
				created_at: new Date('2025-01-01T00:00:00.000Z'),
			},
		]);

		const result = await service.getRemoteProjects();
		const first = result[0];

		expect(first?.name).toBe('Acme Site');
		expect(first?.domain).toBe('https://acme.test');
		expect(first?.tags).toEqual(['vip', 'client']);
		expect(first?.health_score).toBe(90);
	});

	it('returns projects status list', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Acme Site',
				slug: 'acme-site',
				wp_home: 'https://acme.test',
				environment: 'production',
				status: 'active',
				server_name: 'srv-1',
				tags: '[]',
				created_at: new Date('2025-01-01T00:00:00.000Z'),
			},
		]);

		const result = await service.getProjectsStatus();
		expect(result[0]?.name).toBe('Acme Site');
	});

	it('returns sorted unique project tags', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{ tags: '["vip","client"]' },
			{ tags: '["client","agency"]' },
			{ tags: null },
		]);

		const result = await service.getAllTags();
		expect(result.tags).toEqual(['agency', 'client', 'vip']);
	});

	it('returns comprehensive projects list', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Acme Site',
				slug: 'acme-site',
				wp_home: 'https://acme.test',
				environment: 'production',
				status: 'active',
				server_name: 'srv-1',
				tags: '[]',
				created_at: new Date('2025-01-01T00:00:00.000Z'),
			},
		]);

		const result = await service.getComprehensiveProjects();
		expect(result[0]?.source).toBe('remote');
	});

	it('creates project with slug and default branch', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
			{
				id: 5,
				name: 'My New Site',
				slug: 'my-new-site',
				wp_home: 'https://mysite.test',
				description: null,
				status: 'active',
				github_repo_url: null,
				github_branch: 'main',
				tags: '[]',
				created_at: new Date('2025-01-01T00:00:00.000Z'),
				updated_at: new Date('2025-01-01T00:00:00.000Z'),
			},
		]);

		const result = await service.createProject({
			name: 'My New Site',
			domain: 'https://mysite.test',
		});

		expect(result.id).toBe(5);
		expect(result.slug).toBe('my-new-site');
		expect(result.github_branch).toBe('main');
		expect(result.environments_count).toBe(0);
	});

	it('rejects create when slug already exists', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 10 }]);

		await expect(
			service.createProject({ name: 'Acme', domain: 'https://acme.test' }),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('deletes project when it exists', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 9 }]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		await service.deleteProject(9);

		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('throws not found when deleting missing project', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		await expect(service.deleteProject(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('returns environments for a project', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([
			{
				id: 3,
				environment: 'staging',
				server_id: 4,
				server_name: 'srv-1',
				server_hostname: 'srv1.local',
				wp_url: 'https://staging.acme.test',
				wp_path: '/var/www/acme',
				ssh_user: 'forge',
				ssh_key_path: null,
				database_name: 'acme',
				database_user: 'acme',
				database_password: 'secret',
				gdrive_backups_folder_id: null,
				notes: null,
				is_primary: true,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.getProjectEnvironments(1);

		expect(result).toHaveLength(1);
		expect(result[0]?.environment).toBe('staging');
	});

	it('lists project servers with environment filter', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([
			{
				id: 4,
				project_id: 1,
				environment: 'production',
				server_id: 2,
				server_name: 'srv-1',
				server_hostname: 'srv1.local',
				wp_url: 'https://acme.test',
				wp_path: '/var/www/acme',
				ssh_user: 'forge',
				ssh_key_path: null,
				database_name: 'acme',
				database_user: 'acme',
				database_password: 'secret',
				gdrive_backups_folder_id: null,
				notes: null,
				is_primary: true,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.listProjectServers(1, 'production');
		expect(result).toHaveLength(1);
		expect(result[0]?.project_id).toBe(1);
		expect(result[0]?.environment).toBe('production');
	});

	it('rejects linking environment when same environment exists', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 1 }])
			.mockResolvedValueOnce([{ id: 2, name: 'srv', hostname: 'srv.local' }])
			.mockResolvedValueOnce([{ id: 10 }]);

		await expect(
			service.linkEnvironment(1, {
				environment: 'production',
				server_id: 2,
				wp_url: 'https://acme.test',
				wp_path: '/var/www/acme',
				database_name: 'acme',
				database_user: 'acme',
				database_password: 'secret',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('links environment and returns server metadata', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 1 }])
			.mockResolvedValueOnce([
				{ id: 2, name: 'server-main', hostname: 'srv.local' },
			])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([
				{
					id: 11,
					project_id: 1,
					server_id: 2,
					environment: 'production',
					wp_url: 'https://acme.test',
					wp_path: '/var/www/acme',
					ssh_user: 'forge',
					ssh_key_path: null,
					database_name: 'acme',
					database_user: 'acme',
					database_password: 'secret',
					gdrive_backups_folder_id: null,
					notes: null,
					is_primary: true,
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.linkEnvironment(1, {
			environment: 'production',
			server_id: 2,
			wp_url: 'https://acme.test',
			wp_path: '/var/www/acme',
			database_name: 'acme',
			database_user: 'acme',
			database_password: 'secret',
			ssh_user: 'forge',
			is_primary: true,
		});

		expect(result.server_name).toBe('server-main');
		expect(result.environment).toBe('production');
		expect(result.id).toBe(11);
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('updates environment and returns success envelope', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 11,
					project_id: 1,
					server_id: 2,
					environment: 'production',
					wp_url: 'https://acme.test',
					wp_path: '/var/www/acme',
					ssh_user: 'forge',
					ssh_key_path: null,
					database_name: 'acme',
					database_user: 'acme',
					database_password: 'secret',
					gdrive_backups_folder_id: null,
					notes: null,
					is_primary: true,
					created_at: new Date(),
					updated_at: new Date(),
				},
			])
			.mockResolvedValueOnce([
				{
					id: 11,
					project_id: 1,
					server_id: 2,
					environment: 'staging',
					wp_url: 'https://staging.acme.test',
					wp_path: '/var/www/acme',
					ssh_user: 'forge',
					ssh_key_path: null,
					database_name: 'acme',
					database_user: 'acme',
					database_password: 'secret',
					gdrive_backups_folder_id: null,
					notes: 'updated',
					is_primary: true,
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.updateEnvironment(1, 11, {
			environment: 'staging',
			wp_url: 'https://staging.acme.test',
			notes: 'updated',
		});

		expect(result.status).toBe('success');
		expect(result.data.environment).toBe('staging');
	});

	it('unlinks environment after nulling backup references', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 11 }]);
		prisma.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

		await service.unlinkEnvironment(1, 11);

		expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
	});

	it('returns project backups with normalized sizes', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([
			{
				id: 12,
				project_id: 1,
				name: 'Backup A',
				backup_type: 'full',
				storage_type: 'local',
				status: 'completed',
				storage_path: '/tmp/a.tar.gz',
				size_bytes: BigInt(1000),
				created_at: new Date(),
				completed_at: new Date(),
				project_server_id: null,
				drive_folder_id: null,
				storage_file_id: null,
			},
		]);

		const result = await service.getProjectBackups(1, 1, 10);
		expect(result[0]?.size_bytes).toBe(1000);
		expect(result[0]?.backup_type).toBe('full');
	});

	it('returns download metadata for project backup path', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]);

		const result = await service.getProjectBackupDownloadMetadata(
			1,
			'/tmp/a.tar.gz',
			'local',
		);

		expect(result.filename).toBe('a.tar.gz');
		expect(result.content).toContain('project 1');
	});

	it('returns project drive settings payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Acme',
				slug: 'acme',
				gdrive_connected: true,
				gdrive_folder_id: 'root-folder',
				gdrive_backups_folder_id: 'backup-folder',
				gdrive_assets_folder_id: null,
				gdrive_docs_folder_id: null,
				gdrive_last_sync: null,
			},
		]);

		const result = await service.getProjectDriveSettings(1);
		expect(result.gdrive_connected).toBe(true);
		expect(result.gdrive_backups_folder_id).toBe('backup-folder');
	});

	it('updates project drive settings and returns updated payload', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 1,
					name: 'Acme',
					slug: 'acme',
					gdrive_connected: false,
					gdrive_folder_id: null,
					gdrive_backups_folder_id: null,
					gdrive_assets_folder_id: null,
					gdrive_docs_folder_id: null,
					gdrive_last_sync: null,
				},
			])
			.mockResolvedValueOnce([
				{
					id: 1,
					name: 'Acme',
					slug: 'acme',
					gdrive_connected: true,
					gdrive_folder_id: null,
					gdrive_backups_folder_id: 'backup-folder',
					gdrive_assets_folder_id: null,
					gdrive_docs_folder_id: null,
					gdrive_last_sync: null,
				},
			]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.updateProjectDriveSettings(1, {
			gdrive_backups_folder_id: 'backup-folder',
		});

		expect(result.gdrive_connected).toBe(true);
		expect(result.gdrive_backups_folder_id).toBe('backup-folder');
	});

	it('returns drive backup index grouped by environments', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 1,
					name: 'Acme',
					slug: 'acme',
					gdrive_connected: true,
					gdrive_folder_id: null,
					gdrive_backups_folder_id: null,
					gdrive_assets_folder_id: null,
					gdrive_docs_folder_id: null,
					gdrive_last_sync: null,
				},
			])
			.mockResolvedValueOnce([
				{ environment: 'production', gdrive_backups_folder_id: null },
				{ environment: 'staging', gdrive_backups_folder_id: null },
			]);

		const result = await service.getProjectDriveBackupIndex(1);
		expect(result.backup_root).toContain('Acme/Backups');
		expect(Object.keys(result.environments)).toEqual(
			expect.arrayContaining(['production', 'staging']),
		);
	});

	it('creates environment backup task payload', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 1, name: 'Acme' }])
			.mockResolvedValueOnce([{ id: 2, environment: 'production' }])
			.mockResolvedValueOnce([{ id: 99 }]);

		const result = await service.createEnvironmentBackup(
			1,
			2,
			'database',
			'gdrive',
		);

		expect(result.status).toBe('pending');
		expect(result.backup_id).toBe(99);
	});

	it('returns whois refresh payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{ id: 1, wp_home: 'https://acme.test', name: 'Acme' },
		]);

		const result = await service.refreshProjectWhois(1);
		expect(result.status).toBe('success');
		expect(result.domain_name).toBe('acme.test');
	});

	it('returns task status payload', async () => {
		const result = await service.getTaskStatus('task-1');
		expect(result.task_id).toBe('task-1');
		expect(result.status).toBe('pending');
	});

	it('lists environment users', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{ id: 7, environment: 'production', wp_url: 'https://acme.test' },
		]);

		const result = await service.listEnvironmentUsers(1, 7);
		expect(result).toEqual([]);
	});

	it('creates environment user payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{ id: 7, environment: 'production', wp_url: 'https://acme.test' },
		]);

		const result = await service.createEnvironmentUser(1, 7, {
			user_login: 'editor_user',
			user_email: 'editor@example.com',
			role: 'editor',
			send_email: true,
		});

		expect(result.user_login).toBe('editor_user');
		expect(result.roles).toEqual(['editor']);
	});

	it('returns magic login URL', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{ id: 7, environment: 'production', wp_url: 'https://acme.test' },
		]);

		const result = await service.magicLogin(1, 7, '123');
		expect(result.url).toContain('autologin=123');
	});

	it('updates github integration for project slug', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{ id: 1, name: 'Acme', slug: 'acme' },
		]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.updateGitHubIntegration('acme', {
			repo_url: 'https://github.com/acme/repo',
			branch: 'main',
			enabled: true,
		});

		expect(result.status).toBe('success');
		expect(result.repo_url).toBe('https://github.com/acme/repo');
		expect(result.branch).toBe('main');
	});

	it('returns queued payload for project git pull', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Acme',
				slug: 'acme',
				github_repo_url: 'https://github.com/acme/repo',
				github_branch: 'main',
			},
		]);

		const result = await service.pullRepository('acme', 'develop');
		expect(result.status).toBe('accepted');
		expect(result.branch).toBe('develop');
		expect(result.task_id).toBeDefined();
	});

	it('returns git status payload for project', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Acme',
				slug: 'acme',
				github_repo_url: 'https://github.com/acme/repo',
				github_branch: 'main',
			},
		]);

		const result = await service.getRepositoryStatus('acme');
		expect(result.project_name).toBe('Acme');
		expect(result.clean).toBe(true);
		expect(result.changed_files).toEqual([]);
	});

	it('returns accepted payload for bulk ddev start', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{ id: 1, name: 'Acme', slug: 'acme' },
		]);

		const result = await service.bulkStartDdev({
			projects: ['acme', 'missing'],
		});
		expect(result.status).toBe('accepted');
		expect(result.total_requested).toBe(2);
		expect(result.total_success).toBe(1);
		expect(result.total_failed).toBe(1);
	});

	it('runs compatibility security scan for project', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{ id: 1, name: 'Acme', wp_home: 'https://acme.test' },
			])
			.mockResolvedValueOnce([{ wp_url: 'https://staging.acme.test' }]);

		const result = await service.runSecurityScan(1, 8);
		expect(result.project_id).toBe(1);
		expect(result.overall_status).toBe('warn');
		expect(result.summary.warn).toBeGreaterThan(0);
	});

	it('returns paginated environment backups payload', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 1, name: 'Acme' }])
			.mockResolvedValueOnce([{ id: 7 }])
			.mockResolvedValueOnce([{ total: BigInt(1) }])
			.mockResolvedValueOnce([
				{
					id: 12,
					project_id: 1,
					name: 'Env Backup A',
					backup_type: 'database',
					storage_type: 'local',
					status: 'completed',
					storage_path: '/tmp/a.sql.gz',
					size_bytes: BigInt(500),
					created_at: new Date(),
					completed_at: new Date(),
					project_server_id: 7,
					drive_folder_id: null,
					storage_file_id: null,
				},
			]);

		const result = await service.getEnvironmentBackups(1, 7, 1, 10);
		expect(result.total).toBe(1);
		expect(result.items[0]?.name).toBe('Env Backup A');
	});

	it('returns clone queued payload', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 1, name: 'Acme' }])
			.mockResolvedValueOnce([{ id: 7, wp_url: 'https://acme.test' }])
			.mockResolvedValueOnce([{ id: 3, name: 'srv-3' }]);

		const result = await service.cloneProjectEnvironment(1, {
			source_env_id: 7,
			target_server_id: 3,
			target_domain: 'staging.acme.test',
		});

		expect(result.status).toBe('queued');
		expect(result.target_server).toBe('srv-3');
	});

	it('returns project-name compatibility payloads', async () => {
		prisma.$queryRaw.mockResolvedValue([
			{
				id: 1,
				name: 'Acme',
				slug: 'acme',
				path: '/srv/acme',
				wp_home: 'https://acme.test',
				github_repo_url: 'https://github.com/acme/repo',
				github_branch: 'main',
			},
		]);

		const status = await service.getProjectStatusByName('acme');
		const action = await service.executeProjectAction('acme', {
			action: 'git_pull',
		});
		const plugins = await service.getProjectPlugins('acme');
		const updateWp = await service.updateWordpressCore('acme');

		expect(status.project_name).toBe('acme');
		expect(action.status).toBe('accepted');
		expect(plugins.plugins).toEqual([]);
		expect(updateWp.status).toBe('success');
	});

	it('returns project deploy compatibility payloads', async () => {
		prisma.$queryRaw.mockResolvedValue([
			{
				id: 1,
				name: 'Acme',
				slug: 'acme',
				path: '/srv/acme',
				wp_home: 'https://acme.test',
				github_repo_url: 'https://github.com/acme/repo',
				github_branch: 'main',
			},
		]);

		const github = await service.deployFromGithub('acme', {
			repo_url: 'https://github.com/acme/repo',
			branch: 'main',
			run_composer: true,
		});
		const clone = await service.deployFromClone('acme', {
			source_project: 'acme',
			include_uploads: true,
		});
		const blank = await service.deployBlankBedrock('acme', {
			db_name: 'acme',
			db_user: 'forge',
		});
		const status = await service.getDeployStatus('acme', 'deploy-task-1');

		expect(github.status).toBe('queued');
		expect(clone.status).toBe('queued');
		expect(blank.status).toBe('queued');
		expect(status.project).toBe('acme');
		expect(status.task_id).toBe('deploy-task-1');
	});

	it('returns local workflow compatibility payloads', async () => {
		const local = await service.getLocalStatus('acme');
		const clone = await service.cloneToLocal('acme', {
			github_url: 'https://github.com/acme/repo',
		});
		const setup = await service.setupLocal('acme', {
			start_after_setup: true,
		});

		expect(local.exists).toBe(false);
		expect(clone.status).toBe('accepted');
		expect(setup.status).toBe('success');
	});

	it('returns project-server link details and sync task payload', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 8,
					project_id: 2,
					server_id: 1,
					environment: 'staging',
					wp_path: '/var/www/staging',
					wp_url: 'https://staging.acme.test',
					notes: null,
					is_primary: true,
					server_name: 'srv-1',
					created_at: new Date(),
					updated_at: new Date(),
				},
			])
			.mockResolvedValueOnce([
				{
					id: 8,
					project_id: 2,
					server_id: 1,
					environment: 'staging',
					wp_path: '/var/www/staging',
					wp_url: 'https://staging.acme.test',
					notes: null,
					is_primary: true,
					server_name: 'srv-1',
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);

		const link = await service.getProjectServerLink(2, 8);
		const sync = await service.syncEnvironment(2, 8, { sync_database: true });

		expect(link.credentials_count).toBe(0);
		expect(sync.status).toBe('pending');
		expect(sync.project_server_id).toBe(8);
	});
});
