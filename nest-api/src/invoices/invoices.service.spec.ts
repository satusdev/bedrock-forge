import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('InvoicesService', () => {
	let prisma: MockPrisma;
	let service: InvoicesService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new InvoicesService(prisma as unknown as any);
	});

	it('lists invoices with envelope', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ total: BigInt(1) }])
			.mockResolvedValueOnce([
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
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
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
				},
			])
			.mockResolvedValueOnce([
				{
					id: 1,
					description: 'Work',
					quantity: 2,
					unit_price: 125,
					total: 250,
					item_type: null,
					project_id: null,
					invoice_id: 2,
				},
			]);

		const result = await service.getInvoice(2);
		expect(result.id).toBe(2);
		expect(result.items).toHaveLength(1);
	});

	it('creates invoice', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 5, payment_terms: 'net_30' }])
			.mockResolvedValueOnce([{ count: BigInt(3) }])
			.mockResolvedValueOnce([{ id: 44 }]);
		prisma.$executeRaw.mockResolvedValue(1);

		const result = await service.createInvoice({
			client_id: 5,
			items: [{ description: 'Dev', quantity: 2, unit_price: 100 }],
			tax_rate: 10,
			discount_amount: 5,
		});

		expect(result.invoice_id).toBe(44);
		expect(result.status).toBe('success');
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('updates invoice', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
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
				},
			])
			.mockResolvedValueOnce([]);
		prisma.$executeRaw.mockResolvedValue(1);

		const result = await service.updateInvoice(9, { tax_rate: 5 });
		expect(result.status).toBe('success');
	});

	it('deletes draft invoice', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
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
				},
			])
			.mockResolvedValueOnce([]);
		prisma.$executeRaw.mockResolvedValue(1);

		await service.deleteInvoice(10);
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('records payment and marks paid', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
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
				},
			])
			.mockResolvedValueOnce([]);
		prisma.$executeRaw.mockResolvedValue(1);

		const result = await service.recordPayment(11, {
			amount: 150,
			payment_method: 'bank_transfer',
		});
		expect(result.is_paid).toBe(true);
	});

	it('returns stats payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				total_invoiced: 1000,
				total_paid: 700,
				total_pending: 300,
				total_overdue: 100,
				invoice_count: BigInt(10),
				paid_count: BigInt(7),
				pending_count: BigInt(3),
			},
		]);

		const result = await service.getInvoiceStats(30);
		expect(result.invoice_count).toBe(10);
		expect(result.total_invoiced).toBe(1000);
	});

	it('throws for missing invoice', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.getInvoice(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('throws for deleting non-draft invoice', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
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
				},
			])
			.mockResolvedValueOnce([]);

		await expect(service.deleteInvoice(12)).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});
});
