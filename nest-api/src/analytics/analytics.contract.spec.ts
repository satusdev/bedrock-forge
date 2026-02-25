import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('Analytics HTTP Contract', () => {
	let app: INestApplication;
	const analyticsService = {
		runGa4Report: jest.fn(),
		runLighthouseReport: jest.fn(),
		listReports: jest.fn(),
		getReport: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [AnalyticsController],
			providers: [
				{ provide: AnalyticsService, useValue: analyticsService },
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

	it('POST /analytics/ga4/run returns report payload', async () => {
		analyticsService.runGa4Report.mockResolvedValueOnce({
			id: 1,
			report_type: 'ga4',
		});

		const response = await request(app.getHttpServer())
			.post('/analytics/ga4/run')
			.send({ project_id: 1 })
			.expect(201);

		expect(response.body.report_type).toBe('ga4');
	});

	it('GET /analytics/reports returns list payload', async () => {
		analyticsService.listReports.mockResolvedValueOnce({
			items: [{ id: 2, report_type: 'lighthouse' }],
			count: 1,
		});

		const response = await request(app.getHttpServer())
			.get('/analytics/reports?project_id=1')
			.expect(200);

		expect(response.body.count).toBe(1);
	});

	it('GET /analytics/reports/:id returns 404 detail when missing', async () => {
		analyticsService.getReport.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Report not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/analytics/reports/404')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Report not found' });
	});
});
