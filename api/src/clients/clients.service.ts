import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { billingstatus, Prisma } from '@prisma/client';
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
	private readonly billingStatuses = new Set<billingstatus>([
		'active',
		'inactive',
		'trial',
		'overdue',
	]);

	constructor(private readonly prisma: PrismaService) {}

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private normalizeBillingStatus(
		status: string | undefined,
		fallback: billingstatus,
	) {
		if (!status) {
			return fallback;
		}
		const normalized = status.trim().toLowerCase();
		if (!this.billingStatuses.has(normalized as billingstatus)) {
			throw new BadRequestException({ detail: 'Invalid billing_status' });
		}
		return normalized as billingstatus;
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
		const where: Prisma.clientsWhereInput = {
			...(query.status ? { billing_status: query.status } : {}),
		};

		if (query.search) {
			where.OR = [
				{ name: { contains: query.search, mode: 'insensitive' } },
				{ company: { contains: query.search, mode: 'insensitive' } },
				{ email: { contains: query.search, mode: 'insensitive' } },
			];
		}

		const [total, clients] = await Promise.all([
			this.prisma.clients.count({ where }),
			this.prisma.clients.findMany({
				where,
				orderBy: { name: 'asc' },
				skip: offset,
				take: limit,
				select: {
					id: true,
					name: true,
					company: true,
					email: true,
					phone: true,
					billing_status: true,
					monthly_rate: true,
					currency: true,
					created_at: true,
					projects: {
						select: {
							id: true,
							name: true,
						},
						orderBy: { name: 'asc' },
					},
					_count: {
						select: {
							projects: true,
							invoices: true,
						},
					},
				},
			}),
		]);

		const items = clients.map(client => ({
			id: client.id,
			name: client.name,
			company: client.company,
			email: client.email,
			phone: client.phone,
			billing_status: client.billing_status,
			project_count: client._count.projects,
			invoice_count: client._count.invoices,
			monthly_retainer: client.monthly_rate,
			currency: client.currency,
			projects: client.projects.map(project => ({
				id: project.id,
				project_name: project.name,
			})),
			created_at: client.created_at?.toISOString() ?? null,
		}));

		return {
			clients: items,
			total,
			limit,
			offset,
		};
	}

	async getClient(clientId: number) {
		const client = await this.prisma.clients.findUnique({
			where: { id: clientId },
			select: {
				id: true,
				name: true,
				company: true,
				email: true,
				phone: true,
				billing_email: true,
				address: true,
				website: true,
				notes: true,
				billing_status: true,
				payment_terms: true,
				currency: true,
				tax_rate: true,
				auto_billing: true,
				contract_start: true,
				contract_end: true,
				invoice_prefix: true,
				created_at: true,
				updated_at: true,
				monthly_rate: true,
				projects: {
					select: {
						id: true,
						name: true,
						status: true,
						environment: true,
						wp_home: true,
					},
					orderBy: { name: 'asc' },
				},
				invoices: {
					select: {
						id: true,
						invoice_number: true,
						status: true,
						total: true,
						amount_paid: true,
						issue_date: true,
						due_date: true,
					},
					orderBy: { issue_date: 'desc' },
					take: 5,
				},
			},
		});
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

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
			projects: client.projects.map(project => ({
				id: project.id,
				project_name: project.name,
				status: project.status,
			})),
			recent_invoices: client.invoices.map(invoice => ({
				id: invoice.id,
				invoice_number: invoice.invoice_number,
				status: invoice.status,
				total: invoice.total,
			})),
		};
	}

	async createClient(payload: ClientCreateDto, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const existing = await this.prisma.clients.findFirst({
			where: { email: payload.email },
			select: { id: true },
		});
		if (existing) {
			throw new BadRequestException({
				detail: 'Client with this email already exists',
			});
		}

		const inserted = await this.prisma.clients.create({
			data: {
				name: payload.name,
				email: payload.email,
				company: payload.company ?? null,
				phone: payload.phone ?? null,
				billing_email: payload.billing_email ?? payload.email,
				address: payload.address ?? null,
				website: payload.website ?? null,
				notes: payload.notes ?? null,
				billing_status: 'active',
				payment_terms: String(payload.payment_terms ?? 30),
				currency: payload.currency ?? 'USD',
				tax_rate: payload.tax_rate ?? 0,
				auto_billing: false,
				invoice_prefix: 'INV',
				next_invoice_number: 1,
				updated_at: new Date(),
				country: 'Unknown',
				monthly_rate: 0,
				total_revenue: 0,
				outstanding_balance: 0,
				owner_id: resolvedOwnerId,
			},
			select: {
				id: true,
			},
		});

		return {
			status: 'success',
			message: 'Client created successfully',
			client_id: inserted.id,
		};
	}

	async updateClient(clientId: number, payload: ClientUpdateDto) {
		const current = await this.prisma.clients.findUnique({
			where: { id: clientId },
			select: {
				id: true,
				name: true,
				company: true,
				email: true,
				phone: true,
				billing_email: true,
				address: true,
				website: true,
				notes: true,
				billing_status: true,
				payment_terms: true,
				currency: true,
				tax_rate: true,
				auto_billing: true,
				contract_start: true,
				contract_end: true,
				invoice_prefix: true,
				created_at: true,
				updated_at: true,
				monthly_rate: true,
			},
		});
		if (!current) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		await this.prisma.clients.update({
			where: { id: clientId },
			data: {
				name: payload.name ?? current.name,
				email: payload.email ?? current.email,
				company: payload.company ?? current.company,
				phone: payload.phone ?? current.phone,
				billing_email: payload.billing_email ?? current.billing_email,
				address: payload.address ?? current.address,
				website: payload.website ?? current.website,
				notes: payload.notes ?? current.notes,
				billing_status: this.normalizeBillingStatus(
					payload.billing_status,
					current.billing_status,
				),
				payment_terms: String(
					payload.payment_terms ?? Number.parseInt(current.payment_terms, 10),
				),
				currency: payload.currency ?? current.currency,
				tax_rate: payload.tax_rate ?? current.tax_rate,
				contract_start: payload.contract_start
					? new Date(payload.contract_start)
					: current.contract_start,
				contract_end: payload.contract_end
					? new Date(payload.contract_end)
					: current.contract_end,
				monthly_rate: payload.monthly_rate ?? current.monthly_rate,
				updated_at: new Date(),
			},
		});

		return {
			status: 'success',
			message: `Client ${payload.name ?? current.name} updated successfully`,
		};
	}

	async deleteClient(clientId: number) {
		const client = await this.prisma.clients.findUnique({
			where: { id: clientId },
			select: {
				id: true,
				name: true,
				_count: {
					select: {
						projects: true,
					},
				},
			},
		});
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const projectCount = client._count.projects;
		if (projectCount > 0) {
			throw new BadRequestException({
				detail: 'Cannot delete client with active projects',
			});
		}

		await this.prisma.clients.update({
			where: { id: clientId },
			data: {
				billing_status: 'inactive',
				updated_at: new Date(),
			},
		});

		return {
			status: 'success',
			message: `Client ${client.name} deactivated`,
		};
	}

	async getClientProjects(clientId: number) {
		const client = await this.prisma.clients.findUnique({
			where: { id: clientId },
			select: { id: true, name: true },
		});
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const projects = await this.prisma.projects.findMany({
			where: { client_id: clientId },
			orderBy: { name: 'asc' },
			select: {
				id: true,
				name: true,
				slug: true,
				status: true,
				environment: true,
				wp_home: true,
			},
		});

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
		const client = await this.prisma.clients.findUnique({
			where: { id: clientId },
			select: { id: true, name: true },
		});
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const invoices = await this.prisma.invoices.findMany({
			where: { client_id: clientId },
			orderBy: { issue_date: 'desc' },
			select: {
				id: true,
				invoice_number: true,
				status: true,
				issue_date: true,
				due_date: true,
				total: true,
				amount_paid: true,
			},
		});

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
		const client = await this.prisma.clients.findUnique({
			where: { id: clientId },
			select: { id: true, name: true },
		});
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const project = await this.prisma.projects.findUnique({
			where: { id: projectId },
			select: { id: true, name: true },
		});
		if (!project) {
			throw new NotFoundException({ detail: 'Project not found' });
		}

		await this.prisma.projects.update({
			where: { id: projectId },
			data: {
				client_id: clientId,
				updated_at: new Date(),
			},
		});

		return {
			status: 'success',
			message: `Project ${project.name} assigned to client ${client.name}`,
		};
	}

	async unassignProjectFromClient(clientId: number, projectId: number) {
		const project = await this.prisma.projects.findFirst({
			where: {
				id: projectId,
				client_id: clientId,
			},
			select: {
				id: true,
				name: true,
			},
		});
		if (!project) {
			throw new NotFoundException({
				detail: 'Project not found for this client',
			});
		}

		await this.prisma.projects.update({
			where: { id: projectId },
			data: {
				client_id: null,
				updated_at: new Date(),
			},
		});

		return {
			status: 'success',
			message: `Project ${project.name} unassigned from client`,
		};
	}
}
