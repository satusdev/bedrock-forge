import {
	BadRequestException,
	INestApplication,
	NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

describe('Clients HTTP Contract', () => {
	let app: INestApplication;
	const clientsService = {
		getAllClients: jest.fn(),
		getUserPreferences: jest.fn(),
		updateUserPreferences: jest.fn(),
		getClient: jest.fn(),
		createClient: jest.fn(),
		updateClient: jest.fn(),
		deleteClient: jest.fn(),
		getClientProjects: jest.fn(),
		getClientInvoices: jest.fn(),
		assignProjectToClient: jest.fn(),
		unassignProjectFromClient: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [ClientsController],
			providers: [
				{
					provide: ClientsService,
					useValue: clientsService,
				},
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

	it('GET /clients returns legacy-compatible list envelope', async () => {
		clientsService.getAllClients.mockResolvedValueOnce({
			clients: [{ id: 1, name: 'Acme' }],
			total: 1,
			limit: 50,
			offset: 0,
		});

		const response = await request(app.getHttpServer())
			.get('/clients')
			.expect(200);

		expect(response.body).toEqual({
			clients: [{ id: 1, name: 'Acme' }],
			total: 1,
			limit: 50,
			offset: 0,
		});
	});

	it('GET /clients/ returns list envelope via slash alias', async () => {
		clientsService.getAllClients.mockResolvedValueOnce({
			clients: [{ id: 2, name: 'Slash Client' }],
			total: 1,
			limit: 50,
			offset: 0,
		});

		const response = await request(app.getHttpServer())
			.get('/clients/')
			.expect(200);

		expect(response.body.clients[0].name).toBe('Slash Client');
	});

	it('POST /clients returns create success payload', async () => {
		clientsService.createClient.mockResolvedValueOnce({
			status: 'success',
			message: 'Client created successfully',
			client_id: 5,
		});

		const response = await request(app.getHttpServer())
			.post('/clients')
			.send({ name: 'Acme', email: 'team@acme.com' })
			.expect(201);

		expect(response.body).toEqual({
			status: 'success',
			message: 'Client created successfully',
			client_id: 5,
		});
	});

	it('POST /clients/ returns create success payload via slash alias', async () => {
		clientsService.createClient.mockResolvedValueOnce({
			status: 'success',
			message: 'Client created successfully',
			client_id: 6,
		});

		const response = await request(app.getHttpServer())
			.post('/clients/')
			.send({ name: 'Slash Acme', email: 'slash@acme.com' })
			.expect(201);

		expect(response.body.client_id).toBe(6);
	});

	it('GET /clients/users/:userId/preferences returns user prefs payload', async () => {
		clientsService.getUserPreferences.mockReturnValueOnce({
			user_id: 'u1',
			timezone: 'UTC',
			date_format: 'YYYY-MM-DD',
			time_format: '24h',
			language: 'en',
			favorite_projects: [],
			project_tags: {},
			custom_widgets: {},
			custom_filters: {},
			display_name: null,
			email: null,
		});

		const response = await request(app.getHttpServer())
			.get('/clients/users/u1/preferences')
			.expect(200);

		expect(response.body.user_id).toBe('u1');
		expect(response.body.timezone).toBe('UTC');
	});

	it('PUT /clients/users/:userId/preferences updates preferences payload', async () => {
		clientsService.updateUserPreferences.mockReturnValueOnce({
			status: 'success',
			message: 'User preferences updated',
		});

		const response = await request(app.getHttpServer())
			.put('/clients/users/u1/preferences')
			.send({ timezone: 'Europe/London' })
			.expect(200);

		expect(response.body.status).toBe('success');
	});

	it('GET /clients/:id returns 404 detail when missing', async () => {
		clientsService.getClient.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Client not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/clients/999')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Client not found' });
	});

	it('DELETE /clients/:id returns 400 detail for active projects', async () => {
		clientsService.deleteClient.mockRejectedValueOnce(
			new BadRequestException({
				detail: 'Cannot delete client with active projects',
			}),
		);

		const response = await request(app.getHttpServer())
			.delete('/clients/7')
			.expect(400);

		expect(response.body).toEqual({
			detail: 'Cannot delete client with active projects',
		});
	});

	it('GET /clients/:id/invoices returns invoice summary envelope', async () => {
		clientsService.getClientInvoices.mockResolvedValueOnce({
			client_id: 7,
			client_name: 'Acme',
			invoices: [
				{
					id: 1,
					invoice_number: 'INV-001',
					status: 'paid',
					total: 120,
					balance_due: 20,
				},
			],
			total_invoiced: 120,
			total_paid: 100,
		});

		const response = await request(app.getHttpServer())
			.get('/clients/7/invoices')
			.expect(200);

		expect(response.body.total_invoiced).toBe(120);
		expect(response.body.invoices[0].invoice_number).toBe('INV-001');
	});
});
