import { NotFoundException } from '@nestjs/common';
import { SslService } from './ssl.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('SslService', () => {
	let prisma: MockPrisma;
	let service: SslService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new SslService(prisma as unknown as any);
	});

	it('lists certificates', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ total: BigInt(1) }])
			.mockResolvedValueOnce([
				{
					id: 1,
					common_name: 'example.com',
					san_domains: null,
					domain_id: 1,
					project_id: null,
					provider: 'lets_encrypt',
					certificate_type: 'dv',
					issue_date: new Date('2026-01-01'),
					expiry_date: new Date('2026-04-01'),
					is_active: true,
					auto_renew: true,
					is_wildcard: false,
					annual_cost: 0,
					last_renewal_attempt: null,
					renewal_failure_count: 0,
					notes: null,
					created_at: new Date(),
				},
			]);

		const result = await service.listCertificates({});
		expect(result.total).toBe(1);
		expect(result.certificates[0]?.common_name).toBe('example.com');
	});

	it('gets certificate', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				common_name: 'example.com',
				san_domains: '[]',
				domain_id: 1,
				project_id: null,
				provider: 'lets_encrypt',
				certificate_type: 'dv',
				issue_date: new Date('2026-01-01'),
				expiry_date: new Date('2026-04-01'),
				is_active: true,
				auto_renew: true,
				is_wildcard: false,
				annual_cost: 0,
				last_renewal_attempt: null,
				renewal_failure_count: 0,
				notes: null,
				created_at: new Date(),
			},
		]);

		const result = await service.getCertificate(1);
		expect(result.id).toBe(1);
	});

	it('throws when cert not found', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.getCertificate(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
});
