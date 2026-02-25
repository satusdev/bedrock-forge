import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { MonitorsController } from './monitors.controller';
import { MonitorsService } from './monitors.service';

describe('Monitors HTTP Contract', () => {
	let app: INestApplication;
	const monitorsService = {
		listMonitors: jest.fn(),
		listByProject: jest.fn(),
		getOverview: jest.fn(),
		createMonitor: jest.fn(),
		getMonitor: jest.fn(),
		updateMonitor: jest.fn(),
		deleteMonitor: jest.fn(),
		pauseMonitor: jest.fn(),
		resumeMonitor: jest.fn(),
		togglePause: jest.fn(),
		triggerCheck: jest.fn(),
		getHistory: jest.fn(),
		checkSsl: jest.fn(),
		getAlerts: jest.fn(),
		updateAlerts: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [MonitorsController],
			providers: [
				{ provide: MonitorsService, useValue: monitorsService },
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

	it('GET /monitors returns monitor list', async () => {
		monitorsService.listMonitors.mockResolvedValueOnce([
			{ id: 1, name: 'Main monitor', monitor_type: 'uptime' },
		]);
		const response = await request(app.getHttpServer())
			.get('/monitors')
			.expect(200);
		expect(response.body[0].name).toBe('Main monitor');
	});

	it('POST /monitors creates monitor', async () => {
		monitorsService.createMonitor.mockResolvedValueOnce({
			id: 2,
			name: 'API monitor',
			monitor_type: 'uptime',
		});
		const response = await request(app.getHttpServer())
			.post('/monitors')
			.send({ name: 'API monitor', url: 'https://api.acme.test' })
			.expect(201);
		expect(response.body.id).toBe(2);
	});

	it('GET /monitors/:id returns 404 detail when missing', async () => {
		monitorsService.getMonitor.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Monitor not found' }),
		);
		const response = await request(app.getHttpServer())
			.get('/monitors/999')
			.expect(404);
		expect(response.body).toEqual({ detail: 'Monitor not found' });
	});

	it('POST /monitors/:id/check returns accepted task payload', async () => {
		monitorsService.triggerCheck.mockResolvedValueOnce({
			status: 'accepted',
			task_id: 'task-1',
			monitor_id: 3,
		});
		const response = await request(app.getHttpServer())
			.post('/monitors/3/check')
			.expect(201);
		expect(response.body.status).toBe('accepted');
	});

	it('GET /monitors/stats/overview returns aggregate stats', async () => {
		monitorsService.getOverview.mockResolvedValueOnce({
			total: 3,
			active: 2,
			paused: 1,
			status: { up: 2, down: 1, unknown: 0 },
			average_uptime: 98.2,
		});
		const response = await request(app.getHttpServer())
			.get('/monitors/stats/overview')
			.expect(200);
		expect(response.body.total).toBe(3);
	});
});
