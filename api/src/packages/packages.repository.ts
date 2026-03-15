import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type PackageRow = {
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
export class PackagesRepository {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Back-fills misclassified package_type values.
	 * Uses raw SQL because Prisma cannot express `::packagetype` enum cast conditionally.
	 * This is intentionally left as raw.
	 */
	async backfillPackageTypes(): Promise<void> {
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
	}

	async findPackageById(packageId: number): Promise<PackageRow | null> {
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
		return rows[0] ?? null;
	}

	async findPackageBySlug(slug: string): Promise<{ id: number } | null> {
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id FROM hosting_packages WHERE slug = ${slug} LIMIT 1
		`;
		return rows[0] ?? null;
	}

	async listPackages(
		isActive: boolean,
		packageType: string | null,
	): Promise<PackageRow[]> {
		return this.prisma.$queryRaw<PackageRow[]>`
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
				AND (${packageType}::text IS NULL OR package_type::text = ${packageType})
			ORDER BY sort_order ASC, yearly_price ASC
		`;
	}

	/** Creates a package record. Uses raw SQL for PostgreSQL enum cast on insert. */
	async createPackage(payload: {
		package_type: string;
		name: string;
		slug: string;
		description: string | null;
		disk_space_gb: number;
		bandwidth_gb: number;
		domains_limit: number;
		databases_limit: number;
		email_accounts_limit: number;
		monthly_price: number;
		quarterly_price: number;
		yearly_price: number;
		biennial_price: number;
		setup_fee: number;
		currency: string;
		hosting_yearly_price: number;
		support_monthly_price: number;
		features: string;
		is_featured: boolean;
	}): Promise<{ id: number }> {
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
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
				${payload.slug},
				${payload.description},
				${payload.disk_space_gb},
				${payload.bandwidth_gb},
				${payload.domains_limit},
				${1},
				${payload.databases_limit},
				${payload.email_accounts_limit},
				${0},
				${0},
				${0},
				${0},
				${payload.monthly_price},
				${payload.quarterly_price},
				${payload.yearly_price},
				${payload.biennial_price},
				${payload.setup_fee},
				${payload.currency},
				${payload.hosting_yearly_price},
				${payload.support_monthly_price},
				${payload.features},
				${true},
				${payload.is_featured},
				${0},
				NOW(),
				NOW()
			)
			RETURNING id
		`;
		const row = rows[0];
		if (!row) {
			throw new Error('Insert did not return an id');
		}
		return row;
	}

	/**
	 * Updates a package using COALESCE to preserve current values for omitted fields.
	 * Uses raw SQL because Prisma does not support COALESCE partial-update patterns.
	 * This is intentionally kept as raw.
	 */
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
			features?: string;
			is_active?: boolean;
			is_featured?: boolean;
		},
	): Promise<void> {
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
				features = COALESCE(${payload.features ?? null}, features),
				is_active = COALESCE(${payload.is_active ?? null}, is_active),
				is_featured = COALESCE(${payload.is_featured ?? null}, is_featured),
				updated_at = NOW()
			WHERE id = ${packageId}
		`;
	}

	async deactivatePackage(packageId: number): Promise<void> {
		await this.prisma.$executeRaw`
			UPDATE hosting_packages
			SET is_active = ${false}, updated_at = NOW()
			WHERE id = ${packageId}
		`;
	}
}
