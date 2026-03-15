import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DomainsService } from './domains.service';

type MockPrisma = {
	clients: {
		findUnique: jest.Mock;
	};
	projects: {
		findUnique: jest.Mock;
	};
	domains: {
		count: jest.Mock;
		findMany: jest.Mock;
		findFirst: jest.Mock;
		findUnique: jest.Mock;
		create: jest.Mock;
		update: jest.Mock;
		delete: jest.Mock;
	};
	ssl_certificates: {
		findMany: jest.Mock;
	};
};

describe('DomainsService', () => {
	let prisma: MockPrisma;
	let service: DomainsService;

	beforeEach(() => {
		prisma = {
			clients: {
				findUnique: jest.fn(),
			},
			projects: {
				findUnique: jest.fn(),
			},
			domains: {
				count: jest.fn(),
				findMany: jest.fn(),
				findFirst: jest.fn(),
				findUnique: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				delete: jest.fn(),
			},
			ssl_certificates: {
				findMany: jest.fn(),
			},
		};
		prisma.domains.findFirst.mockImplementation((...args: any[]) =>
			prisma.domains.findUnique(...args),
		);
		service = new DomainsService(prisma as unknown as any);
	});

	it('lists domains', async () => {
		prisma.domains.count.mockResolvedValueOnce(1);
		prisma.domains.findMany.mockResolvedValueOnce([
			{
				id: 1,
				domain_name: 'example.com',
				tld: '.com',
				client_id: 1,
				project_id: null,
				registrar: 'other',
				registrar_name: null,
				registrar_url: null,
				status: 'active',
				registration_date: null,
				expiry_date: new Date('2027-01-01'),
				last_renewed: null,
				nameservers: null,
				dns_provider: null,
				auto_renew: true,
				privacy_protection: true,
				transfer_lock: true,
				annual_cost: 10,
				currency: 'USD',
				notes: null,
				last_whois_check: null,
				reminder_days: 30,
				last_reminder_sent: null,
				whois_data: null,
				dns_zone_id: null,
				subscription_id: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.listDomains({});
		expect(result.total).toBe(1);
		expect(result.domains[0]?.domain_name).toBe('example.com');
	});

	it('gets a domain', async () => {
		prisma.domains.findUnique.mockResolvedValueOnce({
			id: 2,
			domain_name: 'site.test',
			tld: '.test',
			client_id: 1,
			project_id: null,
			registrar: 'other',
			registrar_name: null,
			registrar_url: null,
			status: 'active',
			registration_date: null,
			expiry_date: new Date('2027-01-01'),
			last_renewed: null,
			nameservers: '[]',
			dns_provider: null,
			auto_renew: true,
			privacy_protection: true,
			transfer_lock: true,
			annual_cost: 0,
			currency: 'USD',
			notes: null,
			last_whois_check: null,
			reminder_days: 30,
			last_reminder_sent: null,
			whois_data: null,
			dns_zone_id: null,
			subscription_id: null,
			created_at: new Date(),
			updated_at: new Date(),
		});
		prisma.ssl_certificates.findMany.mockResolvedValueOnce([]);

		const result = await service.getDomain(2);
		expect(result.id).toBe(2);
	});

	it('records and exposes domain runner snapshot', () => {
		service.recordRunnerSnapshot({
			claimed: 2,
			whois_succeeded: 1,
			whois_failed: 1,
			reminders_processed: 3,
			reminders_sent: 2,
			error: null,
		});

		const snapshot = service.getRunnerSnapshot();
		expect(snapshot.runs_total).toBe(1);
		expect(snapshot.last_run_at).toBeTruthy();
		expect(snapshot.last_outcome?.claimed).toBe(2);
		expect(snapshot.last_outcome?.reminders_sent).toBe(2);
	});

	it('creates domain', async () => {
		prisma.clients.findUnique.mockResolvedValueOnce({ id: 1 });
		prisma.domains.findUnique.mockResolvedValueOnce(null);
		prisma.domains.create.mockResolvedValueOnce({ id: 12 });

		const result = await service.createDomain({
			client_id: 1,
			domain_name: 'new.com',
			expiry_date: '2027-01-01',
		});

		expect(result.domain_id).toBe(12);
	});

	it('creates domain with WHOIS expiry when expiry_date is omitted', async () => {
		prisma.clients.findUnique.mockResolvedValueOnce({ id: 1 });
		prisma.domains.findUnique.mockResolvedValueOnce(null);
		prisma.domains.create.mockResolvedValueOnce({ id: 13 });
		const whoisDate = new Date('2028-02-01T00:00:00.000Z');
		jest
			.spyOn(service as any, 'fetchWhoisExpiryDate')
			.mockResolvedValueOnce(whoisDate);

		const result = await service.createDomain({
			client_id: 1,
			domain_name: 'whois-only.test',
		});

		expect(result.domain_id).toBe(13);
		expect(prisma.domains.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ expiry_date: whoisDate }),
			}),
		);
	});

	it('falls back to +1 year expiry when WHOIS is unavailable', async () => {
		prisma.clients.findUnique.mockResolvedValueOnce({ id: 1 });
		prisma.domains.findUnique.mockResolvedValueOnce(null);
		prisma.domains.create.mockResolvedValueOnce({ id: 14 });
		jest
			.spyOn(service as any, 'fetchWhoisExpiryDate')
			.mockResolvedValueOnce(null);

		await service.createDomain({
			client_id: 1,
			domain_name: 'fallback-only.test',
		});

		const createArgs = prisma.domains.create.mock.calls[0]?.[0];
		const expiryDate = createArgs?.data?.expiry_date as Date;
		expect(expiryDate).toBeInstanceOf(Date);
		expect(expiryDate.getUTCFullYear()).toBeGreaterThanOrEqual(
			new Date().getUTCFullYear(),
		);
	});

	it('throws when client missing on create', async () => {
		prisma.clients.findUnique.mockResolvedValueOnce(null);
		await expect(
			service.createDomain({
				client_id: 99,
				domain_name: 'new.com',
				expiry_date: '2027-01-01',
			}),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('throws when domain duplicate', async () => {
		prisma.clients.findUnique.mockResolvedValueOnce({ id: 1 });
		prisma.domains.findUnique.mockResolvedValueOnce({ id: 2 });
		await expect(
			service.createDomain({
				client_id: 1,
				domain_name: 'exists.com',
				expiry_date: '2027-01-01',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('throws when linked project is missing on create', async () => {
		prisma.clients.findUnique.mockResolvedValueOnce({ id: 1, owner_id: 3 });
		prisma.projects.findUnique.mockResolvedValueOnce(null);

		await expect(
			service.createDomain(
				{
					client_id: 1,
					domain_name: 'project-linked.test',
					project_id: 99,
					expiry_date: '2027-01-01',
				},
				3,
			),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('claims due WHOIS domains and marks them as checked', async () => {
		prisma.domains.findMany.mockResolvedValueOnce([
			{
				id: 3,
				domain_name: 'due.test',
				last_whois_check: null,
			},
		]);
		prisma.domains.update.mockResolvedValueOnce({ id: 3 });

		const result = await service.claimWhoisDueDomains(5);

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(3);
		expect(prisma.domains.update).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 3 } }),
		);
	});

	it('runs WHOIS refresh and updates domain status', async () => {
		prisma.domains.findUnique.mockResolvedValueOnce({
			id: 4,
			domain_name: 'refresh.test',
			tld: '.test',
			client_id: 1,
			project_id: null,
			registrar: 'other',
			registrar_name: null,
			registrar_url: null,
			status: 'active',
			registration_date: null,
			expiry_date: new Date('2027-01-01'),
			last_renewed: null,
			nameservers: null,
			dns_provider: null,
			auto_renew: true,
			privacy_protection: true,
			transfer_lock: true,
			annual_cost: 0,
			currency: 'USD',
			notes: null,
			last_whois_check: null,
			reminder_days: 30,
			last_reminder_sent: null,
			whois_data: null,
			dns_zone_id: null,
			subscription_id: null,
			created_at: new Date(),
			updated_at: new Date(),
		});
		jest
			.spyOn(service as any, 'fetchWhoisExpiryDate')
			.mockResolvedValueOnce(new Date('2028-02-01T00:00:00.000Z'));
		prisma.domains.update.mockResolvedValueOnce({ id: 4 });

		const result = await service.runWhoisRefresh(4);

		expect(result.domain_id).toBe(4);
		expect(result.status).toBe('active');
		expect(prisma.domains.update).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 4 } }),
		);
	});

	it('processes expiry reminders respecting reminder window', async () => {
		const soon = new Date();
		soon.setUTCDate(soon.getUTCDate() + 5);
		prisma.domains.findMany.mockResolvedValueOnce([
			{
				id: 5,
				domain_name: 'soon.test',
				tld: '.test',
				client_id: 1,
				project_id: null,
				registrar: 'other',
				registrar_name: null,
				registrar_url: null,
				status: 'active',
				registration_date: null,
				expiry_date: soon,
				last_renewed: null,
				nameservers: null,
				dns_provider: null,
				auto_renew: true,
				privacy_protection: true,
				transfer_lock: true,
				annual_cost: 0,
				currency: 'USD',
				notes: null,
				last_whois_check: null,
				reminder_days: 30,
				last_reminder_sent: null,
				whois_data: null,
				dns_zone_id: null,
				subscription_id: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);
		prisma.domains.update.mockResolvedValueOnce({ id: 5 });

		const result = await service.processExpiryReminders(10);

		expect(result.reminders_sent).toBe(1);
		expect(prisma.domains.update).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 5 } }),
		);
	});
});
