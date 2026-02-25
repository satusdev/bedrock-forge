import {
	BadRequestException,
	INestApplication,
	NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

describe('Invoices HTTP Contract', () => {
	let app: INestApplication;
	const invoicesService = {
		listInvoices: jest.fn(),
		getInvoice: jest.fn(),
		createInvoice: jest.fn(),
		updateInvoice: jest.fn(),
		deleteInvoice: jest.fn(),
		sendInvoice: jest.fn(),
		recordPayment: jest.fn(),
		getInvoicePdfMetadata: jest.fn(),
		getInvoiceStats: jest.fn(),
	};

	beforeAll(async () => {
		const moduleRef: TestingModule = await Test.createTestingModule({
			controllers: [InvoicesController],
			providers: [{ provide: InvoicesService, useValue: invoicesService }],
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

	it('GET /invoices returns list envelope', async () => {
		invoicesService.listInvoices.mockResolvedValueOnce({
			invoices: [{ id: 1, invoice_number: 'INV-1' }],
			total: 1,
			limit: 50,
			offset: 0,
		});

		const response = await request(app.getHttpServer())
			.get('/invoices')
			.expect(200);

		expect(response.body.total).toBe(1);
		expect(response.body.invoices[0].invoice_number).toBe('INV-1');
	});

	it('GET /invoices/:id returns 404 detail when missing', async () => {
		invoicesService.getInvoice.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Invoice not found' }),
		);

		const response = await request(app.getHttpServer())
			.get('/invoices/999')
			.expect(404);

		expect(response.body).toEqual({ detail: 'Invoice not found' });
	});

	it('POST /invoices returns create payload', async () => {
		invoicesService.createInvoice.mockResolvedValueOnce({
			status: 'success',
			message: 'Invoice created successfully',
			invoice_id: 10,
			invoice_number: 'INV-202502-0010',
			total: 100,
		});

		const response = await request(app.getHttpServer())
			.post('/invoices')
			.send({
				client_id: 1,
				items: [{ description: 'x', quantity: 1, unit_price: 100 }],
			})
			.expect(201);

		expect(response.body.invoice_id).toBe(10);
	});

	it('PUT /invoices/:id returns update payload', async () => {
		invoicesService.updateInvoice.mockResolvedValueOnce({
			status: 'success',
			message: 'updated',
		});

		const response = await request(app.getHttpServer())
			.put('/invoices/1')
			.send({ status: 'pending' })
			.expect(200);

		expect(response.body.status).toBe('success');
	});

	it('DELETE /invoices/:id returns 400 detail for non-draft invoice', async () => {
		invoicesService.deleteInvoice.mockRejectedValueOnce(
			new BadRequestException({ detail: 'Only draft invoices can be deleted' }),
		);

		const response = await request(app.getHttpServer())
			.delete('/invoices/2')
			.expect(400);

		expect(response.body.detail).toBe('Only draft invoices can be deleted');
	});

	it('POST /invoices/:id/payment returns payment payload', async () => {
		invoicesService.recordPayment.mockResolvedValueOnce({
			status: 'success',
			message: 'Payment recorded',
			balance_due: 0,
			is_paid: true,
		});

		const response = await request(app.getHttpServer())
			.post('/invoices/1/payment')
			.send({ amount: 100, payment_method: 'bank_transfer' })
			.expect(201);

		expect(response.body.is_paid).toBe(true);
	});

	it('GET /invoices/stats/summary returns stats payload', async () => {
		invoicesService.getInvoiceStats.mockResolvedValueOnce({
			period_days: 30,
			total_invoiced: 100,
			total_paid: 50,
			total_pending: 50,
			total_overdue: 0,
			invoice_count: 2,
			paid_count: 1,
			pending_count: 1,
		});

		const response = await request(app.getHttpServer())
			.get('/invoices/stats/summary')
			.expect(200);

		expect(response.body.invoice_count).toBe(2);
	});
});
