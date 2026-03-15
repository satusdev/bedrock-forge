import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

describe('Subscriptions HTTP Contract', () => {
	let app: INestApplication;
	const subscriptionsService = {
		listSubscriptions: jest.fn(),
		listExpiring: jest.fn(),
		getStatsSummary: jest.fn(),
		getSubscription: jest.fn(),
		createSubscription: jest.fn(),
		updateSubscription: jest.fn(),
		cancelSubscription: jest.fn(),
		renewSubscription: jest.fn(),
		generateRenewalInvoice: jest.fn(),
	};
	const authService = {
		resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
	};

	beforeAll(async () => {
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [SubscriptionsController],
			providers: [
				{ provide: SubscriptionsService, useValue: subscriptionsService },
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

	it('GET /subscriptions returns list payload', async () => {
		subscriptionsService.listSubscriptions.mockResolvedValueOnce({
			subscriptions: [{ id: 1, name: 'Hosting Plan' }],
			total: 1,
		});
		const response = await request(app.getHttpServer())
			.get('/subscriptions')
			.expect(200);
		expect(response.body.total).toBe(1);
	});

	it('POST /subscriptions/:id/invoice returns invoice payload', async () => {
		subscriptionsService.generateRenewalInvoice.mockResolvedValueOnce({
			status: 'success',
			invoice_id: 3,
			invoice_number: 'INV-1',
			total: 100,
		});
		const response = await request(app.getHttpServer())
			.post('/subscriptions/1/invoice')
			.expect(201);
		expect(response.body.invoice_id).toBe(3);
	});

	it('GET /subscriptions/:id returns 404 when missing', async () => {
		subscriptionsService.getSubscription.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Subscription not found' }),
		);
		const response = await request(app.getHttpServer())
			.get('/subscriptions/999')
			.expect(404);
		expect(response.body).toEqual({ detail: 'Subscription not found' });
	});
});
