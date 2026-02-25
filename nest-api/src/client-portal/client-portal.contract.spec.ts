import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';

describe('ClientPortal HTTP Contract', () => {
	let app: INestApplication;
	const clientPortalService = {
		getClientProjects: jest.fn(),
		getClientInvoices: jest.fn(),
		getClientInvoiceDetail: jest.fn(),
		getClientTickets: jest.fn(),
		createTicket: jest.fn(),
		getTicketDetail: jest.fn(),
		replyToTicket: jest.fn(),
		getClientSubscriptions: jest.fn(),
		getClientBackups: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [ClientPortalController],
			providers: [
				{ provide: ClientPortalService, useValue: clientPortalService },
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

	it('GET /client/projects returns projects payload', async () => {
		clientPortalService.getClientProjects.mockResolvedValueOnce([
			{ id: 1, name: 'Acme', status: 'active', environments: [] },
		]);

		const response = await request(app.getHttpServer())
			.get('/client/projects')
			.set('Authorization', 'Bearer 1')
			.expect(200);

		expect(response.body[0].name).toBe('Acme');
	});

	it('GET /client/invoices/:id returns invoice detail payload', async () => {
		clientPortalService.getClientInvoiceDetail.mockResolvedValueOnce({
			id: 5,
			items: [],
		});

		const response = await request(app.getHttpServer())
			.get('/client/invoices/5')
			.set('Authorization', 'Bearer 1')
			.expect(200);

		expect(response.body.id).toBe(5);
	});

	it('POST /client/tickets creates ticket payload', async () => {
		clientPortalService.createTicket.mockResolvedValueOnce({
			id: 9,
			subject: 'Help',
			status: 'open',
			priority: 'medium',
			created_at: '2026-01-01T00:00:00.000Z',
			last_reply_at: null,
		});

		const response = await request(app.getHttpServer())
			.post('/client/tickets')
			.set('Authorization', 'Bearer 1')
			.send({ subject: 'Help', message: 'Need support' })
			.expect(201);

		expect(response.body.id).toBe(9);
	});
});
