import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PackagesRepository, PackageRow } from './packages.repository';

@Injectable()
export class PackagesService {
	constructor(private readonly packagesRepository: PackagesRepository) {}

	private hasBackfilledPackageTypes = false;

	private async ensurePackageTypeBackfill() {
		if (this.hasBackfilledPackageTypes) {
			return;
		}
		await this.packagesRepository.backfillPackageTypes();
		this.hasBackfilledPackageTypes = true;
	}

	private parseFeatures(raw: string | null) {
		if (!raw) {
			return [] as string[];
		}
		try {
			const parsed = JSON.parse(raw) as unknown;
			if (Array.isArray(parsed)) {
				return parsed.filter(
					(entry): entry is string => typeof entry === 'string',
				);
			}
			return [];
		} catch {
			return [];
		}
	}

	private monthlyEquivalent(
		pkg: PackageRow,
		cycle: 'monthly' | 'quarterly' | 'yearly' | 'biennial',
	) {
		switch (cycle) {
			case 'monthly':
				return pkg.monthly_price;
			case 'quarterly':
				return pkg.quarterly_price / 3;
			case 'yearly':
				return pkg.yearly_price / 12;
			case 'biennial':
				return pkg.biennial_price / 24;
		}
	}

	private savingsPercent(
		pkg: PackageRow,
		cycle: 'quarterly' | 'yearly' | 'biennial',
	) {
		if (pkg.monthly_price <= 0) {
			return 0;
		}
		const monthlyBase = pkg.monthly_price;
		const equivalent = this.monthlyEquivalent(pkg, cycle);
		if (equivalent <= 0) {
			return 0;
		}
		return ((monthlyBase - equivalent) / monthlyBase) * 100;
	}

	private async getPackageOrThrow(packageId: number) {
		const pkg = await this.packagesRepository.findPackageById(packageId);
		if (!pkg) {
			throw new NotFoundException({ detail: 'Package not found' });
		}
		return pkg;
	}

	async listPackages(isActive = true, serviceType?: string) {
		await this.ensurePackageTypeBackfill();
		const normalizedType =
			serviceType === 'hosting' || serviceType === 'support'
				? serviceType
				: null;
		const rows = await this.packagesRepository.listPackages(
			isActive,
			normalizedType,
		);

		return {
			packages: rows.map(pkg => ({
				id: pkg.id,
				name: pkg.name,
				slug: pkg.slug,
				package_type: pkg.package_type,
				description: pkg.description,
				disk_space_gb: pkg.disk_space_gb,
				bandwidth_gb: pkg.bandwidth_gb,
				domains_limit: pkg.domains_limit,
				databases_limit: pkg.databases_limit,
				email_accounts_limit: pkg.email_accounts_limit,
				monthly_price: pkg.monthly_price,
				quarterly_price: pkg.quarterly_price,
				yearly_price: pkg.yearly_price,
				biennial_price: pkg.biennial_price,
				setup_fee: pkg.setup_fee,
				currency: pkg.currency,
				hosting_yearly_price: pkg.hosting_yearly_price,
				support_monthly_price: pkg.support_monthly_price,
				features: this.parseFeatures(pkg.features),
				is_active: pkg.is_active,
				is_featured: pkg.is_featured,
				savings_yearly: Number(this.savingsPercent(pkg, 'yearly').toFixed(1)),
			})),
		};
	}

	async getPackage(packageId: number) {
		await this.ensurePackageTypeBackfill();
		const pkg = await this.getPackageOrThrow(packageId);
		return {
			id: pkg.id,
			name: pkg.name,
			slug: pkg.slug,
			package_type: pkg.package_type,
			description: pkg.description,
			disk_space_gb: pkg.disk_space_gb,
			bandwidth_gb: pkg.bandwidth_gb,
			domains_limit: pkg.domains_limit,
			subdomains_limit: pkg.subdomains_limit,
			databases_limit: pkg.databases_limit,
			email_accounts_limit: pkg.email_accounts_limit,
			ftp_accounts_limit: pkg.ftp_accounts_limit,
			php_workers: pkg.php_workers,
			ram_mb: pkg.ram_mb,
			cpu_cores: pkg.cpu_cores,
			monthly_price: pkg.monthly_price,
			quarterly_price: pkg.quarterly_price,
			yearly_price: pkg.yearly_price,
			biennial_price: pkg.biennial_price,
			setup_fee: pkg.setup_fee,
			currency: pkg.currency,
			hosting_yearly_price: pkg.hosting_yearly_price,
			support_monthly_price: pkg.support_monthly_price,
			features: this.parseFeatures(pkg.features),
			is_active: pkg.is_active,
			is_featured: pkg.is_featured,
			pricing_comparison: {
				monthly_equivalent: {
					monthly: this.monthlyEquivalent(pkg, 'monthly'),
					quarterly: Number(
						this.monthlyEquivalent(pkg, 'quarterly').toFixed(2),
					),
					yearly: Number(this.monthlyEquivalent(pkg, 'yearly').toFixed(2)),
					biennial: Number(this.monthlyEquivalent(pkg, 'biennial').toFixed(2)),
				},
				savings_percentage: {
					quarterly: Number(this.savingsPercent(pkg, 'quarterly').toFixed(1)),
					yearly: Number(this.savingsPercent(pkg, 'yearly').toFixed(1)),
					biennial: Number(this.savingsPercent(pkg, 'biennial').toFixed(1)),
				},
			},
		};
	}

	async createPackage(payload: {
		package_type?: string;
		name: string;
		slug: string;
		description?: string;
		disk_space_gb?: number;
		bandwidth_gb?: number;
		domains_limit?: number;
		databases_limit?: number;
		email_accounts_limit?: number;
		monthly_price?: number;
		quarterly_price?: number;
		yearly_price?: number;
		biennial_price?: number;
		setup_fee?: number;
		currency?: string;
		hosting_yearly_price?: number;
		support_monthly_price?: number;
		features?: string[];
		is_featured?: boolean;
	}) {
		const normalizedSlug = payload.slug.toLowerCase();
		const existing =
			await this.packagesRepository.findPackageBySlug(normalizedSlug);
		if (existing) {
			throw new BadRequestException({
				detail: 'Package with this slug already exists',
			});
		}

		const inserted = await this.packagesRepository.createPackage({
			package_type: payload.package_type ?? 'hosting',
			name: payload.name,
			slug: normalizedSlug,
			description: payload.description ?? null,
			disk_space_gb: payload.disk_space_gb ?? 10,
			bandwidth_gb: payload.bandwidth_gb ?? 100,
			domains_limit: payload.domains_limit ?? 1,
			databases_limit: payload.databases_limit ?? 1,
			email_accounts_limit: payload.email_accounts_limit ?? 5,
			monthly_price: payload.monthly_price ?? 0,
			quarterly_price: payload.quarterly_price ?? 0,
			yearly_price: payload.yearly_price ?? 0,
			biennial_price: payload.biennial_price ?? 0,
			setup_fee: payload.setup_fee ?? 0,
			currency: payload.currency ?? 'USD',
			hosting_yearly_price: payload.hosting_yearly_price ?? 0,
			support_monthly_price: payload.support_monthly_price ?? 0,
			features: JSON.stringify(payload.features ?? []),
			is_featured: payload.is_featured ?? false,
		});

		return {
			status: 'success',
			message: `Package ${payload.name} created`,
			package_id: inserted.id,
		};
	}

	async updatePackage(
		packageId: number,
		payload: {
			package_type?: string;
			name?: string;
			description?: string;
			disk_space_gb?: number;
			bandwidth_gb?: number;
			domains_limit?: number;
			databases_limit?: number;
			email_accounts_limit?: number;
			monthly_price?: number;
			quarterly_price?: number;
			yearly_price?: number;
			biennial_price?: number;
			setup_fee?: number;
			currency?: string;
			hosting_yearly_price?: number;
			support_monthly_price?: number;
			features?: string[];
			is_active?: boolean;
			is_featured?: boolean;
		},
	) {
		const pkg = await this.getPackageOrThrow(packageId);
		await this.packagesRepository.updatePackage(packageId, {
			...payload,
			features: payload.features ? JSON.stringify(payload.features) : undefined,
		});
		return {
			status: 'success',
			message: `Package ${pkg.name} updated`,
		};
	}

	async deactivatePackage(packageId: number) {
		const pkg = await this.getPackageOrThrow(packageId);
		await this.packagesRepository.deactivatePackage(packageId);
		return {
			status: 'success',
			message: `Package ${pkg.name} deactivated`,
		};
	}
}
