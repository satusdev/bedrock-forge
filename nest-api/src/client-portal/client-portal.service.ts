import {
	BadRequestException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

@Injectable()
export class ClientPortalService {
	private readonly ticketsByClient = new Map<
		number,
		Array<{
			id: number;
			subject: string;
			status: string;
			priority: string;
			project_id: number | null;
			created_at: string;
			last_reply_at: string | null;
			messages: Array<{
				id: number;
				sender_type: string;
				sender_name: string;
				message: string;
				created_at: string;
			}>;
		}>
	>();

	private resolveClientId(authorization?: string) {
		if (!authorization) {
			return 1;
		}
		if (!authorization.startsWith('Bearer ')) {
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

		const numericToken = Number(token);
		if (Number.isInteger(numericToken) && numericToken > 0) {
			return numericToken;
		}

		const tokenParts = token.split('-');
		const maybeId = Number(tokenParts[tokenParts.length - 1]);
		if (Number.isInteger(maybeId) && maybeId > 0) {
			return maybeId;
		}

		return 1;
	}

	async getClientProjects(authorization?: string) {
		this.resolveClientId(authorization);
		return [];
	}

	async getClientInvoices(authorization?: string) {
		this.resolveClientId(authorization);
		return [];
	}

	async getClientInvoiceDetail(invoiceId: number, authorization?: string) {
		this.resolveClientId(authorization);
		if (invoiceId < 1) {
			throw new NotFoundException({ detail: 'Invoice not found' });
		}

		return {
			id: invoiceId,
			invoice_number: `INV-${invoiceId}`,
			status: 'draft',
			issue_date: new Date().toISOString(),
			due_date: new Date().toISOString(),
			paid_date: null,
			subtotal: 0,
			tax_rate: 0,
			tax_amount: 0,
			discount_amount: 0,
			total: 0,
			amount_paid: 0,
			currency: 'USD',
			notes: null,
			terms: null,
			items: [],
		};
	}

	async getClientTickets(authorization?: string) {
		const clientId = this.resolveClientId(authorization);
		const tickets = this.ticketsByClient.get(clientId) ?? [];
		return tickets.map(ticket => ({
			id: ticket.id,
			subject: ticket.subject,
			status: ticket.status,
			priority: ticket.priority,
			created_at: ticket.created_at,
			last_reply_at: ticket.last_reply_at,
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
		const clientId = this.resolveClientId(authorization);
		if (!payload.subject?.trim() || !payload.message?.trim()) {
			throw new BadRequestException({
				detail: 'subject and message are required',
			});
		}

		const now = new Date().toISOString();
		const ticket = {
			id: Date.now(),
			subject: payload.subject.trim(),
			status: 'open',
			priority: payload.priority ?? 'medium',
			project_id: payload.project_id ?? null,
			created_at: now,
			last_reply_at: null,
			messages: [
				{
					id: Number(randomUUID().replace(/-/g, '').slice(0, 8)),
					sender_type: 'client',
					sender_name: 'Client',
					message: payload.message,
					created_at: now,
				},
			],
		};
		const existing = this.ticketsByClient.get(clientId) ?? [];
		existing.unshift(ticket);
		this.ticketsByClient.set(clientId, existing);

		return {
			id: ticket.id,
			subject: ticket.subject,
			status: ticket.status,
			priority: ticket.priority,
			created_at: ticket.created_at,
			last_reply_at: ticket.last_reply_at,
		};
	}

	async getTicketDetail(ticketId: number, authorization?: string) {
		const clientId = this.resolveClientId(authorization);
		const tickets = this.ticketsByClient.get(clientId) ?? [];
		const ticket = tickets.find(entry => entry.id === ticketId);
		if (!ticket) {
			throw new NotFoundException({ detail: 'Ticket not found' });
		}

		return {
			id: ticket.id,
			subject: ticket.subject,
			status: ticket.status,
			priority: ticket.priority,
			project_id: ticket.project_id,
			created_at: ticket.created_at,
			messages: ticket.messages,
		};
	}

	async replyToTicket(
		ticketId: number,
		payload: { message: string },
		authorization?: string,
	) {
		const clientId = this.resolveClientId(authorization);
		const tickets = this.ticketsByClient.get(clientId) ?? [];
		const ticket = tickets.find(entry => entry.id === ticketId);
		if (!ticket) {
			throw new NotFoundException({ detail: 'Ticket not found' });
		}
		if (ticket.status === 'closed') {
			throw new BadRequestException({
				detail: 'Cannot reply to a closed ticket',
			});
		}

		const now = new Date().toISOString();
		ticket.messages.push({
			id: Number(randomUUID().replace(/-/g, '').slice(0, 8)),
			sender_type: 'client',
			sender_name: 'Client',
			message: payload.message,
			created_at: now,
		});
		ticket.last_reply_at = now;

		return { message: 'Reply added successfully' };
	}

	async getClientSubscriptions(authorization?: string) {
		this.resolveClientId(authorization);
		return [];
	}

	async getClientBackups(authorization?: string) {
		this.resolveClientId(authorization);
		return [];
	}
}
