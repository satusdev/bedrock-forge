import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SslCreateDto } from './dto/ssl-create.dto';
import { SslUpdateDto } from './dto/ssl-update.dto';

type DbSslRow = {
	id: number;
	common_name: string;
	san_domains: string | null;
	domain_id: number | null;
	project_id: number | null;
	provider: string;
	certificate_type: string;
	issue_date: Date;
	expiry_date: Date;
	is_active: boolean;
	auto_renew: boolean;
	is_wildcard: boolean;
	annual_cost: number;
	last_renewal_attempt: Date | null;
	renewal_failure_count: number;
	notes: string | null;
	created_at: Date;
};

type DueSslClaim = {
	id: number;
};

@Injectable()
export class SslService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private readonly allowedProviders = new Set([
		'lets_encrypt',
		'cloudflare',
		'sectigo',
		'digicert',
		'godaddy',
		'aws_acm',
		'custom',
		'other',
	]);

	private readonly allowedTypes = new Set([
		'dv',
		'ov',
		'ev',
		'wildcard',
		'multi_domain',
	]);

	private normalizeProvider(value?: string): string {
		const provider = (value ?? 'lets_encrypt').toLowerCase();
		return this.allowedProviders.has(provider) ? provider : 'lets_encrypt';
	}

	private normalizeType(value?: string): string {
		const type = (value ?? 'dv').toLowerCase();
		return this.allowedTypes.has(type) ? type : 'dv';
	}

	private parseSanDomains(value: string | null): string[] {
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

	private isFree(provider: string): boolean {
		return provider === 'letsencrypt' || provider === 'lets_encrypt';
	}

	private normalizeSummary(row: DbSslRow) {
		return {
			id: row.id,
			common_name: row.common_name,
			domain_id: row.domain_id,
			provider: row.provider,
			type: row.certificate_type,
			expiry_date: row.expiry_date.toISOString().slice(0, 10),
			days_until_expiry: this.daysUntilExpiry(row.expiry_date),
			is_active: row.is_active,
			auto_renew: row.auto_renew,
			is_free: this.isFree(row.provider),
		};
	}

	private async getCertificateRow(certId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbSslRow[]>`
			SELECT
				s.id,
				s.common_name,
				s.san_domains,
				s.domain_id,
				s.project_id,
				s.provider::text AS provider,
				s.certificate_type::text AS certificate_type,
				s.issue_date,
				s.expiry_date,
				s.is_active,
				s.auto_renew,
				s.is_wildcard,
				s.annual_cost,
				s.last_renewal_attempt,
				s.renewal_failure_count,
				s.notes,
				s.created_at
			FROM ssl_certificates s
			JOIN projects p ON p.id = s.project_id
			WHERE s.id = ${certId}
				AND p.owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		const cert = rows[0];
		if (!cert) {
			throw new NotFoundException({ detail: 'Certificate not found' });
		}
		return cert;
	}

	private async ensureOwnedProject(projectId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM projects
			WHERE id = ${projectId} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		if (!rows[0]) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
	}

	async listCertificates(query: {
		provider?: string;
		is_active?: boolean;
		limit?: number;
		offset?: number;
		owner_id?: number;
	}) {
		const resolvedOwnerId = this.resolveOwnerId(query.owner_id);
		const limit = Math.max(1, Math.min(100, query.limit ?? 50));
		const offset = Math.max(0, query.offset ?? 0);
		const provider = query.provider
			? this.normalizeProvider(query.provider)
			: null;

		const countRows = await this.prisma.$queryRaw<{ total: bigint }[]>`
			SELECT COUNT(*)::bigint AS total
			FROM ssl_certificates s
			JOIN projects p ON p.id = s.project_id
			WHERE
				(${provider}::text IS NULL OR s.provider::text = ${provider})
				AND (${query.is_active ?? null}::boolean IS NULL OR s.is_active = ${query.is_active ?? null})
				AND p.owner_id = ${resolvedOwnerId}
		`;

		const rows = await this.prisma.$queryRaw<DbSslRow[]>`
			SELECT
				s.id,
				s.common_name,
				s.san_domains,
				s.domain_id,
				s.project_id,
				s.provider::text AS provider,
				s.certificate_type::text AS certificate_type,
				s.issue_date,
				s.expiry_date,
				s.is_active,
				s.auto_renew,
				s.is_wildcard,
				s.annual_cost,
				s.last_renewal_attempt,
				s.renewal_failure_count,
				s.notes,
				s.created_at
			FROM ssl_certificates s
			JOIN projects p ON p.id = s.project_id
			WHERE
				(${provider}::text IS NULL OR s.provider::text = ${provider})
				AND (${query.is_active ?? null}::boolean IS NULL OR s.is_active = ${query.is_active ?? null})
				AND p.owner_id = ${resolvedOwnerId}
			ORDER BY s.expiry_date ASC
			OFFSET ${offset}
			LIMIT ${limit}
		`;

		return {
			certificates: rows.map(row => this.normalizeSummary(row)),
			total: Number(countRows[0]?.total ?? 0),
		};
	}

	async listExpiringCertificates(days = 14, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const normalizedDays = Math.max(1, Math.min(3650, days));
		const rows = await this.prisma.$queryRaw<DbSslRow[]>`
			SELECT
				s.id,
				s.common_name,
				s.san_domains,
				s.domain_id,
				s.project_id,
				s.provider::text AS provider,
				s.certificate_type::text AS certificate_type,
				s.issue_date,
				s.expiry_date,
				s.is_active,
				s.auto_renew,
				s.is_wildcard,
				s.annual_cost,
				s.last_renewal_attempt,
				s.renewal_failure_count,
				s.notes,
				s.created_at
			FROM ssl_certificates s
			JOIN projects p ON p.id = s.project_id
			WHERE
				s.is_active = true
				AND s.expiry_date <= (CURRENT_DATE + (${normalizedDays} * INTERVAL '1 day'))::date
				AND s.expiry_date >= CURRENT_DATE
				AND p.owner_id = ${resolvedOwnerId}
			ORDER BY s.expiry_date ASC
		`;

		return {
			expiring_within_days: normalizedDays,
			count: rows.length,
			certificates: rows.map(row => ({
				id: row.id,
				common_name: row.common_name,
				provider: row.provider,
				expiry_date: row.expiry_date.toISOString().slice(0, 10),
				days_until_expiry: this.daysUntilExpiry(row.expiry_date),
				auto_renew: row.auto_renew,
				is_free: this.isFree(row.provider),
			})),
		};
	}

	async getCertificate(certId: number, ownerId?: number) {
		const cert = await this.getCertificateRow(certId, ownerId);

		return {
			id: cert.id,
			common_name: cert.common_name,
			san_domains: this.parseSanDomains(cert.san_domains),
			domain_id: cert.domain_id,
			project_id: cert.project_id,
			provider: cert.provider,
			certificate_type: cert.certificate_type,
			issue_date: cert.issue_date.toISOString().slice(0, 10),
			expiry_date: cert.expiry_date.toISOString().slice(0, 10),
			days_until_expiry: this.daysUntilExpiry(cert.expiry_date),
			validity_days: Math.ceil(
				(cert.expiry_date.getTime() - cert.issue_date.getTime()) /
					(24 * 60 * 60 * 1000),
			),
			is_active: cert.is_active,
			auto_renew: cert.auto_renew,
			is_wildcard: cert.is_wildcard,
			is_free: this.isFree(cert.provider),
			annual_cost: cert.annual_cost,
			last_renewal_attempt: cert.last_renewal_attempt,
			renewal_failure_count: cert.renewal_failure_count,
			notes: cert.notes,
			created_at: cert.created_at,
		};
	}

	async createCertificate(payload: SslCreateDto, ownerId?: number) {
		if (!payload.project_id) {
			throw new BadRequestException({ detail: 'project_id is required' });
		}
		await this.ensureOwnedProject(payload.project_id, ownerId);

		const provider = this.normalizeProvider(payload.provider);
		const certificateType = this.normalizeType(payload.certificate_type);
		const sanDomains = payload.san_domains
			? JSON.stringify(payload.san_domains)
			: null;

		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO ssl_certificates (
				common_name,
				san_domains,
				provider,
				certificate_type,
				issue_date,
				expiry_date,
				is_active,
				auto_renew,
				is_wildcard,
				annual_cost,
				reminder_days,
				renewal_failure_count,
				domain_id,
				project_id,
				updated_at
			)
			VALUES (
				${payload.common_name.toLowerCase()},
				${sanDomains},
				${provider}::sslprovider,
				${certificateType}::certificatetype,
				${new Date(payload.issue_date)},
				${new Date(payload.expiry_date)},
				${true},
				${payload.auto_renew ?? true},
				${payload.is_wildcard ?? false},
				${payload.annual_cost ?? 0},
				${14},
				${0},
				${payload.domain_id ?? null},
				${payload.project_id ?? null},
				NOW()
			)
			RETURNING id
		`;

		return {
			status: 'success',
			message: `SSL certificate for ${payload.common_name.toLowerCase()} added`,
			certificate_id: rows[0]?.id,
		};
	}

	async updateCertificate(
		certId: number,
		updates: SslUpdateDto,
		ownerId?: number,
	) {
		const current = await this.getCertificate(certId, ownerId);
		const provider = updates.provider
			? this.normalizeProvider(updates.provider)
			: current.provider;

		await this.prisma.$executeRaw`
			UPDATE ssl_certificates
			SET
				provider = ${provider}::sslprovider,
				expiry_date = ${updates.expiry_date ? new Date(updates.expiry_date) : new Date(current.expiry_date)},
				auto_renew = ${updates.auto_renew ?? current.auto_renew},
				is_active = ${updates.is_active ?? current.is_active},
				notes = ${updates.notes ?? current.notes ?? null},
				updated_at = NOW()
			WHERE id = ${certId}
		`;

		return {
			status: 'success',
			message: `Certificate ${current.common_name} updated`,
		};
	}

	async deleteCertificate(certId: number, ownerId?: number) {
		const current = await this.getCertificate(certId, ownerId);
		await this.prisma.$executeRaw`
			DELETE FROM ssl_certificates
			WHERE id = ${certId}
		`;
		return {
			status: 'success',
			message: `Certificate ${current.common_name} removed`,
		};
	}

	async renewCertificate(certId: number, newExpiry?: string, ownerId?: number) {
		const current = await this.getCertificate(certId, ownerId);
		const issueDate = new Date();
		let expiryDate: Date;
		if (newExpiry) {
			expiryDate = new Date(newExpiry);
		} else if (current.is_free) {
			expiryDate = new Date(issueDate.getTime() + 90 * 24 * 60 * 60 * 1000);
		} else {
			expiryDate = new Date(issueDate.getTime() + 365 * 24 * 60 * 60 * 1000);
		}

		await this.prisma.$executeRaw`
			UPDATE ssl_certificates
			SET
				issue_date = ${issueDate},
				expiry_date = ${expiryDate},
				is_active = ${true},
				renewal_failure_count = ${0},
				last_renewal_error = ${null},
				updated_at = NOW()
			WHERE id = ${certId}
		`;

		return {
			status: 'success',
			message: `Certificate renewed until ${expiryDate.toISOString().slice(0, 10)}`,
			new_expiry_date: expiryDate.toISOString().slice(0, 10),
		};
	}

	async getSslStats(ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<DbSslRow[]>`
			SELECT
				s.id,
				s.common_name,
				s.san_domains,
				s.domain_id,
				s.project_id,
				s.provider::text AS provider,
				s.certificate_type::text AS certificate_type,
				s.issue_date,
				s.expiry_date,
				s.is_active,
				s.auto_renew,
				s.is_wildcard,
				s.annual_cost,
				s.last_renewal_attempt,
				s.renewal_failure_count,
				s.notes,
				s.created_at
			FROM ssl_certificates s
			JOIN projects p ON p.id = s.project_id
			WHERE s.is_active = true
				AND p.owner_id = ${resolvedOwnerId}
		`;

		const byProvider: Record<string, number> = {};
		let freeCount = 0;
		let paidCost = 0;
		let expiringIn14 = 0;
		let expiringIn7 = 0;

		for (const row of rows) {
			byProvider[row.provider] = (byProvider[row.provider] ?? 0) + 1;
			if (this.isFree(row.provider)) {
				freeCount += 1;
			} else {
				paidCost += row.annual_cost ?? 0;
			}

			const days = this.daysUntilExpiry(row.expiry_date);
			if (days <= 14) {
				expiringIn14 += 1;
			}
			if (days <= 7) {
				expiringIn7 += 1;
			}
		}

		return {
			total_certificates: rows.length,
			free_certificates: freeCount,
			paid_certificates: rows.length - freeCount,
			annual_cost_paid: Number(paidCost.toFixed(2)),
			expiring_in_14_days: expiringIn14,
			expiring_in_7_days: expiringIn7,
			by_provider: byProvider,
		};
	}

	async claimDueRenewals(limit = 5) {
		const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
		const leadDays = Math.max(
			1,
			Math.min(
				90,
				Number.parseInt(process.env.SSL_RUNNER_LEAD_DAYS ?? '14', 10) || 14,
			),
		);

		const now = new Date();
		const latestExpiry = new Date();
		latestExpiry.setDate(latestExpiry.getDate() + leadDays);
		const renewalThreshold = new Date(now.getTime() - 6 * 60 * 60 * 1000);

		const due = await this.prisma.ssl_certificates.findMany({
			where: {
				is_active: true,
				auto_renew: true,
				expiry_date: { lte: latestExpiry },
				OR: [
					{ last_renewal_attempt: null },
					{ last_renewal_attempt: { lte: renewalThreshold } },
				],
			},
			orderBy: [{ expiry_date: 'asc' }, { id: 'asc' }],
			take: safeLimit,
			select: { id: true },
		});

		if (due.length === 0) {
			return [];
		}

		await this.prisma.ssl_certificates.updateMany({
			where: { id: { in: due.map(row => row.id) } },
			data: {
				last_renewal_attempt: now,
				updated_at: now,
			},
		});

		return due;
	}

	async runAutoRenewal(certId: number) {
		const certificate = await this.prisma.ssl_certificates.findUnique({
			where: { id: certId },
			select: {
				id: true,
				provider: true,
				is_active: true,
				auto_renew: true,
				expiry_date: true,
			},
		});
		if (!certificate) {
			throw new NotFoundException({ detail: 'Certificate not found' });
		}

		if (!certificate.is_active || !certificate.auto_renew) {
			return {
				certificate_id: certificate.id,
				status: 'skipped',
			};
		}

		const issueDate = new Date();
		const validityDays = certificate.provider === 'letsencrypt' ? 90 : 365;
		const nextExpiry = new Date(
			issueDate.getTime() + validityDays * 24 * 60 * 60 * 1000,
		);

		await this.prisma.ssl_certificates.update({
			where: { id: certificate.id },
			data: {
				issue_date: issueDate,
				expiry_date: nextExpiry,
				is_active: true,
				last_renewal_attempt: issueDate,
				renewal_failure_count: 0,
				last_renewal_error: null,
				updated_at: issueDate,
			},
		});

		return {
			certificate_id: certificate.id,
			status: 'renewed',
			expiry_date: nextExpiry.toISOString().slice(0, 10),
		};
	}
}
