import { NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('SubscriptionsService', () => {
	let prisma: MockPrisma;
	let service: SubscriptionsService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new SubscriptionsService(prisma as unknown as any);
	});

	it('lists subscriptions', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 1,
					subscription_type: 'hosting',
					name: 'Hosting Plan',
					description: null,
					client_id: 1,
					project_id: null,
					billing_cycle: 'yearly',
					amount: 120,
					currency: 'USD',
					start_date: new Date('2026-01-01'),
					next_billing_date: new Date('2027-01-01'),
					end_date: null,
					status: 'active',
					auto_renew: true,
					provider: null,
					external_id: null,
					reminder_days: 30,
					total_invoiced: 0,
					total_paid: 0,
					notes: null,
					created_at: new Date(),
					last_invoice_id: null,
				},
			])
			.mockResolvedValueOnce([{ total: BigInt(1) }]);

		const result = await service.listSubscriptions({});
		expect(result.total).toBe(1);
		expect(result.subscriptions[0]?.name).toBe('Hosting Plan');
	});

	it('creates non-package subscription', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 1 }])
			.mockResolvedValueOnce([
				{ id: 10, next_billing_date: new Date('2027-01-01') },
			]);

		const result = await service.createSubscription({
			client_id: 1,
			subscription_type: 'hosting',
			name: 'Plan',
			amount: 100,
		});
		expect(result.status).toBe('success');
	});

	it('throws when subscription missing', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.getSubscription(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
});
