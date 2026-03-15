import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PackagesService } from './packages.service';
import { PackagesRepository } from './packages.repository';

type MockPackagesRepository = {
	backfillPackageTypes: jest.Mock;
	findPackageById: jest.Mock;
	findPackageBySlug: jest.Mock;
	listPackages: jest.Mock;
	createPackage: jest.Mock;
	updatePackage: jest.Mock;
	deactivatePackage: jest.Mock;
};

describe('PackagesService', () => {
	let repo: MockPackagesRepository;
	let service: PackagesService;

	beforeEach(() => {
		repo = {
			backfillPackageTypes: jest.fn().mockResolvedValue(undefined),
			findPackageById: jest.fn(),
			findPackageBySlug: jest.fn().mockResolvedValue(null),
			listPackages: jest.fn(),
			createPackage: jest.fn(),
			updatePackage: jest.fn().mockResolvedValue(undefined),
			deactivatePackage: jest.fn().mockResolvedValue(undefined),
		};
		service = new PackagesService(repo as unknown as PackagesRepository);
	});

	it('lists packages', async () => {
		repo.listPackages.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Starter',
				slug: 'starter',
				package_type: 'hosting',
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
		repo.findPackageBySlug.mockResolvedValueOnce(null);
		repo.createPackage.mockResolvedValueOnce({ id: 7 });
		const result = await service.createPackage({ name: 'Pro', slug: 'pro' });
		expect(result.status).toBe('success');
	});

	it('throws on duplicate slug', async () => {
		repo.findPackageBySlug.mockResolvedValueOnce({ id: 1 });
		await expect(
			service.createPackage({ name: 'Pro', slug: 'pro' }),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('throws for missing package', async () => {
		repo.findPackageById.mockResolvedValueOnce(null);
		await expect(service.getPackage(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
});
