import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('Dashboard HTTP Contract', () => {
	let app: INestApplication;
	const dashboardService = {
		getStats: jest.fn(),
		getConfig: jest.fn(),
		updateConfig: jest.fn(),
		updateTheme: jest.fn(),
		updateLayout: jest.fn(),
		updateNotifications: jest.fn(),
		updateWidget: jest.fn(),
		getWidget: jest.fn(),
		resetConfig: jest.fn(),
		exportConfig: jest.fn(),
		importConfig: jest.fn(),
		health: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [DashboardController],
			providers: [{ provide: DashboardService, useValue: dashboardService }],
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

	it('GET /dashboard/stats returns stats payload', async () => {
		dashboardService.getStats.mockResolvedValueOnce({ total_projects: 1 });

		const response = await request(app.getHttpServer())
			.get('/dashboard/stats')
			.expect(200);

		expect(response.body.total_projects).toBe(1);
	});

	it('GET /dashboard/health returns health payload', async () => {
		dashboardService.health.mockReturnValueOnce({ status: 'healthy' });

		const response = await request(app.getHttpServer())
			.get('/dashboard/health')
			.expect(200);

		expect(response.body.status).toBe('healthy');
	});
});
