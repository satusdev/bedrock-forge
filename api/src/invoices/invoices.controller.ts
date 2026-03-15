import {
	Body,
	Controller,
	Delete,
	Get,
	Headers,
	Param,
	ParseIntPipe,
	Post,
	Put,
	Query,
	Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { InvoiceCreateDto } from './dto/invoice-create.dto';
import { InvoiceUpdateDto } from './dto/invoice-update.dto';
import { PaymentRecordDto } from './dto/payment-record.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
	constructor(
		private readonly invoicesService: InvoicesService,
		private readonly authService: AuthService,
	) {}

	private resolveOwnerId(authorization?: string) {
		return this.authService.resolveOptionalUserIdFromAuthorizationHeader(
			authorization,
		);
	}

	@Get('stats/summary')
	async getInvoiceStats(
		@Query('period_days') periodDays?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.invoicesService.getInvoiceStats(
			periodDays ? Number(periodDays) : 30,
			ownerId,
		);
	}

	@Get()
	async listInvoices(
		@Query('status') status?: string,
		@Query('client_id') clientId?: string,
		@Query('limit') limit?: string,
		@Query('offset') offset?: string,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.invoicesService.listInvoices({
			status,
			client_id: clientId ? Number(clientId) : undefined,
			limit: limit ? Number(limit) : undefined,
			offset: offset ? Number(offset) : undefined,
			owner_id: ownerId,
		});
	}

	@Get(':invoiceId')
	async getInvoice(
		@Param('invoiceId', ParseIntPipe) invoiceId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.invoicesService.getInvoice(invoiceId, ownerId);
	}

	@Post()
	async createInvoice(
		@Body() payload: InvoiceCreateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.invoicesService.createInvoice(payload, ownerId);
	}

	@Put(':invoiceId')
	async updateInvoice(
		@Param('invoiceId', ParseIntPipe) invoiceId: number,
		@Body() payload: InvoiceUpdateDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.invoicesService.updateInvoice(invoiceId, payload, ownerId);
	}

	@Delete(':invoiceId')
	async deleteInvoice(
		@Param('invoiceId', ParseIntPipe) invoiceId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.invoicesService.deleteInvoice(invoiceId, ownerId);
	}

	@Post(':invoiceId/send')
	async sendInvoice(
		@Param('invoiceId', ParseIntPipe) invoiceId: number,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.invoicesService.sendInvoice(invoiceId, ownerId);
	}

	@Post(':invoiceId/payment')
	async recordPayment(
		@Param('invoiceId', ParseIntPipe) invoiceId: number,
		@Body() payload: PaymentRecordDto,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		return this.invoicesService.recordPayment(invoiceId, payload, ownerId);
	}

	@Get(':invoiceId/pdf')
	async downloadInvoicePdf(
		@Param('invoiceId', ParseIntPipe) invoiceId: number,
		@Res() res: Response,
		@Headers('authorization') authorization?: string,
	) {
		const ownerId = await this.resolveOwnerId(authorization);
		const pdf = await this.invoicesService.getInvoicePdfMetadata(
			invoiceId,
			ownerId,
		);
		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${pdf.filename}"`,
		);
		res.send(pdf.content);
	}
}
