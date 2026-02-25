import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PackagesService } from './packages.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('PackagesService', () => {
	let prisma: MockPrisma;
	let service: PackagesService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new PackagesService(prisma as unknown as any);
	});

	it('lists packages', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Starter',
				slug: 'starter',
				description: 'Starter plan',
				disk_space_gb: 10,
				bandwidth_gb: 100,
				domains_limit: 1,
				subdomains_limit: 1,
				databases_limit: 1,
				email_accounts_limit: 5,
				ftp_accounts_limit: 0,
				php_workers: 0,
				ram_mb: 0,
				cpu_cores: 0,
				monthly_price: 10,
				quarterly_price: 27,
				yearly_price: 100,
				biennial_price: 180,
				setup_fee: 0,
				currency: 'USD',
				hosting_yearly_price: 100,
				support_monthly_price: 5,
				features: '[]',
				is_active: true,
				is_featured: false,
				sort_order: 1,
			},
		]);
		const result = await service.listPackages(true);
		expect(result.packages[0]?.name).toBe('Starter');
	});

	it('creates package', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ id: 7 }]);
		const result = await service.createPackage({ name: 'Pro', slug: 'pro' });
		expect(result.status).toBe('success');
	});

	it('throws on duplicate slug', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]);
		await expect(
			service.createPackage({ name: 'Pro', slug: 'pro' }),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('throws for missing package', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.getPackage(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
});
