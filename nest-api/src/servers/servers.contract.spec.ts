import {
	BadRequestException,
	INestApplication,
	NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

describe('Servers HTTP Contract', () => {
	let app: INestApplication;
	const serversService = {
		listServers: jest.fn(),
		createServer: jest.fn(),
		getServer: jest.fn(),
		updateServer: jest.fn(),
		deleteServer: jest.fn(),
		testServerConnection: jest.fn(),
		getHealth: jest.fn(),
		triggerHealthCheck: jest.fn(),
		getPanelLoginUrl: jest.fn(),
		getPanelSessionUrl: jest.fn(),
		getAllTags: jest.fn(),
		updateServerTags: jest.fn(),
		getServerTags: jest.fn(),
		scanSites: jest.fn(),
		scanDirectories: jest.fn(),
		getDirectories: jest.fn(),
		readEnv: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [ServersController],
			providers: [
				{ provide: ServersService, useValue: serversService },
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

	it('GET /servers returns list payload', async () => {
		serversService.listServers.mockResolvedValueOnce([
			{ id: 1, name: 'Server A', hostname: 'srv-a.test' },
		]);

		const response = await request(app.getHttpServer())
			.get('/servers')
			.expect(200);

		expect(response.body[0].name).toBe('Server A');
	});

	it('POST /servers returns created server', async () => {
		serversService.createServer.mockResolvedValueOnce({
			id: 2,
			name: 'Server B',
			hostname: 'srv-b.test',
		});

		const response = await request(app.getHttpServer())
			.post('/servers')
			.send({ name: 'Server B', hostname: 'srv-b.test' })
			.expect(201);

		expect(response.body.id).toBe(2);
	});

	it('GET /servers/:id returns 404 detail when missing', async () => {
		serversService.getServer.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Server not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/servers/999')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Server not found' });
	});

	it('POST /servers/:id/test returns test result', async () => {
		serversService.testServerConnection.mockResolvedValueOnce({
			success: true,
			message: 'Connection successful',
			response_time_ms: 120,
		});

		const response = await request(app.getHttpServer())
			.post('/servers/1/test')
			.expect(201);

		expect(response.body.success).toBe(true);
	});

	it('GET /servers/:id/health returns health payload', async () => {
		serversService.getHealth.mockResolvedValueOnce({
			server_id: 1,
			server_name: 'srv',
			hostname: 'srv.test',
			status: 'online',
			last_health_check: null,
			panel_verified: false,
			panel_url: null,
			panel_type: 'none',
		});

		const response = await request(app.getHttpServer())
			.get('/servers/1/health')
			.expect(200);

		expect(response.body.status).toBe('online');
	});

	it('POST /servers/:id/health/trigger returns accepted payload', async () => {
		serversService.triggerHealthCheck.mockResolvedValueOnce({
			status: 'accepted',
			message: 'Health check queued',
			server_id: 1,
		});

		const response = await request(app.getHttpServer())
			.post('/servers/1/health/trigger')
			.expect(201);

		expect(response.body.status).toBe('accepted');
	});

	it('GET /servers/:id/panel/login-url returns 400 detail when missing panel config', async () => {
		serversService.getPanelLoginUrl.mockRejectedValueOnce(
			new BadRequestException({
				detail: 'No panel URL configured for this server',
			}),
		);

		const response = await request(app.getHttpServer())
			.get('/servers/1/panel/login-url')
			.expect(400);

		expect(response.body).toEqual({
			detail: 'No panel URL configured for this server',
		});
	});

	it('PUT /servers/:id/tags returns updated tag payload', async () => {
		serversService.updateServerTags.mockResolvedValueOnce({
			status: 'success',
			server_id: 4,
			tags: ['prod'],
		});

		const response = await request(app.getHttpServer())
			.put('/servers/4/tags')
			.send(['Prod', 'prod'])
			.expect(200);

		expect(response.body.tags).toEqual(['prod']);
	});

	it('GET /servers/:id/directories returns directory payload', async () => {
		serversService.getDirectories.mockResolvedValueOnce({
			server_id: 5,
			server_name: 'srv',
			directories: ['/var/www/site'],
			uploads_path: null,
		});

		const response = await request(app.getHttpServer())
			.get('/servers/5/directories')
			.expect(200);

		expect(response.body.directories[0]).toBe('/var/www/site');
	});

	it('POST /servers/:id/read-env returns env payload', async () => {
		serversService.readEnv.mockResolvedValueOnce({
			success: true,
			server_id: 5,
			path: '/var/www/site',
			env: { db_name: 'wordpress' },
		});

		const response = await request(app.getHttpServer())
			.post('/servers/5/read-env?path=/var/www/site')
			.expect(201);

		expect(response.body.success).toBe(true);
		expect(response.body.env.db_name).toBe('wordpress');
	});
});
