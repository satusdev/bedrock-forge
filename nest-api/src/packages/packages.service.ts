import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type PackageRow = {
	id: number;
	name: string;
	slug: string;
	package_type: string;
	description: string | null;
	disk_space_gb: number;
	bandwidth_gb: number;
	domains_limit: number;
	subdomains_limit: number;
	databases_limit: number;
	email_accounts_limit: number;
	ftp_accounts_limit: number;
	php_workers: number;
	ram_mb: number;
	cpu_cores: number;
	monthly_price: number;
	quarterly_price: number;
	yearly_price: number;
	biennial_price: number;
	setup_fee: number;
	currency: string;
	hosting_yearly_price: number;
	support_monthly_price: number;
	features: string | null;
	is_active: boolean;
	is_featured: boolean;
	sort_order: number;
};

@Injectable()
export class PackagesService {
	constructor(private readonly prisma: PrismaService) {}

	private hasBackfilledPackageTypes = false;

	private async ensurePackageTypeBackfill() {
		if (this.hasBackfilledPackageTypes) {
			return;
		}

		await this.prisma.$executeRaw`
			UPDATE hosting_packages
			SET package_type = ${'support'}::packagetype,
				updated_at = NOW()
			WHERE package_type = ${'hosting'}::packagetype
				AND (
					LOWER(name) LIKE ${'%support%'}
					OR LOWER(slug) LIKE ${'%support%'}
					OR LOWER(COALESCE(description, '')) LIKE ${'%support%'}
				)
				AND (
					COALESCE(hosting_yearly_price, 0) = 0
					OR COALESCE(support_monthly_price, 0) > COALESCE(hosting_yearly_price, 0)
				)
		`;

		await this.prisma.$executeRaw`
			UPDATE hosting_packages
			SET package_type = ${'hosting'}::packagetype,
				updated_at = NOW()
			WHERE package_type = ${'support'}::packagetype
				AND (
					LOWER(name) LIKE ${'%hosting%'}
					OR LOWER(slug) LIKE ${'%hosting%'}
					OR COALESCE(hosting_yearly_price, 0) > 0
				)
		`;

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
		const rows = await this.prisma.$queryRaw<PackageRow[]>`
			SELECT
				id,
				name,
				slug,
				package_type::text AS package_type,
				description,
				disk_space_gb,
				bandwidth_gb,
				domains_limit,
				subdomains_limit,
				databases_limit,
				email_accounts_limit,
				ftp_accounts_limit,
				php_workers,
				ram_mb,
				cpu_cores,
				monthly_price,
				quarterly_price,
				yearly_price,
				biennial_price,
				setup_fee,
				currency,
				hosting_yearly_price,
				support_monthly_price,
				features,
				is_active,
				is_featured,
				sort_order
			FROM hosting_packages
			WHERE id = ${packageId}
			LIMIT 1
		`;
		const pkg = rows[0];
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
		const rows = await this.prisma.$queryRaw<PackageRow[]>`
			SELECT
				id,
				name,
				slug,
				package_type::text AS package_type,
				description,
				disk_space_gb,
				bandwidth_gb,
				domains_limit,
				subdomains_limit,
				databases_limit,
				email_accounts_limit,
				ftp_accounts_limit,
				php_workers,
				ram_mb,
				cpu_cores,
				monthly_price,
				quarterly_price,
				yearly_price,
				biennial_price,
				setup_fee,
				currency,
				hosting_yearly_price,
				support_monthly_price,
				features,
				is_active,
				is_featured,
				sort_order
			FROM hosting_packages
			WHERE is_active = ${isActive}
				AND (${normalizedType}::text IS NULL OR package_type::text = ${normalizedType})
			ORDER BY sort_order ASC, yearly_price ASC
		`;

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
		const existingRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM hosting_packages
			WHERE slug = ${normalizedSlug}
			LIMIT 1
		`;
		if (existingRows[0]) {
			throw new BadRequestException({
				detail: 'Package with this slug already exists',
			});
		}

		const insertedRows = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO hosting_packages (
				package_type,
				name,
				slug,
				description,
				disk_space_gb,
				bandwidth_gb,
				domains_limit,
				subdomains_limit,
				databases_limit,
				email_accounts_limit,
				ftp_accounts_limit,
				php_workers,
				ram_mb,
				cpu_cores,
				monthly_price,
				quarterly_price,
				yearly_price,
				biennial_price,
				setup_fee,
				currency,
				hosting_yearly_price,
				support_monthly_price,
				features,
				is_active,
				is_featured,
				sort_order,
				created_at,
				updated_at
			)
			VALUES (
				${payload.package_type === 'support' ? 'support' : 'hosting'}::packagetype,
				${payload.name},
				${normalizedSlug},
				${payload.description ?? null},
				${payload.disk_space_gb ?? 10},
				${payload.bandwidth_gb ?? 100},
				${payload.domains_limit ?? 1},
				${1},
				${payload.databases_limit ?? 1},
				${payload.email_accounts_limit ?? 5},
				${0},
				${0},
				${0},
				${0},
				${payload.monthly_price ?? 0},
				${payload.quarterly_price ?? 0},
				${payload.yearly_price ?? 0},
				${payload.biennial_price ?? 0},
				${payload.setup_fee ?? 0},
				${payload.currency ?? 'USD'},
				${payload.hosting_yearly_price ?? 0},
				${payload.support_monthly_price ?? 0},
				${JSON.stringify(payload.features ?? [])},
				${true},
				${payload.is_featured ?? false},
				${0},
				NOW(),
				NOW()
			)
			RETURNING id
		`;
		const inserted = insertedRows[0];
		return {
			status: 'success',
			message: `Package ${payload.name} created`,
			package_id: inserted?.id,
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
		await this.prisma.$executeRaw`
			UPDATE hosting_packages
			SET
				package_type = COALESCE(${payload.package_type === 'support' ? 'support' : payload.package_type === 'hosting' ? 'hosting' : null}::packagetype, package_type),
				name = COALESCE(${payload.name ?? null}, name),
				description = COALESCE(${payload.description ?? null}, description),
				disk_space_gb = COALESCE(${payload.disk_space_gb ?? null}, disk_space_gb),
				bandwidth_gb = COALESCE(${payload.bandwidth_gb ?? null}, bandwidth_gb),
				domains_limit = COALESCE(${payload.domains_limit ?? null}, domains_limit),
				databases_limit = COALESCE(${payload.databases_limit ?? null}, databases_limit),
				email_accounts_limit = COALESCE(${payload.email_accounts_limit ?? null}, email_accounts_limit),
				monthly_price = COALESCE(${payload.monthly_price ?? null}, monthly_price),
				quarterly_price = COALESCE(${payload.quarterly_price ?? null}, quarterly_price),
				yearly_price = COALESCE(${payload.yearly_price ?? null}, yearly_price),
				biennial_price = COALESCE(${payload.biennial_price ?? null}, biennial_price),
				setup_fee = COALESCE(${payload.setup_fee ?? null}, setup_fee),
				currency = COALESCE(${payload.currency ?? null}, currency),
				hosting_yearly_price = COALESCE(${payload.hosting_yearly_price ?? null}, hosting_yearly_price),
				support_monthly_price = COALESCE(${payload.support_monthly_price ?? null}, support_monthly_price),
				features = COALESCE(${payload.features ? JSON.stringify(payload.features) : null}, features),
				is_active = COALESCE(${payload.is_active ?? null}, is_active),
				is_featured = COALESCE(${payload.is_featured ?? null}, is_featured),
				updated_at = NOW()
			WHERE id = ${packageId}
		`;
		return {
			status: 'success',
			message: `Package ${pkg.name} updated`,
		};
	}

	async deactivatePackage(packageId: number) {
		const pkg = await this.getPackageOrThrow(packageId);
		await this.prisma.$executeRaw`
			UPDATE hosting_packages
			SET is_active = ${false}, updated_at = NOW()
			WHERE id = ${packageId}
		`;
		return {
			status: 'success',
			message: `Package ${pkg.name} deactivated`,
		};
	}
}
