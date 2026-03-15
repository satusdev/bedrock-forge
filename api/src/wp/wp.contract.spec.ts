import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { WpController } from './wp.controller';
import { WpService } from './wp.service';

describe('WP HTTP Contract', () => {
	let app: INestApplication;
	const wpService = {
		runCommand: jest.fn(),
		getSiteState: jest.fn(),
		triggerSiteScan: jest.fn(),
		triggerBulkUpdate: jest.fn(),
		getPendingUpdates: jest.fn(),
		getUpdateHistory: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [WpController],
			providers: [
				{ provide: WpService, useValue: wpService },
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

	it('POST /wp/commands/run returns queued payload', async () => {
		wpService.runCommand.mockResolvedValueOnce({
			task_id: 'task-1',
			status: 'queued',
			message: 'Command queued',
		});

		const response = await request(app.getHttpServer())
			.post('/wp/commands/run')
			.send({
				project_server_id: 3,
				command: 'plugin',
				args: ['list'],
			})
			.expect(201);

		expect(response.body.status).toBe('queued');
		expect(response.body.task_id).toBe('task-1');
	});

	it('POST /wp/runner/command returns queued payload via legacy alias', async () => {
		wpService.runCommand.mockResolvedValueOnce({
			task_id: 'task-legacy-1',
			status: 'queued',
			message: 'WP-CLI command queued',
		});

		const response = await request(app.getHttpServer())
			.post('/wp/runner/command')
			.send({
				project_server_id: 3,
				command: 'plugin',
				args: ['list'],
			})
			.expect(201);

		expect(response.body.task_id).toBe('task-legacy-1');
	});

	it('GET /wp/sites/:projectServerId/state returns cached state payload', async () => {
		wpService.getSiteState.mockResolvedValueOnce({
			project_server_id: 3,
			environment: 'production',
			plugins_count: 10,
		});

		const response = await request(app.getHttpServer())
			.get('/wp/sites/3/state')
			.expect(200);

		expect(response.body.environment).toBe('production');
	});

	it('POST /wp/sites/:projectServerId/scan returns synchronous scan result', async () => {
		wpService.triggerSiteScan.mockResolvedValueOnce({
			status: 'completed',
			message: 'WP scan completed',
			project_server_id: 3,
			plugins_count: 2,
		});

		const response = await request(app.getHttpServer())
			.post('/wp/sites/3/scan')
			.expect(201);

		expect(response.body.status).toBe('completed');
		expect(response.body.project_server_id).toBe(3);
	});

	it('POST /wp/updates/bulk returns bulk update task payload', async () => {
		wpService.triggerBulkUpdate.mockResolvedValueOnce({
			task_id: 'bulk-1',
			sites_queued: 3,
			message: 'Update queued for 3 sites',
		});

		const response = await request(app.getHttpServer())
			.post('/wp/updates/bulk')
			.send({ update_type: 'core', project_server_ids: [1, 2, 3] })
			.expect(201);

		expect(response.body.task_id).toBe('bulk-1');
		expect(response.body.sites_queued).toBe(3);
	});

	it('GET /wp/updates returns pending updates payload', async () => {
		wpService.getPendingUpdates.mockResolvedValueOnce({
			total_sites: 2,
			sites_with_updates: 1,
			total_updates: 1,
			updates: [
				{
					project_server_id: 3,
					update_type: 'core',
					package_name: 'wordpress',
				},
			],
		});

		const response = await request(app.getHttpServer())
			.get('/wp/updates')
			.expect(200);

		expect(response.body.total_updates).toBe(1);
	});

	it('GET /wp/updates/history returns history payload', async () => {
		wpService.getUpdateHistory.mockResolvedValueOnce({
			total: 1,
			updates: [
				{
					id: 1,
					project_server_id: 3,
					status: 'success',
				},
			],
		});

		const response = await request(app.getHttpServer())
			.get('/wp/updates/history?project_server_id=3&limit=25')
			.expect(200);

		expect(response.body.total).toBe(1);
		expect(response.body.updates[0].project_server_id).toBe(3);
	});
});
