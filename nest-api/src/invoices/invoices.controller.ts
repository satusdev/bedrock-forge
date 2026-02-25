import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
	Post,
	Put,
	Query,
	Res,
} from '@nestjs/common';
import { Response } from 'express';
import { InvoiceCreateDto } from './dto/invoice-create.dto';
import { InvoiceUpdateDto } from './dto/invoice-update.dto';
import { PaymentRecordDto } from './dto/payment-record.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
	constructor(private readonly invoicesService: InvoicesService) {}

	@Get('stats/summary')
	async getInvoiceStats(@Query('period_days') periodDays?: string) {
		return this.invoicesService.getInvoiceStats(
			periodDays ? Number(periodDays) : 30,
		);
	}

	@Get()
	async listInvoices(
		@Query('status') status?: string,
		@Query('client_id') clientId?: string,
		@Query('limit') limit?: string,
		@Query('offset') offset?: string,
	) {
		return this.invoicesService.listInvoices({
			status,
			client_id: clientId ? Number(clientId) : undefined,
			limit: limit ? Number(limit) : undefined,
			offset: offset ? Number(offset) : undefined,
		});
	}

	@Get(':invoiceId')
	async getInvoice(@Param('invoiceId', ParseIntPipe) invoiceId: number) {
		return this.invoicesService.getInvoice(invoiceId);
	}

	@Post()
	async createInvoice(@Body() payload: InvoiceCreateDto) {
		return this.invoicesService.createInvoice(payload);
	}

	@Put(':invoiceId')
	async updateInvoice(
		@Param('invoiceId', ParseIntPipe) invoiceId: number,
		@Body() payload: InvoiceUpdateDto,
	) {
		return this.invoicesService.updateInvoice(invoiceId, payload);
	}

	@Delete(':invoiceId')
	async deleteInvoice(@Param('invoiceId', ParseIntPipe) invoiceId: number) {
		return this.invoicesService.deleteInvoice(invoiceId);
	}

	@Post(':invoiceId/send')
	async sendInvoice(@Param('invoiceId', ParseIntPipe) invoiceId: number) {
		return this.invoicesService.sendInvoice(invoiceId);
	}

	@Post(':invoiceId/payment')
	async recordPayment(
		@Param('invoiceId', ParseIntPipe) invoiceId: number,
		@Body() payload: PaymentRecordDto,
	) {
		return this.invoicesService.recordPayment(invoiceId, payload);
	}

	@Get(':invoiceId/pdf')
	async downloadInvoicePdf(
		@Param('invoiceId', ParseIntPipe) invoiceId: number,
		@Res() res: Response,
	) {
		const pdf = await this.invoicesService.getInvoicePdfMetadata(invoiceId);
		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${pdf.filename}"`,
		);
		res.send(pdf.content);
	}
}
