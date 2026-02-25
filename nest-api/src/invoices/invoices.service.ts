import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
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
	invoice_id: number;
};

@Injectable()
export class InvoicesService {
	constructor(private readonly prisma: PrismaService) {}

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

	private startOfMonthUtc() {
		const now = new Date();
		return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	}

	private async generateInvoiceNumber() {
		const now = new Date();
		const prefix = `INV-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}-`;
		const monthStart = this.startOfMonthUtc();

		const countRows = await this.prisma.$queryRaw<{ count: bigint }[]>`
			SELECT COUNT(*)::bigint AS count
			FROM invoices
			WHERE created_at >= ${monthStart}
		`;
		const count = Number(countRows[0]?.count ?? 0);
		return `${prefix}${String(count + 1).padStart(4, '0')}`;
	}

	async listInvoices(query: {
		status?: string;
		client_id?: number;
		limit?: number;
		offset?: number;
	}) {
		const limit = Math.max(1, Math.min(100, query.limit ?? 50));
		const offset = Math.max(0, query.offset ?? 0);

		const countRows = await this.prisma.$queryRaw<{ total: bigint }[]>`
			SELECT COUNT(*)::bigint AS total
			FROM invoices i
			WHERE
				(${query.status ?? null}::text IS NULL OR i.status::text = ${query.status ?? null})
				AND (${query.client_id ?? null}::int IS NULL OR i.client_id = ${query.client_id ?? null})
		`;

		const rows = await this.prisma.$queryRaw<DbInvoiceRow[]>`
			SELECT
				i.id,
				i.invoice_number,
				i.client_id,
				i.status::text AS status,
				i.issue_date,
				i.due_date,
				i.paid_date,
				i.subtotal,
				i.tax_rate,
				i.tax_amount,
				i.discount_amount,
				i.total,
				i.amount_paid,
				i.payment_method,
				i.payment_reference,
				i.notes,
				i.terms,
				i.currency,
				i.created_at
			FROM invoices i
			WHERE
				(${query.status ?? null}::text IS NULL OR i.status::text = ${query.status ?? null})
				AND (${query.client_id ?? null}::int IS NULL OR i.client_id = ${query.client_id ?? null})
			ORDER BY i.created_at DESC
			OFFSET ${offset}
			LIMIT ${limit}
		`;

		return {
			invoices: rows.map(row => this.normalizeInvoiceSummary(row)),
			total: Number(countRows[0]?.total ?? 0),
			limit,
			offset,
		};
	}

	async getInvoice(invoiceId: number) {
		const rows = await this.prisma.$queryRaw<DbInvoiceRow[]>`
			SELECT
				i.id,
				i.invoice_number,
				i.client_id,
				i.status::text AS status,
				i.issue_date,
				i.due_date,
				i.paid_date,
				i.subtotal,
				i.tax_rate,
				i.tax_amount,
				i.discount_amount,
				i.total,
				i.amount_paid,
				i.payment_method,
				i.payment_reference,
				i.notes,
				i.terms,
				i.currency,
				i.created_at
			FROM invoices i
			WHERE i.id = ${invoiceId}
			LIMIT 1
		`;

		const invoice = rows[0];
		if (!invoice) {
			throw new NotFoundException({ detail: 'Invoice not found' });
		}

		const itemRows = await this.prisma.$queryRaw<DbInvoiceItemRow[]>`
			SELECT
				ii.id,
				ii.description,
				ii.quantity,
				ii.unit_price,
				ii.total,
				ii.item_type,
				ii.project_id,
				ii.invoice_id
			FROM invoice_items ii
			WHERE ii.invoice_id = ${invoiceId}
			ORDER BY ii.id ASC
		`;

		return this.normalizeInvoiceDetail(invoice, itemRows);
	}

	async createInvoice(payload: InvoiceCreateDto) {
		const clientRows = await this.prisma.$queryRaw<
			{ id: number; payment_terms: string | null }[]
		>`
			SELECT id, payment_terms
			FROM clients
			WHERE id = ${payload.client_id}
			LIMIT 1
		`;
		const client = clientRows[0];
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const invoiceNumber = await this.generateInvoiceNumber();
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

		const insertedRows = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO invoices (
				invoice_number,
				status,
				issue_date,
				due_date,
				subtotal,
				tax_rate,
				tax_amount,
				discount_amount,
				total,
				amount_paid,
				notes,
				terms,
				currency,
				client_id,
				updated_at
			)
			VALUES (
				${invoiceNumber},
				${'draft'}::invoicestatus,
				${issueDate},
				${dueDate},
				${subtotal},
				${taxRate},
				${taxAmount},
				${discountAmount},
				${total},
				${0},
				${payload.notes ?? null},
				${payload.terms ?? null},
				${(payload.currency ?? 'USD').toUpperCase()},
				${payload.client_id},
				NOW()
			)
			RETURNING id
		`;

		const created = insertedRows[0];
		if (!created) {
			throw new BadRequestException({ detail: 'Failed to create invoice' });
		}

		for (const item of payload.items) {
			const itemTotal = item.quantity * item.unit_price;
			await this.prisma.$executeRaw`
				INSERT INTO invoice_items (
					description,
					quantity,
					unit_price,
					total,
					item_type,
					project_id,
					invoice_id
				)
				VALUES (
					${item.description},
					${item.quantity},
					${item.unit_price},
					${itemTotal},
					${item.item_type ?? null},
					${item.project_id ?? null},
					${created.id}
				)
			`;
		}

		return {
			status: 'success',
			message: 'Invoice created successfully',
			invoice_id: created.id,
			invoice_number: invoiceNumber,
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

		await this.prisma.$executeRaw`
			UPDATE invoices
			SET
				status = COALESCE(${updates.status ?? null}::invoicestatus, status),
				due_date = COALESCE(${updates.due_date ? new Date(updates.due_date) : null}, due_date),
				tax_rate = ${nextTaxRate},
				tax_amount = ${nextTaxAmount},
				discount_amount = ${nextDiscount},
				total = ${nextTotal},
				notes = COALESCE(${updates.notes ?? null}, notes),
				terms = COALESCE(${updates.terms ?? null}, terms),
				updated_at = NOW()
			WHERE id = ${invoiceId}
		`;

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

		await this.prisma.$executeRaw`
			DELETE FROM invoices
			WHERE id = ${invoiceId}
		`;

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

		await this.prisma.$executeRaw`
			UPDATE invoices
			SET status = ${'pending'}::invoicestatus, updated_at = NOW()
			WHERE id = ${invoiceId}
		`;

		return {
			status: 'success',
			message: `Invoice ${invoice.invoice_number} marked as sent`,
		};
	}

	async recordPayment(invoiceId: number, payment: PaymentRecordDto) {
		const invoice = await this.getInvoice(invoiceId);
		if (['cancelled', 'refunded'].includes(invoice.status)) {
			throw new BadRequestException({
				detail: `Cannot record payment on ${invoice.status} invoice`,
			});
		}

		const nextAmountPaid = invoice.amount_paid + payment.amount;
		const isPaid = nextAmountPaid >= invoice.total;
		const nextStatus = isPaid ? 'paid' : invoice.status;
		const paidDate = isPaid ? new Date() : null;

		await this.prisma.$executeRaw`
			UPDATE invoices
			SET
				amount_paid = ${nextAmountPaid},
				payment_method = ${payment.payment_method},
				payment_reference = ${payment.payment_reference ?? null},
				status = ${nextStatus}::invoicestatus,
				paid_date = COALESCE(${paidDate}, paid_date),
				updated_at = NOW()
			WHERE id = ${invoiceId}
		`;

		return {
			status: 'success',
			message: `Payment of ${payment.amount} recorded`,
			balance_due: Math.max(0, invoice.total - nextAmountPaid),
			is_paid: isPaid,
		};
	}

	async getInvoicePdfMetadata(invoiceId: number) {
		const invoice = await this.getInvoice(invoiceId);
		const filename = `invoice_${invoice.invoice_number}.pdf`;
		const content = Buffer.from(
			`%PDF-1.4\n% Simulated invoice PDF for ${invoice.invoice_number}\n`,
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

		const rows = await this.prisma.$queryRaw<
			{
				total_invoiced: number;
				total_paid: number;
				total_pending: number;
				total_overdue: number;
				invoice_count: bigint;
				paid_count: bigint;
				pending_count: bigint;
			}[]
		>`
			SELECT
				COALESCE(SUM(i.total), 0)::float8 AS total_invoiced,
				COALESCE(SUM(i.amount_paid), 0)::float8 AS total_paid,
				COALESCE(SUM(CASE WHEN i.status = 'pending'::invoicestatus THEN (i.total - i.amount_paid) ELSE 0 END), 0)::float8 AS total_pending,
				COALESCE(SUM(CASE WHEN i.status = 'pending'::invoicestatus AND i.due_date < CURRENT_DATE THEN (i.total - i.amount_paid) ELSE 0 END), 0)::float8 AS total_overdue,
				COUNT(*)::bigint AS invoice_count,
				SUM(CASE WHEN i.status = 'paid'::invoicestatus THEN 1 ELSE 0 END)::bigint AS paid_count,
				SUM(CASE WHEN i.status = 'pending'::invoicestatus THEN 1 ELSE 0 END)::bigint AS pending_count
			FROM invoices i
			WHERE i.created_at >= ${periodStart}
		`;

		const stats = rows[0];
		return {
			period_days: normalizedPeriodDays,
			total_invoiced: stats?.total_invoiced ?? 0,
			total_paid: stats?.total_paid ?? 0,
			total_pending: stats?.total_pending ?? 0,
			total_overdue: stats?.total_overdue ?? 0,
			invoice_count: Number(stats?.invoice_count ?? 0),
			paid_count: Number(stats?.paid_count ?? 0),
			pending_count: Number(stats?.pending_count ?? 0),
		};
	}
}
