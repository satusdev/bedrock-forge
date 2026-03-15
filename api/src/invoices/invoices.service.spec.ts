import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

type MockPrisma = {
	$transaction: jest.Mock;
	$queryRaw: jest.Mock;
	clients: {
		findUnique: jest.Mock;
	};
	projects: {
		findMany: jest.Mock;
	};
	subscriptions: {
		findMany: jest.Mock;
	};
	invoices: {
		count: jest.Mock;
		findMany: jest.Mock;
		findFirst: jest.Mock;
		findUnique: jest.Mock;
		create: jest.Mock;
		update: jest.Mock;
		delete: jest.Mock;
	};
	invoice_items: {
		createMany: jest.Mock;
		deleteMany: jest.Mock;
	};
};

describe('InvoicesService', () => {
	let prisma: MockPrisma;
	let service: InvoicesService;

	beforeEach(() => {
		prisma = {
			$transaction: jest.fn(),
			$queryRaw: jest.fn(),
			clients: {
				findUnique: jest.fn(),
			},
			projects: {
				findMany: jest.fn(),
			},
			subscriptions: {
				findMany: jest.fn(),
			},
			invoices: {
				count: jest.fn(),
				findMany: jest.fn(),
				findFirst: jest.fn(),
				findUnique: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				delete: jest.fn(),
			},
			invoice_items: {
				createMany: jest.fn(),
				deleteMany: jest.fn(),
			},
		};
		prisma.invoices.findFirst.mockImplementation((...args: any[]) =>
			prisma.invoices.findUnique(...args),
		);
		prisma.$transaction.mockImplementation(async callback => callback(prisma));
		service = new InvoicesService(prisma as unknown as any);
	});

	it('lists invoices with envelope', async () => {
		prisma.invoices.count.mockResolvedValueOnce(1);
		prisma.invoices.findMany.mockResolvedValueOnce([
			{
				id: 1,
				invoice_number: 'INV-202502-0001',
				client_id: 10,
				status: 'draft',
				issue_date: new Date('2025-02-01'),
				due_date: new Date('2025-03-01'),
				paid_date: null,
				subtotal: 100,
				tax_rate: 0,
				tax_amount: 0,
				discount_amount: 0,
				total: 100,
				amount_paid: 0,
				payment_method: null,
				payment_reference: null,
				notes: null,
				terms: null,
				currency: 'USD',
				created_at: new Date(),
			},
		]);

		const result = await service.listInvoices({ limit: 50, offset: 0 });
		expect(result.total).toBe(1);
		expect(result.invoices[0]?.invoice_number).toBe('INV-202502-0001');
	});

	it('gets invoice detail with items', async () => {
		prisma.invoices.findUnique.mockResolvedValueOnce({
			id: 2,
			invoice_number: 'INV-202502-0002',
			client_id: 11,
			status: 'pending',
			issue_date: new Date('2025-02-01'),
			due_date: new Date('2025-03-01'),
			paid_date: null,
			subtotal: 250,
			tax_rate: 10,
			tax_amount: 25,
			discount_amount: 0,
			total: 275,
			amount_paid: 0,
			payment_method: null,
			payment_reference: null,
			notes: null,
			terms: null,
			currency: 'USD',
			created_at: new Date(),
			invoice_items: [
				{
					id: 1,
					description: 'Work',
					quantity: 2,
					unit_price: 125,
					total: 250,
					item_type: null,
					project_id: null,
					subscription_id: null,
					invoice_id: 2,
				},
			],
		});

		const result = await service.getInvoice(2);
		expect(result.id).toBe(2);
		expect(result.items).toHaveLength(1);
	});

	it('creates invoice', async () => {
		prisma.clients.findUnique.mockResolvedValueOnce({
			id: 5,
			payment_terms: 'net_30',
			owner_id: 1,
		});
		prisma.invoices.create.mockResolvedValueOnce({ id: 44 });
		prisma.invoices.update.mockResolvedValueOnce({ id: 44 });
		prisma.invoice_items.createMany.mockResolvedValueOnce({ count: 1 });

		const result = await service.createInvoice({
			client_id: 5,
			items: [{ description: 'Dev', quantity: 2, unit_price: 100 }],
			tax_rate: 10,
			discount_amount: 5,
		});

		expect(result.invoice_id).toBe(44);
		expect(result.status).toBe('success');
		expect(result.invoice_number).toContain('INV-');
	});

	it('throws when invoice item subscription/project links mismatch', async () => {
		prisma.clients.findUnique.mockResolvedValueOnce({
			id: 5,
			payment_terms: 'net_30',
			owner_id: 1,
		});
		prisma.projects.findMany.mockResolvedValueOnce([{ id: 12 }]);
		prisma.subscriptions.findMany.mockResolvedValueOnce([
			{ id: 33, project_id: 55 },
		]);

		await expect(
			service.createInvoice({
				client_id: 5,
				items: [
					{
						description: 'Mismatch item',
						quantity: 1,
						unit_price: 100,
						project_id: 12,
						subscription_id: 33,
					},
				],
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('updates invoice', async () => {
		prisma.invoices.findUnique.mockResolvedValueOnce({
			id: 9,
			invoice_number: 'INV-202502-0009',
			client_id: 1,
			status: 'draft',
			issue_date: new Date('2025-02-01'),
			due_date: new Date('2025-03-01'),
			paid_date: null,
			subtotal: 100,
			tax_rate: 0,
			tax_amount: 0,
			discount_amount: 0,
			total: 100,
			amount_paid: 0,
			payment_method: null,
			payment_reference: null,
			notes: null,
			terms: null,
			currency: 'USD',
			created_at: new Date(),
			invoice_items: [],
		});
		prisma.invoices.update.mockResolvedValueOnce({ id: 9 });

		const result = await service.updateInvoice(9, { tax_rate: 5 });
		expect(result.status).toBe('success');
	});

	it('deletes draft invoice', async () => {
		prisma.invoices.findUnique.mockResolvedValueOnce({
			id: 10,
			invoice_number: 'INV-202502-0010',
			client_id: 1,
			status: 'draft',
			issue_date: new Date('2025-02-01'),
			due_date: new Date('2025-03-01'),
			paid_date: null,
			subtotal: 100,
			tax_rate: 0,
			tax_amount: 0,
			discount_amount: 0,
			total: 100,
			amount_paid: 0,
			payment_method: null,
			payment_reference: null,
			notes: null,
			terms: null,
			currency: 'USD',
			created_at: new Date(),
			invoice_items: [],
		});
		prisma.invoice_items.deleteMany.mockResolvedValueOnce({ count: 0 });
		prisma.invoices.delete.mockResolvedValueOnce({ id: 10 });

		await service.deleteInvoice(10);
		expect(prisma.invoices.delete).toHaveBeenCalled();
	});

	it('records payment and marks paid', async () => {
		prisma.invoices.findUnique.mockResolvedValueOnce({
			id: 11,
			invoice_number: 'INV-202502-0011',
			client_id: 1,
			status: 'pending',
			issue_date: new Date('2025-02-01'),
			due_date: new Date('2025-03-01'),
			paid_date: null,
			subtotal: 200,
			tax_rate: 0,
			tax_amount: 0,
			discount_amount: 0,
			total: 200,
			amount_paid: 50,
			payment_method: null,
			payment_reference: null,
			notes: null,
			terms: null,
			currency: 'USD',
			created_at: new Date(),
			invoice_items: [],
		});
		prisma.invoices.update.mockResolvedValueOnce({ id: 11 });

		const result = await service.recordPayment(11, {
			amount: 150,
			payment_method: 'bank_transfer',
		});
		expect(result.is_paid).toBe(true);
	});

	it('returns stats payload', async () => {
		prisma.invoices.findMany.mockResolvedValueOnce([
			{
				total_invoiced: 1000,
				total_paid: 700,
				total_pending: 300,
				total_overdue: 100,
				total: 1000,
				amount_paid: 700,
				status: 'pending',
				due_date: new Date(Date.now() - 24 * 60 * 60 * 1000),
			},
		]);

		const result = await service.getInvoiceStats(30);
		expect(result.invoice_count).toBe(1);
		expect(result.total_invoiced).toBe(1000);
	});

	it('throws for missing invoice', async () => {
		prisma.invoices.findUnique.mockResolvedValueOnce(null);
		await expect(service.getInvoice(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('throws for deleting non-draft invoice', async () => {
		prisma.invoices.findUnique.mockResolvedValueOnce({
			id: 12,
			invoice_number: 'INV-202502-0012',
			client_id: 1,
			status: 'paid',
			issue_date: new Date('2025-02-01'),
			due_date: new Date('2025-03-01'),
			paid_date: new Date('2025-02-15'),
			subtotal: 100,
			tax_rate: 0,
			tax_amount: 0,
			discount_amount: 0,
			total: 100,
			amount_paid: 100,
			payment_method: null,
			payment_reference: null,
			notes: null,
			terms: null,
			currency: 'USD',
			created_at: new Date(),
			invoice_items: [],
		});

		await expect(service.deleteInvoice(12)).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});

	it('marks overdue invoices in sweep helper', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

		const result = await service.markOverdueInvoices(50);

		expect(result.updated).toBe(2);
	});

	it('throws when sending draft invoice with no line items', async () => {
		prisma.invoices.findUnique.mockResolvedValueOnce({
			id: 20,
			invoice_number: 'INV-202502-0020',
			client_id: 1,
			status: 'draft',
			issue_date: new Date('2025-02-01'),
			due_date: new Date('2025-03-01'),
			paid_date: null,
			subtotal: 100,
			tax_rate: 0,
			tax_amount: 0,
			discount_amount: 0,
			total: 100,
			amount_paid: 0,
			payment_method: null,
			payment_reference: null,
			notes: null,
			terms: null,
			currency: 'USD',
			created_at: new Date(),
			invoice_items: [],
		});

		await expect(service.sendInvoice(20)).rejects.toBeInstanceOf(
			BadRequestException,
		);
		expect(prisma.invoices.update).not.toHaveBeenCalled();
	});

	it('throws when recording payment on draft invoice', async () => {
		prisma.invoices.findUnique.mockResolvedValueOnce({
			id: 21,
			invoice_number: 'INV-202502-0021',
			client_id: 1,
			status: 'draft',
			issue_date: new Date('2025-02-01'),
			due_date: new Date('2025-03-01'),
			paid_date: null,
			subtotal: 100,
			tax_rate: 0,
			tax_amount: 0,
			discount_amount: 0,
			total: 100,
			amount_paid: 0,
			payment_method: null,
			payment_reference: null,
			notes: null,
			terms: null,
			currency: 'USD',
			created_at: new Date(),
			invoice_items: [
				{
					id: 1,
					description: 'Item',
					quantity: 1,
					unit_price: 100,
					total: 100,
					item_type: null,
					project_id: null,
					subscription_id: null,
					invoice_id: 21,
				},
			],
		});

		await expect(
			service.recordPayment(21, { amount: 20, payment_method: 'cash' }),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(prisma.invoices.update).not.toHaveBeenCalled();
	});

	it('throws when payment exceeds balance due', async () => {
		prisma.invoices.findUnique.mockResolvedValueOnce({
			id: 22,
			invoice_number: 'INV-202502-0022',
			client_id: 1,
			status: 'pending',
			issue_date: new Date('2025-02-01'),
			due_date: new Date('2025-03-01'),
			paid_date: null,
			subtotal: 100,
			tax_rate: 0,
			tax_amount: 0,
			discount_amount: 0,
			total: 100,
			amount_paid: 90,
			payment_method: null,
			payment_reference: null,
			notes: null,
			terms: null,
			currency: 'USD',
			created_at: new Date(),
			invoice_items: [
				{
					id: 1,
					description: 'Item',
					quantity: 1,
					unit_price: 100,
					total: 100,
					item_type: null,
					project_id: null,
					subscription_id: null,
					invoice_id: 22,
				},
			],
		});

		await expect(
			service.recordPayment(22, { amount: 20, payment_method: 'cash' }),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(prisma.invoices.update).not.toHaveBeenCalled();
	});

	it('builds safe invoice pdf metadata', async () => {
		prisma.invoices.findUnique.mockResolvedValueOnce({
			id: 23,
			invoice_number: 'INV 2025/02 #0023',
			client_id: 1,
			status: 'pending',
			issue_date: new Date('2025-02-01'),
			due_date: new Date('2025-03-01'),
			paid_date: null,
			subtotal: 100,
			tax_rate: 0,
			tax_amount: 0,
			discount_amount: 0,
			total: 100,
			amount_paid: 20,
			payment_method: null,
			payment_reference: null,
			notes: null,
			terms: null,
			currency: 'USD',
			created_at: new Date(),
			invoice_items: [
				{
					id: 1,
					description: 'Item',
					quantity: 1,
					unit_price: 100,
					total: 100,
					item_type: null,
					project_id: null,
					subscription_id: null,
					invoice_id: 23,
				},
			],
		});

		const result = await service.getInvoicePdfMetadata(23);
		expect(result.filename).toBe('inv_2025_02_0023.pdf');
		expect(result.content.toString('utf-8')).toContain('Balance Due: 80 USD');
	});
});
