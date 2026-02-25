import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('ClientsService', () => {
	let prisma: MockPrisma;
	let service: ClientsService;

	beforeEach(() => {
		prisma = {
			$queryRaw: jest.fn(),
			$executeRaw: jest.fn(),
		};
		service = new ClientsService(prisma as unknown as any);
	});

	it('lists clients with counts and projects', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ total: 1 }])
			.mockResolvedValueOnce([
				{
					id: 1,
					name: 'Acme',
					company: 'Acme Inc',
					email: 'team@acme.com',
					phone: null,
					billing_status: 'active',
					monthly_rate: 1000,
					currency: 'USD',
					created_at: new Date('2025-01-01T00:00:00.000Z'),
					project_count: 2,
					invoice_count: 3,
				},
			])
			.mockResolvedValueOnce([
				{
					id: 8,
					name: 'Project A',
					status: 'active',
					environment: 'production',
					wp_home: null,
				},
			]);

		const result = await service.getAllClients({ limit: 50, offset: 0 });
		const firstClient = result.clients[0];

		expect(result.total).toBe(1);
		expect(result.clients).toHaveLength(1);
		expect(firstClient).toBeDefined();
		expect(firstClient?.project_count).toBe(2);
		expect(firstClient?.projects[0]?.project_name).toBe('Project A');
	});

	it('returns client details with projects and recent invoices', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 1,
					name: 'Acme',
					company: 'Acme Inc',
					email: 'team@acme.com',
					phone: null,
					billing_email: 'billing@acme.com',
					address: null,
					website: null,
					notes: null,
					billing_status: 'active',
					payment_terms: '30',
					currency: 'USD',
					tax_rate: 0,
					auto_billing: false,
					contract_start: null,
					contract_end: null,
					invoice_prefix: 'INV',
					created_at: new Date('2025-01-01T00:00:00.000Z'),
					updated_at: new Date('2025-01-01T00:00:00.000Z'),
					monthly_rate: 1000,
				},
			])
			.mockResolvedValueOnce([
				{
					id: 9,
					name: 'Project A',
					status: 'active',
					environment: 'production',
					wp_home: null,
				},
			])
			.mockResolvedValueOnce([
				{
					id: 7,
					invoice_number: 'INV-001',
					status: 'paid',
					total: 100,
					amount_paid: 100,
				},
			]);

		const result = await service.getClient(1);
		const firstProject = result.projects[0];
		const firstInvoice = result.recent_invoices[0];

		expect(result.id).toBe(1);
		expect(firstProject).toBeDefined();
		expect(firstProject?.project_name).toBe('Project A');
		expect(firstInvoice).toBeDefined();
		expect(firstInvoice?.invoice_number).toBe('INV-001');
	});

	it('throws not found when client detail is missing', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		await expect(service.getClient(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('creates client when email is unique', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ id: 22 }]);

		const result = await service.createClient({
			name: 'Acme',
			email: 'team@acme.com',
		});

		expect(result.status).toBe('success');
		expect(result.client_id).toBe(22);
	});

	it('rejects create when email already exists', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]);

		await expect(
			service.createClient({ name: 'Acme', email: 'team@acme.com' }),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('updates client and returns success message', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 5,
				name: 'Acme',
				company: null,
				email: 'team@acme.com',
				phone: null,
				billing_email: null,
				address: null,
				website: null,
				notes: null,
				billing_status: 'active',
				payment_terms: '30',
				currency: 'USD',
				tax_rate: 0,
				auto_billing: false,
				contract_start: null,
				contract_end: null,
				invoice_prefix: 'INV',
				created_at: new Date(),
				updated_at: new Date(),
				monthly_rate: 0,
			},
		]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.updateClient(5, { name: 'Acme Updated' });

		expect(result.message).toContain('Acme Updated');
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('rejects update when client is missing', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		await expect(
			service.updateClient(999, { name: 'Nope' }),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('rejects delete when client has active projects', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 5, name: 'Acme' }])
			.mockResolvedValueOnce([{ total: 2 }]);

		await expect(service.deleteClient(5)).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});

	it('deactivates client when no projects are attached', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 5, name: 'Acme' }])
			.mockResolvedValueOnce([{ total: 0 }]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.deleteClient(5);

		expect(result.message).toContain('deactivated');
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('returns invoices summary with totals', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 5, name: 'Acme' }])
			.mockResolvedValueOnce([
				{
					id: 1,
					invoice_number: 'INV-001',
					status: 'paid',
					issue_date: new Date('2025-01-10T00:00:00.000Z'),
					due_date: new Date('2025-01-20T00:00:00.000Z'),
					total: 120,
					amount_paid: 80,
				},
			]);

		const result = await service.getClientInvoices(5);
		const firstInvoice = result.invoices[0];

		expect(result.total_invoiced).toBe(120);
		expect(result.total_paid).toBe(80);
		expect(firstInvoice).toBeDefined();
		expect(firstInvoice?.balance_due).toBe(40);
	});

	it('returns and updates user preferences payload', async () => {
		const initial = service.getUserPreferences('user-1');
		expect(initial.user_id).toBe('user-1');
		expect(initial.timezone).toBe('UTC');

		const updateResult = service.updateUserPreferences('user-1', {
			timezone: 'Europe/London',
			language: 'en-GB',
		});
		expect(updateResult.status).toBe('success');

		const updated = service.getUserPreferences('user-1');
		expect(updated.timezone).toBe('Europe/London');
		expect(updated.language).toBe('en-GB');
	});
});
