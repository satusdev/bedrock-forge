import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainCreateDto } from './dto/domain-create.dto';
import { DomainUpdateDto } from './dto/domain-update.dto';

type DbDomainRow = {
	id: number;
	domain_name: string;
	tld: string;
	client_id: number;
	project_id: number | null;
	registrar: string;
	registrar_name: string | null;
	registrar_url: string | null;
	status: string;
	registration_date: Date | null;
	expiry_date: Date;
	last_renewed: Date | null;
	nameservers: string | null;
	dns_provider: string | null;
	auto_renew: boolean;
	privacy_protection: boolean;
	transfer_lock: boolean;
	annual_cost: number;
	currency: string;
	notes: string | null;
	last_whois_check: Date | null;
	created_at: Date;
	updated_at: Date;
};

@Injectable()
export class DomainsService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly allowedRegistrars = new Set([
		'namecheap',
		'godaddy',
		'cloudflare',
		'google_domains',
		'name_com',
		'porkbun',
		'hover',
		'other',
	]);

	private readonly allowedStatuses = new Set([
		'active',
		'expired',
		'pending_transfer',
		'locked',
		'redemption',
		'pending_delete',
	]);

	private extractTld(domainName: string): string {
		const parts = domainName.toLowerCase().split('.');
		if (parts.length >= 2) {
			return `.${parts[parts.length - 1]}`;
		}
		return '.com';
	}

	private parseNameservers(value: string | null): string[] {
		if (!value) {
			return [];
		}
		try {
			const parsed = JSON.parse(value) as unknown;
			if (!Array.isArray(parsed)) {
				return [];
			}
			return parsed.filter(item => typeof item === 'string');
		} catch {
			return [];
		}
	}

	private daysUntilExpiry(expiryDate: Date): number {
		const dayMs = 24 * 60 * 60 * 1000;
		return Math.ceil((expiryDate.getTime() - Date.now()) / dayMs);
	}

	private normalizeDomainSummary(row: DbDomainRow) {
		return {
			id: row.id,
			domain_name: row.domain_name,
			tld: row.tld,
			client_id: row.client_id,
			registrar: row.registrar,
			status: row.status,
			expiry_date: row.expiry_date.toISOString().slice(0, 10),
			days_until_expiry: this.daysUntilExpiry(row.expiry_date),
			auto_renew: row.auto_renew,
			annual_cost: row.annual_cost,
		};
	}

	private normalizeDomainDetail(row: DbDomainRow, sslCertificates: unknown[]) {
		const days = this.daysUntilExpiry(row.expiry_date);
		return {
			id: row.id,
			domain_name: row.domain_name,
			tld: row.tld,
			client_id: row.client_id,
			project_id: row.project_id,
			registrar: row.registrar,
			registrar_name: row.registrar_name,
			registrar_url: row.registrar_url,
			status: row.status,
			registration_date: row.registration_date
				? row.registration_date.toISOString().slice(0, 10)
				: null,
			expiry_date: row.expiry_date.toISOString().slice(0, 10),
			last_renewed: row.last_renewed
				? row.last_renewed.toISOString().slice(0, 10)
				: null,
			days_until_expiry: days,
			is_expiring_soon: days <= 60,
			nameservers: this.parseNameservers(row.nameservers),
			dns_provider: row.dns_provider,
			auto_renew: row.auto_renew,
			privacy_protection: row.privacy_protection,
			transfer_lock: row.transfer_lock,
			annual_cost: row.annual_cost,
			currency: row.currency,
			notes: row.notes,
			ssl_certificates: sslCertificates,
			created_at: row.created_at,
		};
	}

	private normalizeRegistrar(value?: string): string {
		const registrar = (value ?? 'other').toLowerCase();
		if (!this.allowedRegistrars.has(registrar)) {
			return 'other';
		}
		return registrar;
	}

	private normalizeStatus(value?: string): string | null {
		if (!value) {
			return null;
		}
		const normalized = value.toLowerCase();
		if (!this.allowedStatuses.has(normalized)) {
			return null;
		}
		return normalized;
	}

	async listDomains(query: {
		status?: string;
		client_id?: number;
		registrar?: string;
		limit?: number;
		offset?: number;
	}) {
		const limit = Math.max(1, Math.min(100, query.limit ?? 50));
		const offset = Math.max(0, query.offset ?? 0);
		const status = this.normalizeStatus(query.status);
		const registrar = query.registrar
			? this.normalizeRegistrar(query.registrar)
			: null;

		const countRows = await this.prisma.$queryRaw<{ total: bigint }[]>`
			SELECT COUNT(*)::bigint AS total
			FROM domains d
			WHERE
				(${status}::text IS NULL OR d.status::text = ${status})
				AND (${query.client_id ?? null}::int IS NULL OR d.client_id = ${query.client_id ?? null})
				AND (${registrar}::text IS NULL OR d.registrar::text = ${registrar})
		`;

		const rows = await this.prisma.$queryRaw<DbDomainRow[]>`
			SELECT
				d.id,
				d.domain_name,
				d.tld,
				d.client_id,
				d.project_id,
				d.registrar::text AS registrar,
				d.registrar_name,
				d.registrar_url,
				d.status::text AS status,
				d.registration_date,
				d.expiry_date,
				d.last_renewed,
				d.nameservers,
				d.dns_provider,
				d.auto_renew,
				d.privacy_protection,
				d.transfer_lock,
				d.annual_cost,
				d.currency,
				d.notes,
				d.last_whois_check,
				d.created_at,
				d.updated_at
			FROM domains d
			WHERE
				(${status}::text IS NULL OR d.status::text = ${status})
				AND (${query.client_id ?? null}::int IS NULL OR d.client_id = ${query.client_id ?? null})
				AND (${registrar}::text IS NULL OR d.registrar::text = ${registrar})
			ORDER BY d.expiry_date ASC
			OFFSET ${offset}
			LIMIT ${limit}
		`;

		return {
			domains: rows.map(row => this.normalizeDomainSummary(row)),
			total: Number(countRows[0]?.total ?? 0),
		};
	}

	async listExpiringDomains(days = 60) {
		const normalizedDays = Math.max(1, Math.min(3650, days));
		const rows = await this.prisma.$queryRaw<DbDomainRow[]>`
			SELECT
				d.id,
				d.domain_name,
				d.tld,
				d.client_id,
				d.project_id,
				d.registrar::text AS registrar,
				d.registrar_name,
				d.registrar_url,
				d.status::text AS status,
				d.registration_date,
				d.expiry_date,
				d.last_renewed,
				d.nameservers,
				d.dns_provider,
				d.auto_renew,
				d.privacy_protection,
				d.transfer_lock,
				d.annual_cost,
				d.currency,
				d.notes,
				d.last_whois_check,
				d.created_at,
				d.updated_at
			FROM domains d
			WHERE
				d.status = ${'active'}::domainstatus
				AND d.expiry_date <= (CURRENT_DATE + (${normalizedDays} * INTERVAL '1 day'))::date
				AND d.expiry_date >= CURRENT_DATE
			ORDER BY d.expiry_date ASC
		`;

		return {
			expiring_within_days: normalizedDays,
			count: rows.length,
			domains: rows.map(row => ({
				id: row.id,
				domain_name: row.domain_name,
				client_id: row.client_id,
				expiry_date: row.expiry_date.toISOString().slice(0, 10),
				days_until_expiry: this.daysUntilExpiry(row.expiry_date),
				registrar: row.registrar,
				auto_renew: row.auto_renew,
				annual_cost: row.annual_cost,
			})),
		};
	}

	async getDomain(domainId: number) {
		const rows = await this.prisma.$queryRaw<DbDomainRow[]>`
			SELECT
				d.id,
				d.domain_name,
				d.tld,
				d.client_id,
				d.project_id,
				d.registrar::text AS registrar,
				d.registrar_name,
				d.registrar_url,
				d.status::text AS status,
				d.registration_date,
				d.expiry_date,
				d.last_renewed,
				d.nameservers,
				d.dns_provider,
				d.auto_renew,
				d.privacy_protection,
				d.transfer_lock,
				d.annual_cost,
				d.currency,
				d.notes,
				d.last_whois_check,
				d.created_at,
				d.updated_at
			FROM domains d
			WHERE d.id = ${domainId}
			LIMIT 1
		`;

		const domain = rows[0];
		if (!domain) {
			throw new NotFoundException({ detail: 'Domain not found' });
		}

		const certRows = await this.prisma.$queryRaw<
			{ id: number; provider: string; expiry_date: Date; is_active: boolean }[]
		>`
			SELECT id, provider::text AS provider, expiry_date, is_active
			FROM ssl_certificates
			WHERE domain_id = ${domainId}
			ORDER BY expiry_date ASC
		`;

		const certs = certRows.map(cert => ({
			id: cert.id,
			provider: cert.provider,
			expiry_date: cert.expiry_date.toISOString().slice(0, 10),
			is_active: cert.is_active,
		}));

		return this.normalizeDomainDetail(domain, certs);
	}

	async refreshWhois(domainId: number) {
		const domain = await this.getDomain(domainId);
		await this.prisma.$executeRaw`
			UPDATE domains
			SET last_whois_check = NOW(), updated_at = NOW()
			WHERE id = ${domainId}
		`;

		return {
			status: 'success',
			domain_id: domain.id,
			domain_name: domain.domain_name,
			expiry_date: domain.expiry_date,
			registration_date: domain.registration_date,
			registrar_name: domain.registrar_name,
			last_whois_check: new Date().toISOString(),
		};
	}

	async createDomain(payload: DomainCreateDto) {
		const clientRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM clients
			WHERE id = ${payload.client_id}
			LIMIT 1
		`;
		if (!clientRows[0]) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const normalizedDomainName = payload.domain_name.toLowerCase();
		const duplicateRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM domains
			WHERE domain_name = ${normalizedDomainName}
			LIMIT 1
		`;
		if (duplicateRows[0]) {
			throw new BadRequestException({ detail: 'Domain already exists' });
		}

		const registrar = this.normalizeRegistrar(payload.registrar);
		const nameservers = payload.nameservers
			? JSON.stringify(payload.nameservers)
			: null;

		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO domains (
				domain_name,
				tld,
				registrar,
				registrar_name,
				registration_date,
				expiry_date,
				nameservers,
				dns_provider,
				status,
				auto_renew,
				privacy_protection,
				transfer_lock,
				annual_cost,
				currency,
				reminder_days,
				client_id,
				project_id,
				updated_at
			)
			VALUES (
				${normalizedDomainName},
				${this.extractTld(normalizedDomainName)},
				${registrar}::registrar,
				${payload.registrar_name ?? null},
				${payload.registration_date ? new Date(payload.registration_date) : null},
				${new Date(payload.expiry_date)},
				${nameservers},
				${payload.dns_provider ?? null},
				${'active'}::domainstatus,
				${payload.auto_renew ?? true},
				${payload.privacy_protection ?? true},
				${true},
				${payload.annual_cost ?? 0},
				${(payload.currency ?? 'USD').toUpperCase()},
				${30},
				${payload.client_id},
				${payload.project_id ?? null},
				NOW()
			)
			RETURNING id
		`;

		return {
			status: 'success',
			message: `Domain ${normalizedDomainName} added`,
			domain_id: rows[0]?.id,
		};
	}

	async updateDomain(domainId: number, updates: DomainUpdateDto) {
		const current = await this.getDomain(domainId);

		const registrar = updates.registrar
			? this.normalizeRegistrar(updates.registrar)
			: current.registrar;
		const status = this.normalizeStatus(updates.status) ?? current.status;

		await this.prisma.$executeRaw`
			UPDATE domains
			SET
				registrar = ${registrar}::registrar,
				registrar_name = ${updates.registrar_name ?? current.registrar_name ?? null},
				expiry_date = ${updates.expiry_date ? new Date(updates.expiry_date) : new Date(current.expiry_date)},
				annual_cost = ${updates.annual_cost ?? current.annual_cost},
				auto_renew = ${updates.auto_renew ?? current.auto_renew},
				privacy_protection = ${updates.privacy_protection ?? current.privacy_protection},
				transfer_lock = ${updates.transfer_lock ?? current.transfer_lock},
				nameservers = ${updates.nameservers ? JSON.stringify(updates.nameservers) : JSON.stringify(current.nameservers)},
				dns_provider = ${updates.dns_provider ?? current.dns_provider ?? null},
				status = ${status}::domainstatus,
				notes = ${updates.notes ?? current.notes ?? null},
				updated_at = NOW()
			WHERE id = ${domainId}
		`;

		return {
			status: 'success',
			message: `Domain ${current.domain_name} updated`,
		};
	}

	async deleteDomain(domainId: number) {
		const current = await this.getDomain(domainId);
		await this.prisma.$executeRaw`
			DELETE FROM domains
			WHERE id = ${domainId}
		`;
		return {
			status: 'success',
			message: `Domain ${current.domain_name} removed`,
		};
	}

	async renewDomain(domainId: number, years = 1) {
		const current = await this.getDomain(domainId);
		const nextYears = Math.max(1, Math.min(20, years));
		const currentExpiry = new Date(current.expiry_date);
		const newExpiry = new Date(currentExpiry);
		newExpiry.setUTCDate(newExpiry.getUTCDate() + nextYears * 365);

		await this.prisma.$executeRaw`
			UPDATE domains
			SET
				expiry_date = ${newExpiry},
				last_renewed = CURRENT_DATE,
				status = ${'active'}::domainstatus,
				updated_at = NOW()
			WHERE id = ${domainId}
		`;

		return {
			status: 'success',
			message: `Domain renewed for ${nextYears} year(s)`,
			new_expiry_date: newExpiry.toISOString().slice(0, 10),
		};
	}

	async getDomainStats() {
		const rows = await this.prisma.$queryRaw<DbDomainRow[]>`
			SELECT
				d.id,
				d.domain_name,
				d.tld,
				d.client_id,
				d.project_id,
				d.registrar::text AS registrar,
				d.registrar_name,
				d.registrar_url,
				d.status::text AS status,
				d.registration_date,
				d.expiry_date,
				d.last_renewed,
				d.nameservers,
				d.dns_provider,
				d.auto_renew,
				d.privacy_protection,
				d.transfer_lock,
				d.annual_cost,
				d.currency,
				d.notes,
				d.last_whois_check,
				d.created_at,
				d.updated_at
			FROM domains d
			WHERE d.status = ${'active'}::domainstatus
		`;

		const byRegistrar: Record<string, { count: number; annual_cost: number }> =
			{};
		let totalCost = 0;
		let expiringIn60 = 0;
		let expiringIn30 = 0;

		for (const row of rows) {
			if (!byRegistrar[row.registrar]) {
				byRegistrar[row.registrar] = { count: 0, annual_cost: 0 };
			}
			const bucket = byRegistrar[row.registrar];
			if (bucket) {
				bucket.count += 1;
				bucket.annual_cost += row.annual_cost ?? 0;
			}
			totalCost += row.annual_cost ?? 0;

			const days = this.daysUntilExpiry(row.expiry_date);
			if (days <= 60) {
				expiringIn60 += 1;
			}
			if (days <= 30) {
				expiringIn30 += 1;
			}
		}

		return {
			total_domains: rows.length,
			total_annual_cost: Number(totalCost.toFixed(2)),
			expiring_in_60_days: expiringIn60,
			expiring_in_30_days: expiringIn30,
			by_registrar: byRegistrar,
		};
	}
}
