import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

describe('Activity HTTP Contract', () => {
	let app: INestApplication;
	const activityService = {
		getFeed: jest.fn(),
		getSummary: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [ActivityController],
			providers: [{ provide: ActivityService, useValue: activityService }],
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

	it('GET /activity returns feed payload', async () => {
		activityService.getFeed.mockResolvedValueOnce({
			items: [{ id: 1, action: 'create' }],
			total: 1,
			has_more: false,
		});

		const response = await request(app.getHttpServer())
			.get('/activity?limit=10')
			.expect(200);

		expect(response.body.total).toBe(1);
	});

	it('GET /activity/summary returns summary payload', async () => {
		activityService.getSummary.mockResolvedValueOnce({
			period_hours: 24,
			total_activities: 4,
			by_action: { create: 2 },
			by_entity: { project: 2 },
			unique_users: 1,
		});

		const response = await request(app.getHttpServer())
			.get('/activity/summary?hours=24')
			.expect(200);

		expect(response.body.total_activities).toBe(4);
	});
});
