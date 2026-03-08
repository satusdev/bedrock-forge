import {
	BadRequestException,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { ClientPortalService } from './client-portal.service';

describe('ClientPortalService', () => {
	let service: ClientPortalService;
	let prisma: {
		client_users: { findUnique: jest.Mock };
		projects: { findMany: jest.Mock; findFirst: jest.Mock };
		invoices: { findMany: jest.Mock; findFirst: jest.Mock };
		subscriptions: { findMany: jest.Mock };
		backups: { findMany: jest.Mock };
		tickets: {
			findMany: jest.Mock;
			findFirst: jest.Mock;
			create: jest.Mock;
			update: jest.Mock;
		};
		ticket_messages: { create: jest.Mock };
		$transaction: jest.Mock;
	};
	let configService: { get: jest.Mock };

	const createToken = (clientId = 1, email = 'client@example.com') =>
		`Bearer ${jwt.sign(
			{ sub: email, type: 'client', client_id: clientId, role: 'member' },
			'test-secret',
			{ algorithm: 'HS256' },
		)}`;

	beforeEach(() => {
		prisma = {
			client_users: { findUnique: jest.fn() },
			projects: { findMany: jest.fn(), findFirst: jest.fn() },
			invoices: { findMany: jest.fn(), findFirst: jest.fn() },
			subscriptions: { findMany: jest.fn() },
			backups: { findMany: jest.fn() },
			tickets: {
				findMany: jest.fn(),
				findFirst: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
			},
			ticket_messages: { create: jest.fn() },
			$transaction: jest
				.fn()
				.mockImplementation(async (ops: Promise<unknown>[]) =>
					Promise.all(ops),
				),
		};
		configService = {
			get: jest.fn((key: string) => {
				if (key === 'SECRET_KEY') {
					return 'test-secret';
				}
				return undefined;
			}),
		};

		service = new ClientPortalService(
			prisma as unknown as any,
			configService as unknown as ConfigService,
		);
	});

	it('returns client-scoped portal resources', async () => {
		prisma.client_users.findUnique.mockResolvedValue({
			id: 10,
			client_id: 1,
			email: 'client@example.com',
			full_name: 'Client User',
			is_active: true,
			role: 'member',
		});
		prisma.projects.findMany.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Acme Site',
				status: 'active',
				environment: 'production',
				updated_at: new Date('2026-03-01T00:00:00.000Z'),
			},
		]);
		prisma.invoices.findMany.mockResolvedValueOnce([
			{
				id: 5,
				invoice_number: 'INV-202603-0005',
				status: 'pending',
				issue_date: new Date('2026-03-01'),
				due_date: new Date('2026-03-31'),
				total: 100,
				amount_paid: 25,
				currency: 'USD',
			},
		]);
		prisma.subscriptions.findMany.mockResolvedValueOnce([
			{
				id: 3,
				name: 'Managed Hosting',
				status: 'active',
				subscription_type: 'hosting',
				billing_cycle: 'monthly',
				amount: 49,
				currency: 'USD',
				next_billing_date: new Date('2026-04-01'),
				auto_renew: true,
			},
		]);
		prisma.backups.findMany.mockResolvedValueOnce([
			{
				id: 7,
				status: 'completed',
				backup_type: 'full',
				storage_type: 'local',
				created_at: new Date('2026-03-02T00:00:00.000Z'),
				projects: { name: 'Acme Site' },
			},
		]);

		const auth = createToken();
		expect(await service.getClientProjects(auth)).toHaveLength(1);
		expect((await service.getClientInvoices(auth))[0]?.balance_due).toBe(75);
		expect(await service.getClientSubscriptions(auth)).toHaveLength(1);
		expect((await service.getClientBackups(auth))[0]?.project_name).toBe(
			'Acme Site',
		);
	});

	it('creates ticket and supports detail + reply flow with persistence', async () => {
		prisma.client_users.findUnique.mockResolvedValue({
			id: 10,
			client_id: 1,
			email: 'client@example.com',
			full_name: 'Client User',
			is_active: true,
			role: 'member',
		});
		prisma.tickets.create.mockResolvedValueOnce({
			id: 101,
			subject: 'Portal issue',
			status: 'open',
			priority: 'medium',
			created_at: new Date('2026-03-05T10:00:00.000Z'),
			last_reply_at: new Date('2026-03-05T10:00:00.000Z'),
		});
		prisma.tickets.findFirst
			.mockResolvedValueOnce({
				id: 101,
				subject: 'Portal issue',
				status: 'open',
				priority: 'medium',
				project_id: null,
				created_at: new Date('2026-03-05T10:00:00.000Z'),
				ticket_messages: [
					{
						id: 1,
						sender_type: 'client',
						sender_name: 'Client User',
						message: 'Need help',
						created_at: new Date('2026-03-05T10:00:00.000Z'),
					},
				],
			})
			.mockResolvedValueOnce({
				id: 101,
				status: 'open',
			});
		prisma.ticket_messages.create.mockResolvedValue({ id: 1 });
		prisma.tickets.update.mockResolvedValue({ id: 101 });

		const auth = createToken();
		const ticket = await service.createTicket(
			{ subject: 'Portal issue', message: 'Need help' },
			auth,
		);
		const detail = await service.getTicketDetail(ticket.id, auth);
		const reply = await service.replyToTicket(
			ticket.id,
			{ message: 'More details' },
			auth,
		);

		expect(detail.id).toBe(ticket.id);
		expect(reply.message).toBe('Reply added successfully');
		expect(prisma.ticket_messages.create).toHaveBeenCalledTimes(2);
	});

	it('throws on invalid ticket operations', async () => {
		prisma.client_users.findUnique.mockResolvedValue({
			id: 10,
			client_id: 1,
			email: 'client@example.com',
			full_name: 'Client User',
			is_active: true,
			role: 'member',
		});
		const auth = createToken();

		await expect(
			service.createTicket({ subject: '', message: '' }, auth),
		).rejects.toBeInstanceOf(BadRequestException);
		prisma.tickets.findFirst.mockResolvedValueOnce(null);
		await expect(service.getTicketDetail(999, auth)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('returns invoice detail payload from DB and rejects invalid auth', async () => {
		prisma.client_users.findUnique.mockResolvedValue({
			id: 10,
			client_id: 1,
			email: 'client@example.com',
			full_name: 'Client User',
			is_active: true,
			role: 'member',
		});
		prisma.invoices.findFirst.mockResolvedValueOnce({
			id: 10,
			invoice_number: 'INV-202603-0010',
			status: 'pending',
			issue_date: new Date('2026-03-01'),
			due_date: new Date('2026-03-20'),
			paid_date: null,
			subtotal: 100,
			tax_rate: 0,
			tax_amount: 0,
			discount_amount: 0,
			total: 100,
			amount_paid: 20,
			currency: 'USD',
			notes: null,
			terms: null,
			invoice_items: [],
		});

		const invoice = await service.getClientInvoiceDetail(10, createToken());
		expect(invoice.id).toBe(10);
		expect(invoice.items).toEqual([]);
		expect(invoice.balance_due).toBe(80);

		await expect(service.getClientProjects(undefined)).rejects.toBeInstanceOf(
			UnauthorizedException,
		);
	});
});
