import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { GithubController } from './github.controller';
import { GithubService } from './github.service';

describe('Github HTTP Contract', () => {
	let app: INestApplication;
	const githubService = {
		getAuthStatus: jest.fn(),
		getAuthUrl: jest.fn(),
		authenticate: jest.fn(),
		disconnect: jest.fn(),
		getRepositoryInfo: jest.fn(),
		getRepositoryBranches: jest.fn(),
		getRepositoryCommits: jest.fn(),
		getRepositoryPullRequests: jest.fn(),
		getRepositoryDeployments: jest.fn(),
		cloneRepository: jest.fn(),
		createWebhook: jest.fn(),
		getWebhooks: jest.fn(),
		createDeployment: jest.fn(),
		pullProjectChanges: jest.fn(),
		getProjectStatus: jest.fn(),
		updateProjectIntegration: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [GithubController],
			providers: [
				{ provide: GithubService, useValue: githubService },
				{ provide: AuthService, useValue: authService },
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

	it('GET /github/auth/status returns auth payload', async () => {
		githubService.getAuthStatus.mockResolvedValueOnce({
			authenticated: true,
			available: true,
			login: 'pat-user',
		});

		const response = await request(app.getHttpServer())
			.get('/github/auth/status')
			.expect(200);

		expect(response.body.authenticated).toBe(true);
	});

	it('GET /github/repository/:repo/info returns repo payload', async () => {
		githubService.getRepositoryInfo.mockReturnValueOnce({
			full_name: 'acme/repo',
		});

		const response = await request(app.getHttpServer())
			.get('/github/repository/https%3A%2F%2Fgithub.com%2Facme%2Frepo/info')
			.expect(200);

		expect(response.body.full_name).toBe('acme/repo');
	});

	it('GET /github/repos/info returns legacy repo payload', async () => {
		githubService.getRepositoryInfo.mockReturnValueOnce({
			full_name: 'acme/repo',
		});

		const response = await request(app.getHttpServer())
			.get('/github/repos/info?repo_url=https://github.com/acme/repo')
			.expect(200);

		expect(response.body.full_name).toBe('acme/repo');
	});

	it('POST /github/projects/:projectName/pull returns accepted payload', async () => {
		githubService.pullProjectChanges.mockReturnValueOnce({
			status: 'accepted',
			task_id: 'task-1',
		});

		const response = await request(app.getHttpServer())
			.post('/github/projects/acme-site/pull')
			.expect(201);

		expect(response.body.status).toBe('accepted');
	});

	it('POST /github/auth returns 400 detail for invalid payload', async () => {
		githubService.authenticate.mockRejectedValueOnce(
			new BadRequestException({ detail: 'Token or code is required' }),
		);

		const response = await request(app.getHttpServer())
			.post('/github/auth')
			.send({})
			.expect(400);

		expect(response.body).toEqual({ detail: 'Token or code is required' });
	});
});
