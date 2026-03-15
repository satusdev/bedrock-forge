import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

describe('Status HTTP Contract', () => {
	let app: INestApplication;
	const statusService = {
		getStatusPage: jest.fn(),
		getStatusHistory: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [StatusController],
			providers: [
				{ provide: StatusService, useValue: statusService },
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

	it('GET /status/:projectId returns status page payload', async () => {
		statusService.getStatusPage.mockResolvedValueOnce({
			project_name: 'Acme',
			overall_status: 'operational',
			monitors: [],
			recent_incidents: [],
			incident_pagination: { page: 1, page_size: 10, total: 0 },
			last_updated: new Date().toISOString(),
		});

		const response = await request(app.getHttpServer())
			.get('/status/1?page=1&page_size=10')
			.expect(200);

		expect(response.body.project_name).toBe('Acme');
		expect(response.body.overall_status).toBe('operational');
	});

	it('GET /status/:projectId/history returns history payload', async () => {
		statusService.getStatusHistory.mockResolvedValueOnce({
			project_name: 'Acme',
			period_days: 30,
			history: [],
			average_uptime: 100,
		});

		const response = await request(app.getHttpServer())
			.get('/status/1/history?days=30')
			.expect(200);

		expect(response.body.period_days).toBe(30);
	});

	it('GET /status/:projectId returns 404 detail when missing', async () => {
		statusService.getStatusPage.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Project not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/status/999')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Project not found' });
	});
});
