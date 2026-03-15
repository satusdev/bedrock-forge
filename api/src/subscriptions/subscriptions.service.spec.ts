import { NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	clients: {
		findFirst: jest.Mock;
	};
	projects: {
		findFirst: jest.Mock;
	};
	hosting_packages: {
		findMany: jest.Mock;
	};
	subscriptions: {
		findMany: jest.Mock;
		count: jest.Mock;
		findFirst: jest.Mock;
		findUnique: jest.Mock;
		create: jest.Mock;
		update: jest.Mock;
		updateMany: jest.Mock;
	};
	invoices: {
		create: jest.Mock;
	};
	invoice_items: {
		create: jest.Mock;
	};
};

describe('SubscriptionsService', () => {
	let prisma: MockPrisma;
	let service: SubscriptionsService;

	beforeEach(() => {
		prisma = {
			$queryRaw: jest.fn(),
			clients: {
				findFirst: jest.fn(),
			},
			projects: {
				findFirst: jest.fn(),
			},
			hosting_packages: {
				findMany: jest.fn(),
			},
			subscriptions: {
				findMany: jest.fn(),
				count: jest.fn(),
				findFirst: jest.fn(),
				findUnique: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				updateMany: jest.fn(),
			},
			invoices: {
				create: jest.fn(),
			},
			invoice_items: {
				create: jest.fn(),
			},
		};
		service = new SubscriptionsService(prisma as unknown as any);
	});

	it('lists subscriptions', async () => {
		prisma.subscriptions.findMany.mockResolvedValueOnce([
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
				package_id: null,
			},
		]);
		prisma.subscriptions.count.mockResolvedValueOnce(1);

		const result = await service.listSubscriptions({});
		expect(result.total).toBe(1);
		expect(result.subscriptions[0]?.name).toBe('Hosting Plan');
	});

	it('creates non-package subscription', async () => {
		prisma.clients.findFirst.mockResolvedValueOnce({ id: 1 });
		prisma.subscriptions.create.mockResolvedValueOnce({
			id: 10,
			next_billing_date: new Date('2027-01-01'),
		});

		const result = await service.createSubscription({
			client_id: 1,
			subscription_type: 'hosting',
			name: 'Plan',
			amount: 100,
		});
		expect(result.status).toBe('success');
	});

	it('throws when subscription missing', async () => {
		prisma.subscriptions.findFirst.mockResolvedValueOnce(null);
		await expect(service.getSubscription(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('claims due auto-renew subscriptions', async () => {
		prisma.subscriptions.findMany.mockResolvedValueOnce([{ id: 15 }]);
		prisma.subscriptions.updateMany.mockResolvedValueOnce({ count: 1 });

		const result = await service.claimDueAutoRenewals(4);

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(15);
	});

	it('processes subscription auto-renewal and creates invoice', async () => {
		prisma.subscriptions.findUnique.mockResolvedValueOnce({
			id: 9,
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
			package_id: null,
		});
		prisma.invoices.create.mockResolvedValueOnce({ id: 44, total: 120 });
		prisma.invoice_items.create.mockResolvedValueOnce({ id: 1 });
		prisma.subscriptions.update.mockResolvedValueOnce({ id: 9 });

		const result = await service.processAutoRenewal(9);

		expect(result.status).toBe('renewed');
		expect(result.invoice_id).toBe(44);
		expect(prisma.subscriptions.update).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 9 } }),
		);
	});

	it('processes subscription reminders', async () => {
		const now = new Date();
		const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
		prisma.subscriptions.findMany.mockResolvedValueOnce([
			{ id: 1, next_billing_date: tomorrow, reminder_days: 30 },
			{ id: 2, next_billing_date: tomorrow, reminder_days: 30 },
		]);
		prisma.subscriptions.update.mockResolvedValue({ id: 1 });

		const result = await service.processRenewalReminders(10);

		expect(result.reminders_sent).toBe(2);
		expect(prisma.subscriptions.update).toHaveBeenCalledTimes(2);
	});

	it('records and exposes subscription runner snapshot', () => {
		service.recordRunnerSnapshot({
			claimed: 2,
			renewals_succeeded: 1,
			renewals_failed: 1,
			reminders_sent: 3,
			error: null,
		});

		const snapshot = service.getRunnerSnapshot();
		expect(snapshot.runs_total).toBe(1);
		expect(snapshot.last_run_at).toBeTruthy();
		expect(snapshot.last_outcome?.claimed).toBe(2);
		expect(snapshot.last_outcome?.reminders_sent).toBe(3);
	});
});
