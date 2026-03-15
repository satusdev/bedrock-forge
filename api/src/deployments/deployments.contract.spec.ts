import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsService } from './deployments.service';

describe('Deployments HTTP Contract', () => {
	let app: INestApplication;
	const deploymentsService = {
		promote: jest.fn(),
		getHistory: jest.fn(),
		rollback: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [DeploymentsController],
			providers: [
				{ provide: DeploymentsService, useValue: deploymentsService },
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

	it('POST /deployments/promote returns accepted payload', async () => {
		deploymentsService.promote.mockResolvedValueOnce({
			status: 'accepted',
			task_id: 't-1',
			message: 'Promotion process started background',
		});

		const response = await request(app.getHttpServer())
			.post('/deployments/promote')
			.send({
				staging_host: 'staging.example.com',
				staging_user: 'forge',
				prod_host: 'prod.example.com',
				prod_user: 'forge',
				staging_url: 'https://staging.example.com',
				prod_url: 'https://example.com',
			})
			.expect(201);

		expect(response.body.task_id).toBe('t-1');
	});

	it('GET /deployments/history returns log list', async () => {
		deploymentsService.getHistory.mockResolvedValueOnce([
			{ id: 't-1', status: 'success' },
		]);

		const response = await request(app.getHttpServer())
			.get('/deployments/history')
			.expect(200);

		expect(response.body[0].id).toBe('t-1');
	});

	it('POST /deployments/:projectName/rollback returns accepted payload', async () => {
		deploymentsService.rollback.mockResolvedValueOnce({
			status: 'accepted',
			task_id: 't-2',
			message: 'Rollback started',
		});

		const response = await request(app.getHttpServer())
			.post('/deployments/site-a/rollback')
			.send({ target_release: 'release-1' })
			.expect(201);

		expect(response.body.task_id).toBe('t-2');
	});
});
