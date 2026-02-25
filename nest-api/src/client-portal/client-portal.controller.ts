import {
	Body,
	Controller,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Post,
} from '@nestjs/common';
import { ClientPortalService } from './client-portal.service';

@Controller('client')
export class ClientPortalController {
	constructor(private readonly clientPortalService: ClientPortalService) {}

	@Get('projects')
	async getClientProjects(@Headers('authorization') authorization?: string) {
		return this.clientPortalService.getClientProjects(authorization);
	}

	@Get('invoices')
	async getClientInvoices(@Headers('authorization') authorization?: string) {
		return this.clientPortalService.getClientInvoices(authorization);
	}

	@Get('invoices/:invoiceId')
	async getClientInvoiceDetail(
		@Param('invoiceId', ParseIntPipe) invoiceId: number,
		@Headers('authorization') authorization?: string,
	) {
		return this.clientPortalService.getClientInvoiceDetail(
			invoiceId,
			authorization,
		);
	}

	@Get('tickets')
	async getClientTickets(@Headers('authorization') authorization?: string) {
		return this.clientPortalService.getClientTickets(authorization);
	}

	@Post('tickets')
	async createTicket(
		@Body()
		payload: {
			subject: string;
			message: string;
			project_id?: number;
			priority?: string;
		},
		@Headers('authorization') authorization?: string,
	) {
		return this.clientPortalService.createTicket(payload, authorization);
	}

	@Get('tickets/:ticketId')
	async getTicketDetail(
		@Param('ticketId', ParseIntPipe) ticketId: number,
		@Headers('authorization') authorization?: string,
	) {
		return this.clientPortalService.getTicketDetail(ticketId, authorization);
	}

	@Post('tickets/:ticketId/reply')
	async replyToTicket(
		@Param('ticketId', ParseIntPipe) ticketId: number,
		@Body() payload: { message: string },
		@Headers('authorization') authorization?: string,
	) {
		return this.clientPortalService.replyToTicket(
			ticketId,
			payload,
			authorization,
		);
	}

	@Get('subscriptions')
	async getClientSubscriptions(
		@Headers('authorization') authorization?: string,
	) {
		return this.clientPortalService.getClientSubscriptions(authorization);
	}

	@Get('backups')
	async getClientBackups(@Headers('authorization') authorization?: string) {
		return this.clientPortalService.getClientBackups(authorization);
	}
}
