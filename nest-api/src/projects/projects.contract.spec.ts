import {
	BadRequestException,
	INestApplication,
	NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

describe('Projects HTTP Contract', () => {
	let app: INestApplication;
	const projectsService = {
		getLocalProjects: jest.fn(),
		getProjectsStatus: jest.fn(),
		getAllTags: jest.fn(),
		getComprehensiveProjects: jest.fn(),
		getRemoteProjects: jest.fn(),
		getTaskStatus: jest.fn(),
		createProject: jest.fn(),
		deleteProject: jest.fn(),
		getProjectEnvironments: jest.fn(),
		listProjectServers: jest.fn(),
		getProjectBackups: jest.fn(),
		getEnvironmentBackups: jest.fn(),
		cloneProjectEnvironment: jest.fn(),
		cloneProjectFromDrive: jest.fn(),
		getProjectBackupDownloadMetadata: jest.fn(),
		getProjectDriveBackupIndex: jest.fn(),
		getProjectDriveSettings: jest.fn(),
		updateProjectDriveSettings: jest.fn(),
		linkEnvironment: jest.fn(),
		createEnvironmentBackup: jest.fn(),
		getProjectServerLink: jest.fn(),
		syncEnvironment: jest.fn(),
		listEnvironmentUsers: jest.fn(),
		createEnvironmentUser: jest.fn(),
		magicLogin: jest.fn(),
		updateEnvironment: jest.fn(),
		unlinkEnvironment: jest.fn(),
		refreshProjectWhois: jest.fn(),
		updateGitHubIntegration: jest.fn(),
		pullRepository: jest.fn(),
		deployFromGithub: jest.fn(),
		deployFromClone: jest.fn(),
		deployBlankBedrock: jest.fn(),
		getDeployStatus: jest.fn(),
		bulkStartDdev: jest.fn(),
		getRepositoryStatus: jest.fn(),
		executeProjectAction: jest.fn(),
		startDdev: jest.fn(),
		stopDdev: jest.fn(),
		restartDdev: jest.fn(),
		getProjectPlugins: jest.fn(),
		updateProjectPlugin: jest.fn(),
		updateAllProjectPlugins: jest.fn(),
		getProjectThemes: jest.fn(),
		updateProjectTheme: jest.fn(),
		updateAllProjectThemes: jest.fn(),
		updateWordpressCore: jest.fn(),
		getLocalStatus: jest.fn(),
		cloneToLocal: jest.fn(),
		setupLocal: jest.fn(),
		getProjectStatusByName: jest.fn(),
		runSecurityScan: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [ProjectsController],
			providers: [
				{
					provide: ProjectsService,
					useValue: projectsService,
				},
				{
					provide: AuthService,
					useValue: authService,
				},
			],
		}).compile();

		app = moduleRef.createNestApplication();
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('GET /projects/remote returns array payload', async () => {
		projectsService.getRemoteProjects.mockResolvedValueOnce([
			{ id: 1, name: 'Acme Site' },
		]);

		const response = await request(app.getHttpServer())
			.get('/projects/remote')
			.expect(200);

		expect(response.body).toEqual([{ id: 1, name: 'Acme Site' }]);
	});

	it('GET /projects returns status list payload', async () => {
		projectsService.getProjectsStatus.mockResolvedValueOnce([
			{ id: 1, name: 'Acme Site' },
		]);

		const response = await request(app.getHttpServer())
			.get('/projects')
			.expect(200);

		expect(response.body[0].name).toBe('Acme Site');
	});

	it('GET /projects/ returns status list payload via slash alias', async () => {
		projectsService.getProjectsStatus.mockResolvedValueOnce([
			{ id: 2, name: 'Slash Site' },
		]);

		const response = await request(app.getHttpServer())
			.get('/projects/')
			.expect(200);

		expect(response.body[0].name).toBe('Slash Site');
	});

	it('GET /projects/tags returns tags payload', async () => {
		projectsService.getAllTags.mockResolvedValueOnce({
			tags: ['client', 'vip'],
		});

		const response = await request(app.getHttpServer())
			.get('/projects/tags')
			.expect(200);

		expect(response.body.tags).toEqual(['client', 'vip']);
	});

	it('GET /projects/comprehensive returns comprehensive list payload', async () => {
		projectsService.getComprehensiveProjects.mockResolvedValueOnce([
			{ id: 1, name: 'Acme Site', source: 'remote' },
		]);

		const response = await request(app.getHttpServer())
			.get('/projects/comprehensive')
			.expect(200);

		expect(response.body[0].source).toBe('remote');
	});

	it('GET /projects/tasks/:taskId returns task status payload', async () => {
		projectsService.getTaskStatus.mockResolvedValueOnce({
			task_id: 'task-1',
			status: 'pending',
			message: 'Task is queued',
			progress: 0,
		});

		const response = await request(app.getHttpServer())
			.get('/projects/tasks/task-1')
			.expect(200);

		expect(response.body.task_id).toBe('task-1');
	});

	it('POST /projects returns created project object', async () => {
		projectsService.createProject.mockResolvedValueOnce({
			id: 2,
			name: 'Acme Site',
			slug: 'acme-site',
		});

		const response = await request(app.getHttpServer())
			.post('/projects')
			.send({ name: 'Acme Site', domain: 'https://acme.test' })
			.expect(201);

		expect(response.body.slug).toBe('acme-site');
	});

	it('POST /projects returns 400 detail for duplicate slug', async () => {
		projectsService.createProject.mockRejectedValueOnce(
			new BadRequestException({
				detail: "Project with slug 'acme-site' already exists",
			}),
		);

		const response = await request(app.getHttpServer())
			.post('/projects')
			.send({ name: 'Acme Site', domain: 'https://acme.test' })
			.expect(400);

		expect(response.body).toEqual({
			detail: "Project with slug 'acme-site' already exists",
		});
	});

	it('GET /projects/:id/environments returns environment list', async () => {
		projectsService.getProjectEnvironments.mockResolvedValueOnce([
			{ id: 7, environment: 'production' },
		]);

		const response = await request(app.getHttpServer())
			.get('/projects/2/environments')
			.expect(200);

		expect(response.body[0].environment).toBe('production');
	});

	it('GET /projects/:id/servers mirrors environment list', async () => {
		projectsService.listProjectServers.mockResolvedValueOnce([
			{ id: 9, environment: 'staging' },
		]);

		const response = await request(app.getHttpServer())
			.get('/projects/2/servers?environment=staging')
			.expect(200);

		expect(response.body[0].environment).toBe('staging');
	});

	it('POST /projects/:id/servers links server environment', async () => {
		projectsService.linkEnvironment.mockResolvedValueOnce({
			id: 11,
			environment: 'production',
		});

		const response = await request(app.getHttpServer())
			.post('/projects/2/servers')
			.send({
				environment: 'production',
				server_id: 1,
				wp_url: 'https://acme.test',
				wp_path: '/var/www/acme',
				database_name: 'acme',
				database_user: 'acme',
				database_password: 'secret',
			})
			.expect(201);

		expect(response.body.id).toBe(11);
	});

	it('GET /projects/:id/servers/:linkId returns link details', async () => {
		projectsService.getProjectServerLink.mockResolvedValueOnce({
			id: 8,
			project_id: 2,
			server_id: 1,
			credentials_count: 0,
		});

		const response = await request(app.getHttpServer())
			.get('/projects/2/servers/8')
			.expect(200);

		expect(response.body.id).toBe(8);
	});

	it('POST /projects/:id/servers/:linkId/sync returns task payload', async () => {
		projectsService.syncEnvironment.mockResolvedValueOnce({
			task_id: 'sync-1',
			status: 'pending',
			message: 'Preparing sync',
		});

		const response = await request(app.getHttpServer())
			.post('/projects/2/servers/8/sync')
			.send({ sync_database: true })
			.expect(201);

		expect(response.body.task_id).toBe('sync-1');
	});

	it('GET /projects/:id/backups returns backup list payload', async () => {
		projectsService.getProjectBackups.mockResolvedValueOnce([
			{ id: 1, name: 'Backup A', backup_type: 'full' },
		]);

		const response = await request(app.getHttpServer())
			.get('/projects/2/backups?page=1&page_size=10')
			.expect(200);

		expect(response.body[0].name).toBe('Backup A');
	});

	it('GET /projects/:id/backups/download returns binary payload', async () => {
		projectsService.getProjectBackupDownloadMetadata.mockResolvedValueOnce({
			filename: 'backup-a.tar.gz',
			content: 'abc',
		});

		const response = await request(app.getHttpServer())
			.get(
				'/projects/2/backups/download?path=%2Ftmp%2Fbackup-a.tar.gz&storage=local',
			)
			.expect(200);

		expect(response.headers['content-type']).toContain(
			'application/octet-stream',
		);
		expect(response.headers['content-disposition']).toContain(
			'backup-a.tar.gz',
		);
	});

	it('GET /projects/:id/drive/backups/index returns drive index payload', async () => {
		projectsService.getProjectDriveBackupIndex.mockResolvedValueOnce({
			environments: { production: [] },
			backup_root: 'WebDev/Projects/Acme/Backups',
		});

		const response = await request(app.getHttpServer())
			.get('/projects/2/drive/backups/index?environment=production')
			.expect(200);

		expect(response.body.environments.production).toEqual([]);
	});

	it('GET /projects/:id/drive returns drive settings payload', async () => {
		projectsService.getProjectDriveSettings.mockResolvedValueOnce({
			gdrive_connected: true,
			gdrive_global_configured: true,
			gdrive_global_remote: 'gdrive',
			gdrive_folder_id: null,
			gdrive_backups_folder_id: 'backup-folder',
			gdrive_assets_folder_id: null,
			gdrive_docs_folder_id: null,
			gdrive_last_sync: null,
		});

		const response = await request(app.getHttpServer())
			.get('/projects/2/drive')
			.expect(200);

		expect(response.body.gdrive_backups_folder_id).toBe('backup-folder');
	});

	it('PATCH /projects/:id/drive returns updated drive settings', async () => {
		projectsService.updateProjectDriveSettings.mockResolvedValueOnce({
			gdrive_connected: true,
			gdrive_global_configured: true,
			gdrive_global_remote: 'gdrive',
			gdrive_folder_id: null,
			gdrive_backups_folder_id: 'backup-folder',
			gdrive_assets_folder_id: null,
			gdrive_docs_folder_id: null,
			gdrive_last_sync: null,
		});

		const response = await request(app.getHttpServer())
			.patch('/projects/2/drive')
			.send({ gdrive_backups_folder_id: 'backup-folder' })
			.expect(200);

		expect(response.body.gdrive_connected).toBe(true);
	});

	it('POST /projects/:id/environments/:envId/backups returns accepted payload', async () => {
		projectsService.createEnvironmentBackup.mockResolvedValueOnce({
			task_id: 'task-backup-1',
			status: 'pending',
			message: 'Backup queued',
			backup_id: 12,
		});

		const response = await request(app.getHttpServer())
			.post(
				'/projects/2/environments/7/backups?backup_type=database&storage_type=gdrive',
			)
			.expect(202);

		expect(response.body.task_id).toBe('task-backup-1');
	});

	it('GET /projects/:id/environments/:envId/backups returns env backup payload', async () => {
		projectsService.getEnvironmentBackups.mockResolvedValueOnce({
			items: [{ id: 1, name: 'Env Backup A' }],
			total: 1,
			page: 1,
			page_size: 10,
		});

		const response = await request(app.getHttpServer())
			.get('/projects/2/environments/7/backups?page=1&page_size=10')
			.expect(200);

		expect(response.body.total).toBe(1);
		expect(response.body.items[0].name).toBe('Env Backup A');
	});

	it('POST /projects/:id/clone returns queued clone payload', async () => {
		projectsService.cloneProjectEnvironment.mockResolvedValueOnce({
			status: 'queued',
			task_id: 'clone-task-1',
			target_domain: 'staging.acme.test',
		});

		const response = await request(app.getHttpServer())
			.post('/projects/2/clone')
			.send({
				source_env_id: 7,
				target_server_id: 3,
				target_domain: 'staging.acme.test',
			})
			.expect(201);

		expect(response.body.status).toBe('queued');
	});

	it('POST /projects/:id/clone/drive returns accepted clone payload', async () => {
		projectsService.cloneProjectFromDrive.mockResolvedValueOnce({
			status: 'accepted',
			task_id: 'clone-drive-task-1',
			target_domain: 'staging.acme.test',
		});

		const response = await request(app.getHttpServer())
			.post('/projects/2/clone/drive')
			.send({
				target_server_id: 3,
				target_domain: 'staging.acme.test',
				backup_timestamp: '20260101_010203',
			})
			.expect(202);

		expect(response.body.status).toBe('accepted');
	});

	it('GET /projects/:id/environments/:envId/users returns user list', async () => {
		projectsService.listEnvironmentUsers.mockResolvedValueOnce([
			{
				ID: 1,
				user_login: 'admin',
				user_email: 'admin@example.com',
				display_name: 'Admin',
				roles: ['administrator'],
			},
		]);

		const response = await request(app.getHttpServer())
			.get('/projects/2/environments/7/users')
			.expect(200);

		expect(response.body[0].user_login).toBe('admin');
	});

	it('POST /projects/:id/environments/:envId/users returns created user', async () => {
		projectsService.createEnvironmentUser.mockResolvedValueOnce({
			ID: 2,
			user_login: 'editor',
			user_email: 'editor@example.com',
			display_name: 'Editor',
			roles: ['editor'],
		});

		const response = await request(app.getHttpServer())
			.post('/projects/2/environments/7/users')
			.send({ user_login: 'editor', user_email: 'editor@example.com' })
			.expect(201);

		expect(response.body.user_login).toBe('editor');
	});

	it('POST /projects/:id/environments/:envId/users/:userId/login returns magic URL', async () => {
		projectsService.magicLogin.mockResolvedValueOnce({
			url: 'https://acme.test/wp-login.php?autologin=2',
		});

		const response = await request(app.getHttpServer())
			.post('/projects/2/environments/7/users/2/login')
			.expect(201);

		expect(response.body.url).toContain('autologin=2');
	});

	it('POST /projects/:id/whois/refresh returns success payload', async () => {
		projectsService.refreshProjectWhois.mockResolvedValueOnce({
			status: 'success',
			domain_id: 0,
			domain_name: 'acme.test',
			expiry_date: null,
			registration_date: null,
			registrar_name: null,
			last_whois_check: '2026-01-01T00:00:00.000Z',
		});

		const response = await request(app.getHttpServer())
			.post('/projects/2/whois/refresh')
			.expect(201);

		expect(response.body.status).toBe('success');
		expect(response.body.domain_name).toBe('acme.test');
	});

	it('PUT /projects/:name/github returns integration payload', async () => {
		projectsService.updateGitHubIntegration.mockResolvedValueOnce({
			status: 'success',
			project_name: 'Acme Site',
			enabled: true,
			repo_url: 'https://github.com/acme/site',
			branch: 'main',
		});

		const response = await request(app.getHttpServer())
			.put('/projects/acme-site/github')
			.send({ repo_url: 'https://github.com/acme/site', branch: 'main' })
			.expect(200);

		expect(response.body.status).toBe('success');
		expect(response.body.repo_url).toBe('https://github.com/acme/site');
	});

	it('POST /projects/:name/git/pull returns accepted payload', async () => {
		projectsService.pullRepository.mockResolvedValueOnce({
			status: 'accepted',
			task_id: 'git-task-1',
			branch: 'main',
		});

		const response = await request(app.getHttpServer())
			.post('/projects/acme-site/git/pull')
			.send({ branch: 'main' })
			.expect(201);

		expect(response.body.task_id).toBe('git-task-1');
		expect(response.body.branch).toBe('main');
	});

	it('POST /projects/:name/deploy/github returns queued payload', async () => {
		projectsService.deployFromGithub.mockResolvedValueOnce({
			status: 'queued',
			message: 'Deployment queued',
			task_id: 'deploy-task-1',
			project: 'acme-site',
		});

		const response = await request(app.getHttpServer())
			.post('/projects/acme-site/deploy/github')
			.send({ repo_url: 'https://github.com/acme/site', branch: 'main' })
			.expect(201);

		expect(response.body.status).toBe('queued');
		expect(response.body.task_id).toBe('deploy-task-1');
	});

	it('POST /projects/:name/deploy/clone returns queued payload', async () => {
		projectsService.deployFromClone.mockResolvedValueOnce({
			status: 'queued',
			message: 'Cloning queued',
			task_id: 'deploy-task-2',
			project: 'acme-site',
		});

		const response = await request(app.getHttpServer())
			.post('/projects/acme-site/deploy/clone')
			.send({ source_project: 'base-site', include_uploads: true })
			.expect(201);

		expect(response.body.status).toBe('queued');
		expect(response.body.task_id).toBe('deploy-task-2');
	});

	it('POST /projects/:name/deploy/blank returns queued payload', async () => {
		projectsService.deployBlankBedrock.mockResolvedValueOnce({
			status: 'queued',
			message: 'Fresh Bedrock installation queued',
			task_id: 'deploy-task-3',
			project: 'acme-site',
		});

		const response = await request(app.getHttpServer())
			.post('/projects/acme-site/deploy/blank')
			.send({ db_name: 'acme', db_user: 'forge' })
			.expect(201);

		expect(response.body.status).toBe('queued');
		expect(response.body.task_id).toBe('deploy-task-3');
	});

	it('GET /projects/:name/deploy/status/:taskId returns task status payload', async () => {
		projectsService.getDeployStatus.mockResolvedValueOnce({
			project: 'acme-site',
			task_id: 'deploy-task-1',
			status: 'PENDING',
			result: null,
		});

		const response = await request(app.getHttpServer())
			.get('/projects/acme-site/deploy/status/deploy-task-1')
			.expect(200);

		expect(response.body.project).toBe('acme-site');
		expect(response.body.task_id).toBe('deploy-task-1');
	});

	it('POST /projects/bulk/ddev/start returns accepted bulk payload', async () => {
		projectsService.bulkStartDdev.mockResolvedValueOnce({
			status: 'accepted',
			task_id: 'bulk-ddev-1',
			total_requested: 2,
			total_success: 1,
			total_failed: 1,
			success: [{ project_id: 1, status: 'queued' }],
			failed: [{ project: 'missing', error: 'Project not found' }],
			message: 'Bulk DDEV start queued for 1 project(s)',
		});

		const response = await request(app.getHttpServer())
			.post('/projects/bulk/ddev/start')
			.send({ projects: ['acme-site', 'missing'] })
			.expect(201);

		expect(response.body.status).toBe('accepted');
		expect(response.body.total_requested).toBe(2);
	});

	it('GET /projects/:name/git/status returns repository status payload', async () => {
		projectsService.getRepositoryStatus.mockResolvedValueOnce({
			project_name: 'Acme Site',
			clean: true,
			ahead: 0,
			behind: 0,
			changed_files: [],
		});

		const response = await request(app.getHttpServer())
			.get('/projects/acme-site/git/status')
			.expect(200);

		expect(response.body.project_name).toBe('Acme Site');
		expect(response.body.clean).toBe(true);
	});

	it('POST /projects/:name/ddev/start returns start payload', async () => {
		projectsService.startDdev.mockResolvedValueOnce({
			status: 'success',
			message: 'DDEV started for acme-site',
		});

		const response = await request(app.getHttpServer())
			.post('/projects/acme-site/ddev/start')
			.expect(201);

		expect(response.body.status).toBe('success');
	});

	it('GET /projects/:name returns project status payload', async () => {
		projectsService.getProjectStatusByName.mockResolvedValueOnce({
			project_name: 'acme-site',
			directory: '/tmp/acme-site',
			wp_home: 'https://acme.test',
			ddev_status: 'unknown',
			git_status: 'unknown',
		});

		const response = await request(app.getHttpServer())
			.get('/projects/acme-site')
			.expect(200);

		expect(response.body.project_name).toBe('acme-site');
	});

	it('POST /projects/:id/security/scan returns scan summary payload', async () => {
		projectsService.runSecurityScan.mockResolvedValueOnce({
			project_id: 2,
			overall_status: 'warn',
			score: 50,
			summary: { pass: 1, warn: 1, fail: 1 },
			checks: [],
		});

		const response = await request(app.getHttpServer())
			.post('/projects/2/security/scan?env_id=7')
			.expect(201);

		expect(response.body.overall_status).toBe('warn');
		expect(response.body.score).toBe(50);
	});

	it('PUT /projects/:projectId/environments/:envId returns success envelope', async () => {
		projectsService.updateEnvironment.mockResolvedValueOnce({
			status: 'success',
			data: { id: 7, environment: 'staging' },
		});

		const response = await request(app.getHttpServer())
			.put('/projects/2/environments/7')
			.send({ environment: 'staging' })
			.expect(200);

		expect(response.body).toEqual({
			status: 'success',
			data: { id: 7, environment: 'staging' },
		});
	});

	it('DELETE /projects/:id returns 404 detail when missing', async () => {
		projectsService.deleteProject.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Project not found' }),
		);

		const response = await request(app.getHttpServer())
			.delete('/projects/999')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Project not found' });
	});
});
