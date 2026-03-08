import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { invoicestatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceCreateDto } from './dto/invoice-create.dto';
import { InvoiceUpdateDto } from './dto/invoice-update.dto';
import { PaymentRecordDto } from './dto/payment-record.dto';

type DbInvoiceRow = {
	id: number;
	invoice_number: string;
	client_id: number;
	status: string;
	issue_date: Date;
	due_date: Date;
	paid_date: Date | null;
	subtotal: number;
	tax_rate: number;
	tax_amount: number;
	discount_amount: number;
	total: number;
	amount_paid: number;
	payment_method: string | null;
	payment_reference: string | null;
	notes: string | null;
	terms: string | null;
	currency: string;
	created_at: Date;
};

type DbInvoiceItemRow = {
	id: number;
	description: string;
	quantity: number;
	unit_price: number;
	total: number;
	item_type: string | null;
	project_id: number | null;
	subscription_id: number | null;
	invoice_id: number;
};

@Injectable()
export class InvoicesService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly invoiceStatuses = new Set<invoicestatus>([
		'draft',
		'pending',
		'paid',
		'overdue',
		'cancelled',
		'refunded',
	]);

	private normalizeInvoiceSummary(row: DbInvoiceRow) {
		return {
			id: row.id,
			invoice_number: row.invoice_number,
			client_id: row.client_id,
			status: row.status,
			issue_date: row.issue_date?.toISOString().slice(0, 10) ?? null,
			due_date: row.due_date?.toISOString().slice(0, 10) ?? null,
			total: row.total,
			balance_due: Math.max(0, row.total - row.amount_paid),
			currency: row.currency,
		};
	}

	private normalizeInvoiceDetail(row: DbInvoiceRow, items: DbInvoiceItemRow[]) {
		return {
			id: row.id,
			invoice_number: row.invoice_number,
			client_id: row.client_id,
			status: row.status,
			issue_date: row.issue_date?.toISOString().slice(0, 10) ?? null,
			due_date: row.due_date?.toISOString().slice(0, 10) ?? null,
			paid_date: row.paid_date?.toISOString().slice(0, 10) ?? null,
			subtotal: row.subtotal,
			tax_rate: row.tax_rate,
			tax_amount: row.tax_amount,
			discount_amount: row.discount_amount,
			total: row.total,
			amount_paid: row.amount_paid,
			balance_due: Math.max(0, row.total - row.amount_paid),
			payment_method: row.payment_method,
			payment_reference: row.payment_reference,
			notes: row.notes,
			terms: row.terms,
			currency: row.currency,
			items: items.map(item => ({
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

	private parsePaymentTermsToDays(paymentTerms?: string | null): number {
		if (!paymentTerms) {
			return 30;
		}
		const match = paymentTerms.match(/(\d+)/);
		if (!match) {
			return 30;
		}
		const parsed = Number(match[1]);
		if (!Number.isFinite(parsed) || parsed < 0) {
			return 30;
		}
		return parsed;
	}

	private formatInvoiceNumber(issueDate: Date, invoiceId: number) {
		const prefix = `INV-${issueDate.getUTCFullYear()}${String(issueDate.getUTCMonth() + 1).padStart(2, '0')}-`;
		return `${prefix}${String(invoiceId).padStart(4, '0')}`;
	}

	private normalizeStatus(status?: string) {
		if (!status) {
			return null;
		}
		const normalized = status.trim().toLowerCase();
		if (!this.invoiceStatuses.has(normalized as invoicestatus)) {
			return 'invalid';
		}
		return normalized as invoicestatus;
	}

	private toSafeInvoiceFilename(invoiceNumber: string) {
		const normalized = invoiceNumber
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '_')
			.replace(/_+/g, '_')
			.replace(/^_+|_+$/g, '');

		return `${normalized || 'invoice'}.pdf`;
	}

	async listInvoices(query: {
		status?: string;
		client_id?: number;
		limit?: number;
		offset?: number;
	}) {
		const limit = Math.max(1, Math.min(100, query.limit ?? 50));
		const offset = Math.max(0, query.offset ?? 0);
		const status = this.normalizeStatus(query.status);

		if (status === 'invalid') {
			return {
				invoices: [],
				total: 0,
				limit,
				offset,
			};
		}

		const where = {
			...(status ? { status } : {}),
			...(query.client_id ? { client_id: query.client_id } : {}),
		};

		const [total, rows] = await Promise.all([
			this.prisma.invoices.count({ where }),
			this.prisma.invoices.findMany({
				where,
				orderBy: { created_at: 'desc' },
				skip: offset,
				take: limit,
			}),
		]);

		return {
			invoices: rows.map(row =>
				this.normalizeInvoiceSummary({
					...(row as DbInvoiceRow),
					status: row.status,
				}),
			),
			total,
			limit,
			offset,
		};
	}

	async getInvoice(invoiceId: number) {
		const invoice = await this.prisma.invoices.findUnique({
			where: { id: invoiceId },
			include: {
				invoice_items: {
					orderBy: { id: 'asc' },
				},
			},
		});
		if (!invoice) {
			throw new NotFoundException({ detail: 'Invoice not found' });
		}

		return this.normalizeInvoiceDetail(
			{
				...(invoice as DbInvoiceRow),
				status: invoice.status,
			},
			invoice.invoice_items as DbInvoiceItemRow[],
		);
	}

	async createInvoice(payload: InvoiceCreateDto) {
		const client = await this.prisma.clients.findUnique({
			where: { id: payload.client_id },
			select: { id: true, payment_terms: true },
		});
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const issueDate = payload.issue_date
			? new Date(payload.issue_date)
			: new Date();
		const paymentDays = this.parsePaymentTermsToDays(client.payment_terms);
		const dueDate = payload.due_date
			? new Date(payload.due_date)
			: new Date(issueDate.getTime() + paymentDays * 24 * 60 * 60 * 1000);

		const subtotal = payload.items.reduce(
			(total, item) => total + item.quantity * item.unit_price,
			0,
		);
		const taxRate = payload.tax_rate ?? 0;
		const taxAmount = subtotal * (taxRate / 100);
		const discountAmount = payload.discount_amount ?? 0;
		const total = Math.max(0, subtotal + taxAmount - discountAmount);

		const created = await this.prisma.$transaction(async tx => {
			const draft = await tx.invoices.create({
				data: {
					invoice_number: `TMP-${randomUUID()}`,
					status: 'draft',
					issue_date: issueDate,
					due_date: dueDate,
					subtotal,
					tax_rate: taxRate,
					tax_amount: taxAmount,
					discount_amount: discountAmount,
					total,
					amount_paid: 0,
					notes: payload.notes ?? null,
					terms: payload.terms ?? null,
					currency: (payload.currency ?? 'USD').toUpperCase(),
					client_id: payload.client_id,
					updated_at: new Date(),
				},
				select: { id: true },
			});

			const invoiceNumber = this.formatInvoiceNumber(issueDate, draft.id);

			await tx.invoices.update({
				where: { id: draft.id },
				data: {
					invoice_number: invoiceNumber,
					updated_at: new Date(),
				},
			});

			if (payload.items.length > 0) {
				await tx.invoice_items.createMany({
					data: payload.items.map(item => ({
						description: item.description,
						quantity: item.quantity,
						unit_price: item.unit_price,
						total: item.quantity * item.unit_price,
						item_type: item.item_type ?? null,
						project_id: item.project_id ?? null,
						subscription_id: item.subscription_id ?? null,
						invoice_id: draft.id,
					})),
				});
			}

			return {
				id: draft.id,
				invoiceNumber,
			};
		});

		return {
			status: 'success',
			message: 'Invoice created successfully',
			invoice_id: created.id,
			invoice_number: created.invoiceNumber,
			total,
		};
	}

	async updateInvoice(invoiceId: number, updates: InvoiceUpdateDto) {
		const invoice = await this.getInvoice(invoiceId);

		if (['paid', 'cancelled'].includes(invoice.status)) {
			throw new BadRequestException({
				detail: `Cannot update ${invoice.status} invoice`,
			});
		}

		const nextTaxRate = updates.tax_rate ?? invoice.tax_rate;
		const nextDiscount = updates.discount_amount ?? invoice.discount_amount;
		const nextTaxAmount = invoice.subtotal * (nextTaxRate / 100);
		const nextTotal = Math.max(
			0,
			invoice.subtotal + nextTaxAmount - nextDiscount,
		);

		await this.prisma.invoices.update({
			where: { id: invoiceId },
			data: {
				status: updates.status ?? undefined,
				due_date: updates.due_date ? new Date(updates.due_date) : undefined,
				tax_rate: nextTaxRate,
				tax_amount: nextTaxAmount,
				discount_amount: nextDiscount,
				total: nextTotal,
				notes: updates.notes ?? undefined,
				terms: updates.terms ?? undefined,
				updated_at: new Date(),
			},
		});

		return {
			status: 'success',
			message: `Invoice ${invoice.invoice_number} updated`,
		};
	}

	async deleteInvoice(invoiceId: number) {
		const invoice = await this.getInvoice(invoiceId);
		if (invoice.status !== 'draft') {
			throw new BadRequestException({
				detail: 'Only draft invoices can be deleted',
			});
		}

		await this.prisma.$transaction(async tx => {
			await tx.invoice_items.deleteMany({ where: { invoice_id: invoiceId } });
			await tx.invoices.delete({ where: { id: invoiceId } });
		});

		return {
			status: 'success',
			message: `Invoice ${invoice.invoice_number} deleted`,
		};
	}

	async sendInvoice(invoiceId: number) {
		const invoice = await this.getInvoice(invoiceId);
		if (invoice.status !== 'draft') {
			throw new BadRequestException({
				detail: 'Only draft invoices can be sent',
			});
		}
		if (!invoice.items.length) {
			throw new BadRequestException({
				detail: 'Cannot send invoice without line items',
			});
		}
		if (invoice.total <= 0) {
			throw new BadRequestException({
				detail: 'Cannot send invoice with zero total',
			});
		}

		await this.prisma.invoices.update({
			where: { id: invoiceId },
			data: {
				status: 'pending',
				updated_at: new Date(),
			},
		});

		return {
			status: 'success',
			message: `Invoice ${invoice.invoice_number} marked as sent (no external delivery dispatched)`,
			delivery_dispatched: false,
		};
	}

	async recordPayment(invoiceId: number, payment: PaymentRecordDto) {
		const invoice = await this.getInvoice(invoiceId);

		if (payment.amount <= 0) {
			throw new BadRequestException({
				detail: 'Payment amount must be greater than zero',
			});
		}

		if (invoice.status === 'draft') {
			throw new BadRequestException({
				detail: 'Cannot record payment on draft invoice',
			});
		}

		if (['cancelled', 'refunded', 'paid'].includes(invoice.status)) {
			throw new BadRequestException({
				detail: `Cannot record payment on ${invoice.status} invoice`,
			});
		}

		const balanceDue = Math.max(0, invoice.total - invoice.amount_paid);
		if (payment.amount - balanceDue > 1e-6) {
			throw new BadRequestException({
				detail: 'Payment amount exceeds invoice balance due',
			});
		}

		const nextAmountPaid = invoice.amount_paid + payment.amount;
		const isPaid = nextAmountPaid >= invoice.total;
		const nextStatus = isPaid
			? 'paid'
			: invoice.status === 'overdue'
				? 'overdue'
				: 'pending';
		const paidDate = isPaid ? new Date() : null;

		await this.prisma.invoices.update({
			where: { id: invoiceId },
			data: {
				amount_paid: nextAmountPaid,
				payment_method: payment.payment_method,
				payment_reference: payment.payment_reference ?? null,
				status: nextStatus as invoicestatus,
				paid_date: paidDate ?? undefined,
				updated_at: new Date(),
			},
		});

		return {
			status: 'success',
			message: `Payment of ${payment.amount} recorded`,
			balance_due: Math.max(0, invoice.total - nextAmountPaid),
			is_paid: isPaid,
		};
	}

	async getInvoicePdfMetadata(invoiceId: number) {
		const invoice = await this.getInvoice(invoiceId);
		const filename = this.toSafeInvoiceFilename(invoice.invoice_number);
		const issueDate = invoice.issue_date ?? 'N/A';
		const dueDate = invoice.due_date ?? 'N/A';
		const balanceDue = Math.max(0, invoice.total - invoice.amount_paid);
		const content = Buffer.from(
			[
				'%PDF-1.4',
				`% Invoice ${invoice.invoice_number}`,
				`% Status: ${invoice.status}`,
				`% Issue Date: ${issueDate}`,
				`% Due Date: ${dueDate}`,
				`% Total: ${invoice.total} ${invoice.currency}`,
				`% Paid: ${invoice.amount_paid} ${invoice.currency}`,
				`% Balance Due: ${balanceDue} ${invoice.currency}`,
			].join('\n') + '\n',
			'utf-8',
		);
		return {
			filename,
			content,
		};
	}

	async getInvoiceStats(periodDays = 30) {
		const normalizedPeriodDays = Math.max(1, Math.min(3650, periodDays));
		const periodStart = new Date(
			Date.now() - normalizedPeriodDays * 24 * 60 * 60 * 1000,
		);

		const invoices = await this.prisma.invoices.findMany({
			where: { created_at: { gte: periodStart } },
			select: {
				total: true,
				amount_paid: true,
				status: true,
				due_date: true,
			},
		});

		const now = new Date();
		const totalInvoiced = invoices.reduce((sum, row) => sum + row.total, 0);
		const totalPaid = invoices.reduce((sum, row) => sum + row.amount_paid, 0);
		const pendingInvoices = invoices.filter(row => row.status === 'pending');
		const totalPending = pendingInvoices.reduce(
			(sum, row) => sum + Math.max(0, row.total - row.amount_paid),
			0,
		);
		const totalOverdue = pendingInvoices
			.filter(row => row.due_date < now)
			.reduce((sum, row) => sum + Math.max(0, row.total - row.amount_paid), 0);
		const paidCount = invoices.filter(row => row.status === 'paid').length;
		const pendingCount = pendingInvoices.length;
		const invoiceCount = invoices.length;

		return {
			period_days: normalizedPeriodDays,
			total_invoiced: totalInvoiced,
			total_paid: totalPaid,
			total_pending: totalPending,
			total_overdue: totalOverdue,
			invoice_count: invoiceCount,
			paid_count: paidCount,
			pending_count: pendingCount,
		};
	}

	async markOverdueInvoices(limit = 100) {
		const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
		const rows = await this.prisma.$queryRaw<Array<{ id: number }>>`
			WITH due AS (
				SELECT i.id
				FROM invoices i
				WHERE i.status = ${'pending'}::invoicestatus
					AND i.due_date < CURRENT_DATE
				ORDER BY i.due_date ASC
				LIMIT ${safeLimit}
				FOR UPDATE SKIP LOCKED
			)
			UPDATE invoices i
			SET status = ${'overdue'}::invoicestatus,
				updated_at = NOW()
			FROM due
			WHERE i.id = due.id
			RETURNING i.id
		`;

		return {
			updated: rows.length,
		};
	}
}
