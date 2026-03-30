import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const INVOICE_INCLUDE = {
	include: {
		project: { select: { id: true, name: true } },
		client: { select: { id: true, name: true } },
		hosting_package: { select: { id: true, name: true } },
		support_package: { select: { id: true, name: true } },
	},
} as const;

export interface InvoiceFilters {
	client_id?: number;
	project_id?: number;
	status?: string;
	year?: number;
	page: number;
	limit: number;
}

@Injectable()
export class InvoicesRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findAll(filters: InvoiceFilters) {
		const where: Record<string, unknown> = {};

		if (filters.client_id) where.client_id = BigInt(filters.client_id);
		if (filters.project_id) where.project_id = BigInt(filters.project_id);
		if (filters.status) where.status = filters.status;
		if (filters.year) {
			const start = new Date(`${filters.year}-01-01T00:00:00Z`);
			const end = new Date(`${filters.year}-12-31T23:59:59Z`);
			where.period_start = { gte: start };
			where.period_end = { lte: end };
		}

		const [data, total] = await Promise.all([
			this.prisma.invoice.findMany({
				where,
				...INVOICE_INCLUDE,
				orderBy: { created_at: 'desc' },
				skip: (filters.page - 1) * filters.limit,
				take: filters.limit,
			}),
			this.prisma.invoice.count({ where }),
		]);

		return { data, total };
	}

	findById(id: number) {
		return this.prisma.invoice.findUnique({
			where: { id: BigInt(id) },
			...INVOICE_INCLUDE,
		});
	}

	async getNextInvoiceNumber(year: number): Promise<string> {
		const prefix = `INV-${year}-`;
		const lastInvoice = await this.prisma.invoice.findFirst({
			where: { invoice_number: { startsWith: prefix } },
			orderBy: { invoice_number: 'desc' },
		});

		let nextSeq = 1;
		if (lastInvoice) {
			const parts = lastInvoice.invoice_number.split('-');
			const seq = parseInt(parts[2] ?? '0', 10);
			nextSeq = seq + 1;
		}

		return `${prefix}${String(nextSeq).padStart(3, '0')}`;
	}

	async existsForProjectAndYear(
		projectId: number,
		year: number,
	): Promise<boolean> {
		const start = new Date(`${year}-01-01T00:00:00Z`);
		const end = new Date(`${year}-12-31T23:59:59Z`);
		const count = await this.prisma.invoice.count({
			where: {
				project_id: BigInt(projectId),
				period_start: { gte: start },
				period_end: { lte: end },
			},
		});
		return count > 0;
	}

	create(data: Parameters<typeof this.prisma.invoice.create>[0]['data']) {
		return this.prisma.invoice.create({ data, ...INVOICE_INCLUDE });
	}

	update(
		id: number,
		data: Parameters<typeof this.prisma.invoice.update>[0]['data'],
	) {
		return this.prisma.invoice.update({
			where: { id: BigInt(id) },
			data,
			...INVOICE_INCLUDE,
		});
	}

	remove(id: number) {
		return this.prisma.invoice.delete({ where: { id: BigInt(id) } });
	}
}
