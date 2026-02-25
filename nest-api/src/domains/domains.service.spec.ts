import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DomainsService } from './domains.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('DomainsService', () => {
	let prisma: MockPrisma;
	let service: DomainsService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new DomainsService(prisma as unknown as any);
	});

	it('lists domains', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ total: BigInt(1) }])
			.mockResolvedValueOnce([
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
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);

		const result = await service.listDomains({});
		expect(result.total).toBe(1);
		expect(result.domains[0]?.domain_name).toBe('example.com');
	});

	it('gets a domain', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
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
					created_at: new Date(),
					updated_at: new Date(),
				},
			])
			.mockResolvedValueOnce([]);

		const result = await service.getDomain(2);
		expect(result.id).toBe(2);
	});

	it('creates domain', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 1 }])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ id: 12 }]);

		const result = await service.createDomain({
			client_id: 1,
			domain_name: 'new.com',
			expiry_date: '2027-01-01',
		});

		expect(result.domain_id).toBe(12);
	});

	it('throws when client missing on create', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(
			service.createDomain({
				client_id: 99,
				domain_name: 'new.com',
				expiry_date: '2027-01-01',
			}),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('throws when domain duplicate', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 1 }])
			.mockResolvedValueOnce([{ id: 2 }]);
		await expect(
			service.createDomain({
				client_id: 1,
				domain_name: 'exists.com',
				expiry_date: '2027-01-01',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
