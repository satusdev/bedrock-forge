import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { domains, domainstatus, registrar } from '@prisma/client';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import { DomainCreateDto } from './dto/domain-create.dto';
import { DomainUpdateDto } from './dto/domain-update.dto';

const execFileAsync = promisify(execFile);

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

type DueDomainClaim = {
	id: number;
	domain_name: string;
	last_whois_check: Date | null;
};

type DomainRunnerSnapshot = {
	enabled: boolean;
	runs_total: number;
	last_run_at: string | null;
	last_outcome: {
		claimed: number;
		whois_succeeded: number;
		whois_failed: number;
		reminders_processed: number;
		reminders_sent: number;
		error: string | null;
	} | null;
};

@Injectable()
export class DomainsService {
	constructor(private readonly prisma: PrismaService) {}

	private resolveOptionalOwnerId(ownerId?: number) {
		if (
			typeof ownerId !== 'number' ||
			!Number.isFinite(ownerId) ||
			ownerId <= 0
		) {
			return undefined;
		}
		return ownerId;
	}
	private runnerSnapshot: DomainRunnerSnapshot = {
		enabled:
			(process.env.DOMAIN_RUNNER_ENABLED ?? 'true').toLowerCase() !== 'false',
		runs_total: 0,
		last_run_at: null,
		last_outcome: null,
	};

	private readonly allowedRegistrars = new Set([
		'namecheap',
		'godaddy',
		'cloudflare',
		'google_domains',
		'name_com',
		'porkbun',
		'hover',
		'dynadot',
		'other',
	]);

	getRunnerSnapshot() {
		return this.runnerSnapshot;
	}

	recordRunnerSnapshot(outcome: {
		claimed: number;
		whois_succeeded: number;
		whois_failed: number;
		reminders_processed: number;
		reminders_sent: number;
		error?: string | null;
	}) {
		this.runnerSnapshot = {
			...this.runnerSnapshot,
			runs_total: this.runnerSnapshot.runs_total + 1,
			last_run_at: new Date().toISOString(),
			last_outcome: {
				claimed: outcome.claimed,
				whois_succeeded: outcome.whois_succeeded,
				whois_failed: outcome.whois_failed,
				reminders_processed: outcome.reminders_processed,
				reminders_sent: outcome.reminders_sent,
				error: outcome.error ?? null,
			},
		};
	}

	private readonly allowedStatuses = new Set([
		'active',
		'expired',
		'pending_transfer',
		'locked',
		'redemption',
		'pending_delete',
	]);

	private toDbDomainRow(domain: domains): DbDomainRow {
		return {
			...domain,
			registrar: domain.registrar,
			status: domain.status,
		};
	}

	private async getDomainRecord(domainId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOptionalOwnerId(ownerId);
		const where =
			typeof resolvedOwnerId === 'number'
				? {
						id: domainId,
						clients: { owner_id: resolvedOwnerId },
					}
				: { id: domainId };
		const domain = await this.prisma.domains.findFirst({ where });
		if (!domain) {
			throw new NotFoundException({ detail: 'Domain not found' });
		}

		return domain;
	}

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

	private normalizeRegistrar(value?: string): registrar {
		const registrar = (value ?? 'other').toLowerCase();
		if (!this.allowedRegistrars.has(registrar)) {
			return 'other' as registrar;
		}
		return registrar as registrar;
	}

	private normalizeStatus(value?: string): domainstatus | null {
		if (!value) {
			return null;
		}
		const normalized = value.toLowerCase();
		if (!this.allowedStatuses.has(normalized)) {
			return null;
		}
		return normalized as domainstatus;
	}

	private parseWhoisExpiryDate(output: string): Date | null {
		const patterns = [
			/Registry Expiry Date\s*:\s*(.+)$/im,
			/Registrar Registration Expiration Date\s*:\s*(.+)$/im,
			/Expiration Date\s*:\s*(.+)$/im,
			/Expiry Date\s*:\s*(.+)$/im,
			/paid-till\s*:\s*(.+)$/im,
			/renewal date\s*:\s*(.+)$/im,
		];

		for (const pattern of patterns) {
			const match = output.match(pattern);
			if (!match?.[1]) {
				continue;
			}

			const candidate = new Date(match[1].trim());
			if (!Number.isNaN(candidate.getTime())) {
				return candidate;
			}
		}

		return null;
	}

	private async fetchWhoisExpiryDate(domainName: string) {
		try {
			const { stdout } = await execFileAsync('whois', [domainName], {
				timeout: 5000,
				maxBuffer: 1024 * 1024,
			});
			return this.parseWhoisExpiryDate(stdout);
		} catch {
			return null;
		}
	}

	private async resolveExpiryDate(
		domainName: string,
		explicitExpiryDate?: string,
	) {
		if (explicitExpiryDate) {
			return new Date(explicitExpiryDate);
		}

		const whoisExpiryDate = await this.fetchWhoisExpiryDate(domainName);
		if (whoisExpiryDate) {
			return whoisExpiryDate;
		}

		const fallback = new Date();
		fallback.setUTCDate(fallback.getUTCDate() + 365);
		fallback.setUTCHours(0, 0, 0, 0);
		return fallback;
	}

	private async ensureOwnedProject(projectId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOptionalOwnerId(ownerId);
		const project = await this.prisma.projects.findUnique({
			where: { id: projectId },
			select: { id: true, owner_id: true },
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
		if (
			typeof resolvedOwnerId === 'number' &&
			project.owner_id !== resolvedOwnerId
		) {
			throw new NotFoundException({ detail: 'Project not found' });
		}
	}

	async claimWhoisDueDomains(limit = 10) {
		const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
		const lookbackHours = Math.max(
			1,
			Math.min(
				168,
				Number.parseInt(process.env.DOMAIN_WHOIS_LOOKBACK_HOURS ?? '24', 10) ||
					24,
			),
		);
		const threshold = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
		const rows = await this.prisma.domains.findMany({
			where: {
				status: 'active',
				OR: [
					{ last_whois_check: null },
					{ last_whois_check: { lte: threshold } },
				],
			},
			orderBy: [{ last_whois_check: 'asc' }, { id: 'asc' }],
			take: safeLimit,
			select: {
				id: true,
				domain_name: true,
				last_whois_check: true,
			},
		});

		const now = new Date();
		for (const row of rows) {
			await this.prisma.domains.update({
				where: { id: row.id },
				data: {
					last_whois_check: now,
					updated_at: now,
				},
			});
		}

		return rows as DueDomainClaim[];
	}

	async runWhoisRefresh(domainId: number) {
		const domain = await this.getDomainRecord(domainId);
		const whoisExpiryDate = await this.fetchWhoisExpiryDate(domain.domain_name);
		const effectiveExpiry = whoisExpiryDate ?? domain.expiry_date;
		const nextStatus: domainstatus =
			effectiveExpiry.getTime() < Date.now() ? 'expired' : 'active';

		const now = new Date();
		await this.prisma.domains.update({
			where: { id: domain.id },
			data: {
				expiry_date: effectiveExpiry,
				status: nextStatus,
				last_whois_check: now,
				updated_at: now,
			},
		});

		return {
			domain_id: domain.id,
			domain_name: domain.domain_name,
			expiry_date: effectiveExpiry.toISOString().slice(0, 10),
			status: nextStatus,
		};
	}

	async processExpiryReminders(limit = 50) {
		const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
		const now = new Date();
		const rows = await this.prisma.domains.findMany({
			where: {
				status: 'active',
				expiry_date: { gte: now },
			},
			orderBy: { expiry_date: 'asc' },
			take: safeLimit,
		});

		let remindersSent = 0;
		for (const row of rows) {
			const daysUntilExpiry = this.daysUntilExpiry(row.expiry_date);
			if (daysUntilExpiry > row.reminder_days) {
				continue;
			}
			if (row.last_reminder_sent) {
				const elapsed = now.getTime() - row.last_reminder_sent.getTime();
				if (elapsed < 24 * 60 * 60 * 1000) {
					continue;
				}
			}

			await this.prisma.domains.update({
				where: { id: row.id },
				data: {
					last_reminder_sent: now,
					updated_at: now,
				},
			});
			remindersSent += 1;
		}

		return {
			processed: rows.length,
			reminders_sent: remindersSent,
		};
	}

	async listDomains(query: {
		status?: string;
		client_id?: number;
		registrar?: string;
		limit?: number;
		offset?: number;
		owner_id?: number;
	}) {
		const resolvedOwnerId = this.resolveOptionalOwnerId(query.owner_id);
		const limit = Math.max(1, Math.min(100, query.limit ?? 50));
		const offset = Math.max(0, query.offset ?? 0);
		const status = this.normalizeStatus(query.status);
		const registrar = query.registrar
			? this.normalizeRegistrar(query.registrar)
			: null;

		const where = {
			...(status ? { status } : {}),
			...(query.client_id ? { client_id: query.client_id } : {}),
			...(registrar ? { registrar } : {}),
			...(typeof resolvedOwnerId === 'number'
				? { clients: { owner_id: resolvedOwnerId } }
				: {}),
		};

		const [total, rows] = await Promise.all([
			this.prisma.domains.count({ where }),
			this.prisma.domains.findMany({
				where,
				orderBy: { expiry_date: 'asc' },
				skip: offset,
				take: limit,
			}),
		]);

		return {
			domains: rows.map(row =>
				this.normalizeDomainSummary(this.toDbDomainRow(row)),
			),
			total,
		};
	}

	async listExpiringDomains(days = 60, ownerId?: number) {
		const resolvedOwnerId = this.resolveOptionalOwnerId(ownerId);
		const normalizedDays = Math.max(1, Math.min(3650, days));
		const fromDate = new Date();
		fromDate.setHours(0, 0, 0, 0);
		const toDate = new Date(fromDate);
		toDate.setDate(toDate.getDate() + normalizedDays);

		const rows = await this.prisma.domains.findMany({
			where: {
				status: 'active',
				...(typeof resolvedOwnerId === 'number'
					? { clients: { owner_id: resolvedOwnerId } }
					: {}),
				expiry_date: {
					gte: fromDate,
					lte: toDate,
				},
			},
			orderBy: { expiry_date: 'asc' },
		});

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

	async getDomain(domainId: number, ownerId?: number) {
		const domain = await this.getDomainRecord(domainId, ownerId);

		const certRows = await this.prisma.ssl_certificates.findMany({
			where: { domain_id: domainId },
			orderBy: { expiry_date: 'asc' },
			select: {
				id: true,
				provider: true,
				expiry_date: true,
				is_active: true,
			},
		});

		const certs = certRows.map(cert => ({
			id: cert.id,
			provider: cert.provider,
			expiry_date: cert.expiry_date.toISOString().slice(0, 10),
			is_active: cert.is_active,
		}));

		return this.normalizeDomainDetail(this.toDbDomainRow(domain), certs);
	}

	async refreshWhois(domainId: number, ownerId?: number) {
		const domain = await this.getDomain(domainId, ownerId);
		await this.prisma.domains.update({
			where: { id: domainId },
			data: {
				last_whois_check: new Date(),
				updated_at: new Date(),
			},
		});

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

	async createDomain(payload: DomainCreateDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOptionalOwnerId(ownerId);
		const client = await this.prisma.clients.findUnique({
			where: { id: payload.client_id },
			select: { id: true, owner_id: true },
		});
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}
		if (
			typeof resolvedOwnerId === 'number' &&
			client.owner_id !== resolvedOwnerId
		) {
			throw new NotFoundException({ detail: 'Client not found' });
		}
		if (typeof payload.project_id === 'number') {
			await this.ensureOwnedProject(payload.project_id, resolvedOwnerId);
		}

		const normalizedDomainName = payload.domain_name.toLowerCase();
		const duplicate = await this.prisma.domains.findUnique({
			where: { domain_name: normalizedDomainName },
			select: { id: true },
		});
		if (duplicate) {
			throw new BadRequestException({ detail: 'Domain already exists' });
		}

		const registrar = this.normalizeRegistrar(payload.registrar);
		const nameservers = payload.nameservers
			? JSON.stringify(payload.nameservers)
			: null;
		const expiryDate = await this.resolveExpiryDate(
			normalizedDomainName,
			payload.expiry_date,
		);

		const created = await this.prisma.domains.create({
			data: {
				domain_name: normalizedDomainName,
				tld: this.extractTld(normalizedDomainName),
				registrar,
				registrar_name: payload.registrar_name ?? null,
				registration_date: payload.registration_date
					? new Date(payload.registration_date)
					: null,
				expiry_date: expiryDate,
				nameservers,
				dns_provider: payload.dns_provider ?? null,
				status: 'active',
				auto_renew: payload.auto_renew ?? true,
				privacy_protection: payload.privacy_protection ?? true,
				transfer_lock: true,
				annual_cost: payload.annual_cost ?? 0,
				currency: (payload.currency ?? 'USD').toUpperCase(),
				reminder_days: 30,
				client_id: payload.client_id,
				project_id: payload.project_id ?? null,
				updated_at: new Date(),
			},
			select: { id: true },
		});

		return {
			status: 'success',
			message: `Domain ${normalizedDomainName} added`,
			domain_id: created.id,
		};
	}

	async updateDomain(
		domainId: number,
		updates: DomainUpdateDto,
		ownerId?: number,
	) {
		const current = await this.getDomainRecord(domainId, ownerId);

		const registrar = updates.registrar
			? this.normalizeRegistrar(updates.registrar)
			: current.registrar;
		const status = this.normalizeStatus(updates.status) ?? current.status;

		await this.prisma.domains.update({
			where: { id: domainId },
			data: {
				registrar,
				registrar_name:
					updates.registrar_name ?? current.registrar_name ?? null,
				expiry_date: updates.expiry_date
					? new Date(updates.expiry_date)
					: current.expiry_date,
				annual_cost: updates.annual_cost ?? current.annual_cost,
				auto_renew: updates.auto_renew ?? current.auto_renew,
				privacy_protection:
					updates.privacy_protection ?? current.privacy_protection,
				transfer_lock: updates.transfer_lock ?? current.transfer_lock,
				nameservers: updates.nameservers
					? JSON.stringify(updates.nameservers)
					: current.nameservers,
				dns_provider: updates.dns_provider ?? current.dns_provider ?? null,
				status,
				notes: updates.notes ?? current.notes ?? null,
				updated_at: new Date(),
			},
		});

		return {
			status: 'success',
			message: `Domain ${current.domain_name} updated`,
		};
	}

	async deleteDomain(domainId: number, ownerId?: number) {
		const current = await this.getDomainRecord(domainId, ownerId);
		await this.prisma.domains.delete({ where: { id: domainId } });
		return {
			status: 'success',
			message: `Domain ${current.domain_name} removed`,
		};
	}

	async renewDomain(domainId: number, years = 1, ownerId?: number) {
		const current = await this.getDomainRecord(domainId, ownerId);
		const nextYears = Math.max(1, Math.min(20, years));
		const currentExpiry = current.expiry_date;
		const newExpiry = new Date(currentExpiry);
		newExpiry.setUTCDate(newExpiry.getUTCDate() + nextYears * 365);

		await this.prisma.domains.update({
			where: { id: domainId },
			data: {
				expiry_date: newExpiry,
				last_renewed: new Date(),
				status: 'active',
				updated_at: new Date(),
			},
		});

		return {
			status: 'success',
			message: `Domain renewed for ${nextYears} year(s)`,
			new_expiry_date: newExpiry.toISOString().slice(0, 10),
		};
	}

	async getDomainStats(ownerId?: number) {
		const resolvedOwnerId = this.resolveOptionalOwnerId(ownerId);
		const rows = await this.prisma.domains.findMany({
			where: {
				status: 'active',
				...(typeof resolvedOwnerId === 'number'
					? { clients: { owner_id: resolvedOwnerId } }
					: {}),
			},
		});

		const byRegistrar: Record<string, { count: number; annual_cost: number }> =
			{};
		let totalCost = 0;
		let expiringIn60 = 0;
		let expiringIn30 = 0;

		for (const domain of rows) {
			const row = this.toDbDomainRow(domain);
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
