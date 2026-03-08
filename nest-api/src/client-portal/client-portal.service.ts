import {
	BadRequestException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from 'jsonwebtoken';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClientPortalService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly configService: ConfigService,
	) {}

	private get secretKey(): string {
		return (
			this.configService.get<string>('SECRET_KEY') ??
			this.configService.get<string>('JWT_SECRET') ??
			'dev-secret-key-not-for-production'
		);
	}

	private extractBearerToken(authorization?: string): string {
		if (!authorization?.startsWith('Bearer ')) {
			throw new UnauthorizedException({
				detail: 'Invalid authorization header',
			});
		}

		const token = authorization.replace('Bearer ', '').trim();
		if (!token) {
			throw new UnauthorizedException({
				detail: 'Invalid authorization header',
			});
		}

		return token;
	}

	private verifyClientToken(token: string):
		| (JwtPayload & {
				sub?: string;
				type?: 'client';
				client_id?: number;
				role?: string;
		  })
		| null {
		try {
			const payload = jwt.verify(token, this.secretKey, {
				algorithms: ['HS256'],
			}) as JwtPayload & {
				sub?: string;
				type?: 'client';
				client_id?: number;
				role?: string;
			};
			if (payload.type !== 'client') {
				return null;
			}
			return payload;
		} catch {
			return null;
		}
	}

	private async resolveClientContext(authorization?: string) {
		const token = this.extractBearerToken(authorization);
		const payload = this.verifyClientToken(token);

		if (!payload?.sub) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		const clientUser = await this.prisma.client_users.findUnique({
			where: { email: payload.sub },
			select: {
				id: true,
				client_id: true,
				email: true,
				full_name: true,
				is_active: true,
				role: true,
			},
		});

		if (!clientUser?.is_active) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		if (
			typeof payload.client_id === 'number' &&
			payload.client_id !== clientUser.client_id
		) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		return {
			clientId: clientUser.client_id,
			clientUserId: clientUser.id,
			role: clientUser.role,
			senderName: clientUser.full_name ?? clientUser.email,
		};
	}

	async getClientProjects(authorization?: string) {
		const { clientId } = await this.resolveClientContext(authorization);
		const rows = await this.prisma.projects.findMany({
			where: { client_id: clientId },
			orderBy: { updated_at: 'desc' },
			select: {
				id: true,
				name: true,
				status: true,
				environment: true,
				updated_at: true,
			},
		});

		return rows.map(project => ({
			id: project.id,
			name: project.name,
			status: project.status,
			environment: project.environment,
			updated_at: project.updated_at.toISOString(),
		}));
	}

	async getClientInvoices(authorization?: string) {
		const { clientId } = await this.resolveClientContext(authorization);
		const rows = await this.prisma.invoices.findMany({
			where: { client_id: clientId },
			orderBy: { created_at: 'desc' },
			select: {
				id: true,
				invoice_number: true,
				status: true,
				issue_date: true,
				due_date: true,
				total: true,
				amount_paid: true,
				currency: true,
			},
		});

		return rows.map(invoice => ({
			id: invoice.id,
			invoice_number: invoice.invoice_number,
			status: invoice.status,
			issue_date: invoice.issue_date.toISOString().slice(0, 10),
			due_date: invoice.due_date.toISOString().slice(0, 10),
			total: invoice.total,
			amount_paid: invoice.amount_paid,
			balance_due: Math.max(0, invoice.total - invoice.amount_paid),
			currency: invoice.currency,
		}));
	}

	async getClientInvoiceDetail(invoiceId: number, authorization?: string) {
		const { clientId } = await this.resolveClientContext(authorization);
		if (!Number.isInteger(invoiceId) || invoiceId < 1) {
			throw new NotFoundException({ detail: 'Invoice not found' });
		}

		const invoice = await this.prisma.invoices.findFirst({
			where: {
				id: invoiceId,
				client_id: clientId,
			},
			include: {
				invoice_items: {
					orderBy: { id: 'asc' },
				},
			},
		});

		if (!invoice) {
			throw new NotFoundException({ detail: 'Invoice not found' });
		}

		return {
			id: invoice.id,
			invoice_number: invoice.invoice_number,
			status: invoice.status,
			issue_date: invoice.issue_date.toISOString().slice(0, 10),
			due_date: invoice.due_date.toISOString().slice(0, 10),
			paid_date: invoice.paid_date
				? invoice.paid_date.toISOString().slice(0, 10)
				: null,
			subtotal: invoice.subtotal,
			tax_rate: invoice.tax_rate,
			tax_amount: invoice.tax_amount,
			discount_amount: invoice.discount_amount,
			total: invoice.total,
			amount_paid: invoice.amount_paid,
			balance_due: Math.max(0, invoice.total - invoice.amount_paid),
			currency: invoice.currency,
			notes: invoice.notes,
			terms: invoice.terms,
			items: invoice.invoice_items.map(item => ({
				id: item.id,
				description: item.description,
				quantity: item.quantity,
				unit_price: item.unit_price,
				total: item.total,
				item_type: item.item_type,
				project_id: item.project_id,
				subscription_id: item.subscription_id,
			})),
		};
	}

	async getClientTickets(authorization?: string) {
		const { clientId } = await this.resolveClientContext(authorization);
		const rows = await this.prisma.tickets.findMany({
			where: { client_id: clientId },
			orderBy: { updated_at: 'desc' },
			select: {
				id: true,
				subject: true,
				status: true,
				priority: true,
				created_at: true,
				last_reply_at: true,
			},
		});

		return rows.map(ticket => ({
			id: ticket.id,
			subject: ticket.subject,
			status: ticket.status,
			priority: ticket.priority,
			created_at: ticket.created_at.toISOString(),
			last_reply_at: ticket.last_reply_at?.toISOString() ?? null,
		}));
	}

	async createTicket(
		payload: {
			subject: string;
			message: string;
			project_id?: number;
			priority?: string;
		},
		authorization?: string,
	) {
		const context = await this.resolveClientContext(authorization);
		if (!payload.subject?.trim() || !payload.message?.trim()) {
			throw new BadRequestException({
				detail: 'subject and message are required',
			});
		}

		const normalizedPriority = (payload.priority ?? 'medium')
			.trim()
			.toLowerCase();
		if (!['low', 'medium', 'high', 'urgent'].includes(normalizedPriority)) {
			throw new BadRequestException({ detail: 'Invalid ticket priority' });
		}

		if (payload.project_id) {
			const project = await this.prisma.projects.findFirst({
				where: {
					id: payload.project_id,
					client_id: context.clientId,
				},
				select: { id: true },
			});
			if (!project) {
				throw new NotFoundException({ detail: 'Project not found' });
			}
		}

		const now = new Date();
		const ticket = await this.prisma.tickets.create({
			data: {
				client_id: context.clientId,
				project_id: payload.project_id ?? null,
				subject: payload.subject.trim(),
				status: 'open',
				priority: normalizedPriority as 'low' | 'medium' | 'high' | 'urgent',
				last_reply_at: now,
				created_at: now,
				updated_at: now,
			},
			select: {
				id: true,
				subject: true,
				status: true,
				priority: true,
				created_at: true,
				last_reply_at: true,
			},
		});

		await this.prisma.ticket_messages.create({
			data: {
				ticket_id: ticket.id,
				sender_type: 'client',
				sender_id: context.clientUserId,
				sender_name: context.senderName,
				message: payload.message.trim(),
				attachments: null,
				created_at: now,
				updated_at: now,
			},
		});

		return {
			id: ticket.id,
			subject: ticket.subject,
			status: ticket.status,
			priority: ticket.priority,
			created_at: ticket.created_at.toISOString(),
			last_reply_at: ticket.last_reply_at?.toISOString() ?? null,
		};
	}

	async getTicketDetail(ticketId: number, authorization?: string) {
		const { clientId } = await this.resolveClientContext(authorization);
		const ticket = await this.prisma.tickets.findFirst({
			where: {
				id: ticketId,
				client_id: clientId,
			},
			include: {
				ticket_messages: {
					orderBy: {
						created_at: 'asc',
					},
				},
			},
		});

		if (!ticket) {
			throw new NotFoundException({ detail: 'Ticket not found' });
		}

		return {
			id: ticket.id,
			subject: ticket.subject,
			status: ticket.status,
			priority: ticket.priority,
			project_id: ticket.project_id,
			created_at: ticket.created_at.toISOString(),
			messages: ticket.ticket_messages.map(message => ({
				id: message.id,
				sender_type: message.sender_type,
				sender_name: message.sender_name,
				message: message.message,
				created_at: message.created_at.toISOString(),
			})),
		};
	}

	async replyToTicket(
		ticketId: number,
		payload: { message: string },
		authorization?: string,
	) {
		const context = await this.resolveClientContext(authorization);
		if (!payload.message?.trim()) {
			throw new BadRequestException({ detail: 'message is required' });
		}

		const ticket = await this.prisma.tickets.findFirst({
			where: {
				id: ticketId,
				client_id: context.clientId,
			},
			select: {
				id: true,
				status: true,
			},
		});

		if (!ticket) {
			throw new NotFoundException({ detail: 'Ticket not found' });
		}
		if (ticket.status === 'closed') {
			throw new BadRequestException({
				detail: 'Cannot reply to a closed ticket',
			});
		}

		const now = new Date();
		await this.prisma.$transaction([
			this.prisma.ticket_messages.create({
				data: {
					ticket_id: ticket.id,
					sender_type: 'client',
					sender_id: context.clientUserId,
					sender_name: context.senderName,
					message: payload.message.trim(),
					attachments: null,
					created_at: now,
					updated_at: now,
				},
			}),
			this.prisma.tickets.update({
				where: { id: ticket.id },
				data: {
					last_reply_at: now,
					status: 'waiting_reply',
					updated_at: now,
				},
			}),
		]);

		return { message: 'Reply added successfully' };
	}

	async getClientSubscriptions(authorization?: string) {
		const { clientId } = await this.resolveClientContext(authorization);
		const rows = await this.prisma.subscriptions.findMany({
			where: { client_id: clientId },
			orderBy: { next_billing_date: 'asc' },
			select: {
				id: true,
				name: true,
				status: true,
				subscription_type: true,
				billing_cycle: true,
				amount: true,
				currency: true,
				next_billing_date: true,
				auto_renew: true,
			},
		});

		return rows.map(subscription => ({
			id: subscription.id,
			name: subscription.name,
			status: subscription.status,
			subscription_type: subscription.subscription_type,
			billing_cycle: subscription.billing_cycle,
			amount: subscription.amount,
			currency: subscription.currency,
			next_billing_date: subscription.next_billing_date
				.toISOString()
				.slice(0, 10),
			auto_renew: subscription.auto_renew,
		}));
	}

	async getClientBackups(authorization?: string) {
		const { clientId } = await this.resolveClientContext(authorization);
		const rows = await this.prisma.backups.findMany({
			where: {
				projects: {
					is: {
						client_id: clientId,
					},
				},
			},
			orderBy: { created_at: 'desc' },
			take: 100,
			select: {
				id: true,
				status: true,
				backup_type: true,
				storage_type: true,
				created_at: true,
				projects: {
					select: {
						name: true,
					},
				},
			},
		});

		return rows.map(backup => ({
			id: backup.id,
			status: backup.status,
			backup_type: backup.backup_type,
			storage_type: backup.storage_type,
			project_name: backup.projects.name,
			created_at: backup.created_at.toISOString(),
		}));
	}
}
