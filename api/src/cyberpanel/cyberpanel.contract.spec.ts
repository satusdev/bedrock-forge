import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { CyberpanelController } from './cyberpanel.controller';
import { CyberpanelService } from './cyberpanel.service';

describe('Cyberpanel HTTP Contract', () => {
	let app: INestApplication;
	const cyberpanelService = {
		verify: jest.fn(),
		listWebsites: jest.fn(),
		createWebsite: jest.fn(),
		deleteWebsite: jest.fn(),
		listDatabases: jest.fn(),
		createDatabase: jest.fn(),
		deleteDatabase: jest.fn(),
		issueSsl: jest.fn(),
		getWebsiteStats: jest.fn(),
		changePhpVersion: jest.fn(),
		scanWordpressSites: jest.fn(),
		getServerInfo: jest.fn(),
		listUsers: jest.fn(),
		createUser: jest.fn(),
		getUser: jest.fn(),
		updateUser: jest.fn(),
		deleteUser: jest.fn(),
		changeUserPassword: jest.fn(),
		revealUserPassword: jest.fn(),
		suspendUser: jest.fn(),
		unsuspendUser: jest.fn(),
		listPackages: jest.fn(),
		listAcls: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [CyberpanelController],
			providers: [{ provide: CyberpanelService, useValue: cyberpanelService }],
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

	it('GET /cyberpanel/servers/:id/verify returns verify payload', async () => {
		cyberpanelService.verify.mockResolvedValueOnce({
			verified: true,
			server_id: 1,
			message: 'Connection verified',
		});

		const response = await request(app.getHttpServer())
			.get('/cyberpanel/servers/1/verify')
			.expect(200);

		expect(response.body.verified).toBe(true);
	});

	it('GET /cyberpanel/servers/:id/websites returns websites payload', async () => {
		cyberpanelService.listWebsites.mockResolvedValueOnce({
			websites: [{ domain: 'site.test' }],
			total: 1,
		});

		const response = await request(app.getHttpServer())
			.get('/cyberpanel/servers/1/websites')
			.expect(200);

		expect(response.body.total).toBe(1);
	});

	it('POST /cyberpanel/servers/:id/databases returns create payload', async () => {
		cyberpanelService.createDatabase.mockResolvedValueOnce({
			status: 'success',
			database: 'db1',
			user: 'u1',
			message: 'Database created successfully',
		});

		const response = await request(app.getHttpServer())
			.post('/cyberpanel/servers/1/databases')
			.send({
				domain: 'site.test',
				db_name: 'db1',
				db_user: 'u1',
				db_password: 'password123',
			})
			.expect(201);

		expect(response.body.database).toBe('db1');
	});

	it('POST /cyberpanel/servers/:id/ssl/:domain returns ssl payload', async () => {
		cyberpanelService.issueSsl.mockResolvedValueOnce({
			status: 'success',
			domain: 'site.test',
			message: 'SSL certificate issued successfully',
		});

		const response = await request(app.getHttpServer())
			.post('/cyberpanel/servers/1/ssl/site.test')
			.expect(201);

		expect(response.body.status).toBe('success');
	});

	it('POST /cyberpanel/servers/:id/websites/:domain/ssl returns ssl payload', async () => {
		cyberpanelService.issueSsl.mockResolvedValueOnce({
			status: 'success',
			domain: 'site.test',
			message: 'SSL certificate issued successfully',
		});

		const response = await request(app.getHttpServer())
			.post('/cyberpanel/servers/1/websites/site.test/ssl')
			.expect(201);

		expect(response.body.status).toBe('success');
	});

	it('GET /cyberpanel/servers/:id/users returns user list payload', async () => {
		cyberpanelService.listUsers.mockResolvedValueOnce({
			users: [{ username: 'editor1' }],
			total: 1,
			synced: false,
		});

		const response = await request(app.getHttpServer())
			.get('/cyberpanel/servers/1/users')
			.expect(200);

		expect(response.body.total).toBe(1);
	});
});
