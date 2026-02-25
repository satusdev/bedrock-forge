import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClientCreateDto } from './dto/client-create.dto';
import { ClientUpdateDto } from './dto/client-update.dto';
import { GetClientsQueryDto } from './dto/get-clients-query.dto';

type DbClientListRow = {
	id: number;
	name: string;
	company: string | null;
	email: string;
	phone: string | null;
	billing_status: string;
	monthly_rate: number;
	currency: string;
	created_at: Date;
	project_count: bigint | number;
	invoice_count: bigint | number;
};

type DbClientDetails = {
	id: number;
	name: string;
	company: string | null;
	email: string;
	phone: string | null;
	billing_email: string | null;
	address: string | null;
	website: string | null;
	notes: string | null;
	billing_status: string;
	payment_terms: string;
	currency: string;
	tax_rate: number;
	auto_billing: boolean;
	contract_start: Date | null;
	contract_end: Date | null;
	invoice_prefix: string;
	created_at: Date;
	updated_at: Date;
	monthly_rate: number;
};

type DbProjectSummary = {
	id: number;
	name: string;
	status: string;
	environment: string;
	wp_home: string | null;
};

type DbInvoiceSummary = {
	id: number;
	invoice_number: string;
	status: string;
	total: number;
	amount_paid: number;
	issue_date: Date | null;
	due_date: Date | null;
};

type UserPreferences = {
	user_id: string;
	display_name: string | null;
	email: string | null;
	timezone: string;
	date_format: string;
	time_format: string;
	language: string;
	favorite_projects: string[];
	project_tags: Record<string, string[]>;
	custom_widgets: Record<string, Record<string, unknown>>;
	custom_filters: Record<string, Record<string, unknown>>;
};

@Injectable()
export class ClientsService {
	private readonly userPreferences = new Map<string, UserPreferences>();
	private readonly fallbackOwnerId = 1;

	constructor(private readonly prisma: PrismaService) {}

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private getDefaultUserPreferences(userId: string): UserPreferences {
		return {
			user_id: userId,
			display_name: null,
			email: null,
			timezone: 'UTC',
			date_format: 'YYYY-MM-DD',
			time_format: '24h',
			language: 'en',
			favorite_projects: [],
			project_tags: {},
			custom_widgets: {},
			custom_filters: {},
		};
	}

	getUserPreferences(userId: string) {
		return (
			this.userPreferences.get(userId) ?? this.getDefaultUserPreferences(userId)
		);
	}

	updateUserPreferences(userId: string, payload: Record<string, unknown>) {
		const current = this.getUserPreferences(userId);
		const updated: UserPreferences = {
			...current,
			...(payload as Partial<UserPreferences>),
			user_id: userId,
		};
		this.userPreferences.set(userId, updated);

		return {
			status: 'success',
			message: 'User preferences updated',
		};
	}

	async getAllClients(query: GetClientsQueryDto) {
		const limit = query.limit ?? 50;
		const offset = query.offset ?? 0;
		const whereClauses: Prisma.Sql[] = [];

		if (query.search) {
			const searchTerm = `%${query.search}%`;
			whereClauses.push(
				Prisma.sql`(
					c.name ILIKE ${searchTerm}
					OR c.company ILIKE ${searchTerm}
					OR c.email ILIKE ${searchTerm}
				)`,
			);
		}

		if (query.status) {
			whereClauses.push(
				Prisma.sql`c.billing_status = ${query.status}::billingstatus`,
			);
		}

		const whereSql = whereClauses.length
			? Prisma.sql`WHERE ${Prisma.join(whereClauses, ' AND ')}`
			: Prisma.empty;

		const totalRows = await this.prisma.$queryRaw<{ total: bigint | number }[]>`
			SELECT COUNT(*) AS total
			FROM clients c
			${whereSql}
		`;
		const totalRaw = totalRows[0]?.total ?? 0;
		const total = Number(totalRaw);

		const clients = await this.prisma.$queryRaw<DbClientListRow[]>`
			SELECT
				c.id,
				c.name,
				c.company,
				c.email,
				c.phone,
				c.billing_status,
				c.monthly_rate,
				c.currency,
				c.created_at,
				(SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS project_count,
				(SELECT COUNT(*) FROM invoices i WHERE i.client_id = c.id) AS invoice_count
			FROM clients c
			${whereSql}
			ORDER BY c.name
			OFFSET ${offset}
			LIMIT ${limit}
		`;

		const items = await Promise.all(
			clients.map(async client => {
				const projects = await this.prisma.$queryRaw<DbProjectSummary[]>`
					SELECT p.id, p.name, p.status, p.environment, p.wp_home
					FROM projects p
					WHERE p.client_id = ${client.id}
					ORDER BY p.name
				`;

				return {
					id: client.id,
					name: client.name,
					company: client.company,
					email: client.email,
					phone: client.phone,
					billing_status: client.billing_status,
					project_count: Number(client.project_count),
					invoice_count: Number(client.invoice_count),
					monthly_retainer: client.monthly_rate,
					currency: client.currency,
					projects: projects.map(project => ({
						id: project.id,
						project_name: project.name,
					})),
					created_at: client.created_at?.toISOString() ?? null,
				};
			}),
		);

		return {
			clients: items,
			total,
			limit,
			offset,
		};
	}

	async getClient(clientId: number) {
		const rows = await this.prisma.$queryRaw<DbClientDetails[]>`
			SELECT
				id,
				name,
				company,
				email,
				phone,
				billing_email,
				address,
				website,
				notes,
				billing_status,
				payment_terms,
				currency,
				tax_rate,
				auto_billing,
				contract_start,
				contract_end,
				invoice_prefix,
				created_at,
				updated_at,
				monthly_rate
			FROM clients
			WHERE id = ${clientId}
			LIMIT 1
		`;
		const client = rows[0];
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const projects = await this.prisma.$queryRaw<DbProjectSummary[]>`
			SELECT id, name, status, environment, wp_home
			FROM projects
			WHERE client_id = ${clientId}
			ORDER BY name
		`;

		const recentInvoices = await this.prisma.$queryRaw<DbInvoiceSummary[]>`
			SELECT id, invoice_number, status, total, amount_paid, issue_date, due_date
			FROM invoices
			WHERE client_id = ${clientId}
			ORDER BY issue_date DESC
			LIMIT 5
		`;

		return {
			id: client.id,
			name: client.name,
			company: client.company,
			email: client.email,
			phone: client.phone,
			billing_email: client.billing_email,
			address: client.address,
			website: client.website,
			notes: client.notes,
			billing_status: client.billing_status,
			payment_terms: Number.parseInt(client.payment_terms, 10),
			currency: client.currency,
			tax_rate: client.tax_rate,
			auto_billing: client.auto_billing,
			contract_start: client.contract_start?.toISOString() ?? null,
			contract_end: client.contract_end?.toISOString() ?? null,
			invoice_prefix: client.invoice_prefix,
			created_at: client.created_at?.toISOString() ?? null,
			updated_at: client.updated_at?.toISOString() ?? null,
			monthly_retainer: client.monthly_rate,
			projects: projects.map(project => ({
				id: project.id,
				project_name: project.name,
				status: project.status,
			})),
			recent_invoices: recentInvoices.map(invoice => ({
				id: invoice.id,
				invoice_number: invoice.invoice_number,
				status: invoice.status,
				total: invoice.total,
			})),
		};
	}

	async createClient(payload: ClientCreateDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const existing = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM clients
			WHERE email = ${payload.email}
			LIMIT 1
		`;
		if (existing[0]) {
			throw new BadRequestException({
				detail: 'Client with this email already exists',
			});
		}

		const inserted = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO clients (
				name,
				email,
				company,
				phone,
				billing_email,
				address,
				website,
				notes,
				billing_status,
				payment_terms,
				currency,
				tax_rate,
				auto_billing,
				invoice_prefix,
				next_invoice_number,
				updated_at,
				country,
				monthly_rate,
				total_revenue,
				outstanding_balance,
				owner_id
			)
			VALUES (
				${payload.name},
				${payload.email},
				${payload.company ?? null},
				${payload.phone ?? null},
				${payload.billing_email ?? payload.email},
				${payload.address ?? null},
				${payload.website ?? null},
				${payload.notes ?? null},
				${'active'}::billingstatus,
				${String(payload.payment_terms ?? 30)},
				${payload.currency ?? 'USD'},
				${payload.tax_rate ?? 0},
				${false},
				${'INV'},
				${1},
				NOW(),
				${'Unknown'},
				${0},
				${0},
				${0},
				${resolvedOwnerId}
			)
			RETURNING id
		`;

		return {
			status: 'success',
			message: 'Client created successfully',
			client_id: inserted[0]?.id ?? null,
		};
	}

	async updateClient(clientId: number, payload: ClientUpdateDto) {
		const rows = await this.prisma.$queryRaw<DbClientDetails[]>`
			SELECT
				id,
				name,
				company,
				email,
				phone,
				billing_email,
				address,
				website,
				notes,
				billing_status,
				payment_terms,
				currency,
				tax_rate,
				auto_billing,
				contract_start,
				contract_end,
				invoice_prefix,
				created_at,
				updated_at,
				monthly_rate
			FROM clients
			WHERE id = ${clientId}
			LIMIT 1
		`;
		const current = rows[0];
		if (!current) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		await this.prisma.$executeRaw`
			UPDATE clients
			SET
				name = ${payload.name ?? current.name},
				email = ${payload.email ?? current.email},
				company = ${payload.company ?? current.company},
				phone = ${payload.phone ?? current.phone},
				billing_email = ${payload.billing_email ?? current.billing_email},
				address = ${payload.address ?? current.address},
				website = ${payload.website ?? current.website},
				notes = ${payload.notes ?? current.notes},
				billing_status = ${payload.billing_status ?? current.billing_status}::billingstatus,
				payment_terms = ${String(payload.payment_terms ?? Number.parseInt(current.payment_terms, 10))},
				currency = ${payload.currency ?? current.currency},
				tax_rate = ${payload.tax_rate ?? current.tax_rate},
				contract_start = ${payload.contract_start ? new Date(payload.contract_start) : current.contract_start},
				contract_end = ${payload.contract_end ? new Date(payload.contract_end) : current.contract_end},
				monthly_rate = ${payload.monthly_rate ?? current.monthly_rate},
				updated_at = NOW()
			WHERE id = ${clientId}
		`;

		return {
			status: 'success',
			message: `Client ${payload.name ?? current.name} updated successfully`,
		};
	}

	async deleteClient(clientId: number) {
		const rows = await this.prisma.$queryRaw<{ id: number; name: string }[]>`
			SELECT id, name
			FROM clients
			WHERE id = ${clientId}
			LIMIT 1
		`;
		const client = rows[0];
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const projectCountRows = await this.prisma.$queryRaw<
			{ total: bigint | number }[]
		>`
			SELECT COUNT(*) AS total
			FROM projects
			WHERE client_id = ${clientId}
		`;
		const projectCount = Number(projectCountRows[0]?.total ?? 0);
		if (projectCount > 0) {
			throw new BadRequestException({
				detail: 'Cannot delete client with active projects',
			});
		}

		await this.prisma.$executeRaw`
			UPDATE clients
			SET billing_status = ${'inactive'}::billingstatus, updated_at = NOW()
			WHERE id = ${clientId}
		`;

		return {
			status: 'success',
			message: `Client ${client.name} deactivated`,
		};
	}

	async getClientProjects(clientId: number) {
		const clientRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM clients
			WHERE id = ${clientId}
			LIMIT 1
		`;
		const client = clientRows[0];
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const projects = await this.prisma.$queryRaw<DbProjectSummary[]>`
			SELECT id, name, slug, status, environment, wp_home
			FROM projects
			WHERE client_id = ${clientId}
			ORDER BY name
		`;

		return {
			client_id: clientId,
			client_name: client.name,
			projects: projects.map(project => ({
				id: project.id,
				name: project.name,
				slug: (project as unknown as { slug?: string }).slug,
				status: project.status,
				environment: project.environment,
				wp_home: project.wp_home,
			})),
		};
	}

	async getClientInvoices(clientId: number) {
		const clientRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM clients
			WHERE id = ${clientId}
			LIMIT 1
		`;
		const client = clientRows[0];
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const invoices = await this.prisma.$queryRaw<DbInvoiceSummary[]>`
			SELECT id, invoice_number, status, issue_date, due_date, total, amount_paid
			FROM invoices
			WHERE client_id = ${clientId}
			ORDER BY issue_date DESC
		`;

		const totalInvoiced = invoices.reduce(
			(sum, invoice) => sum + Number(invoice.total),
			0,
		);
		const totalPaid = invoices.reduce(
			(sum, invoice) => sum + Number(invoice.amount_paid),
			0,
		);

		return {
			client_id: clientId,
			client_name: client.name,
			invoices: invoices.map(invoice => ({
				id: invoice.id,
				invoice_number: invoice.invoice_number,
				status: invoice.status,
				issue_date: invoice.issue_date?.toISOString() ?? null,
				due_date: invoice.due_date?.toISOString() ?? null,
				total: Number(invoice.total),
				balance_due: Number(invoice.total) - Number(invoice.amount_paid),
			})),
			total_invoiced: totalInvoiced,
			total_paid: totalPaid,
		};
	}

	async assignProjectToClient(clientId: number, projectId: number) {
		const clientRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM clients
			WHERE id = ${clientId}
			LIMIT 1
		`;
		const client = clientRows[0];
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const projectRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM projects
			WHERE id = ${projectId}
			LIMIT 1
		`;
		const project = projectRows[0];
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		await this.prisma.$executeRaw`
			UPDATE projects
			SET client_id = ${clientId}, updated_at = NOW()
			WHERE id = ${projectId}
		`;

		return {
			status: 'success',
			message: `Project ${project.name} assigned to client ${client.name}`,
		};
	}

	async unassignProjectFromClient(clientId: number, projectId: number) {
		const projectRows = await this.prisma.$queryRaw<
			{ id: number; name: string }[]
		>`
			SELECT id, name
			FROM projects
			WHERE id = ${projectId} AND client_id = ${clientId}
			LIMIT 1
		`;
		const project = projectRows[0];
		if (!project) {
			throw new NotFoundException({
				detail: 'Project not found for this client',
			});
		}

		await this.prisma.$executeRaw`
			UPDATE projects
			SET client_id = NULL, updated_at = NOW()
			WHERE id = ${projectId}
		`;

		return {
			status: 'success',
			message: `Project ${project.name} unassigned from client`,
		};
	}
}
