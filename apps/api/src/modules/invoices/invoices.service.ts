import {
	Injectable,
	NotFoundException,
	ConflictException,
	BadRequestException,
} from '@nestjs/common';
import { InvoicesRepository } from './invoices.repository';
import { NotificationsService } from '../notifications/notifications.service';
import {
	GenerateInvoiceDto,
	GenerateBulkInvoiceDto,
	GenerateClientInvoiceDto,
	UpdateInvoiceDto,
	QueryInvoicesDto,
} from './dto/invoice.dto';

@Injectable()
export class InvoicesService {
	constructor(
		private readonly repo: InvoicesRepository,
		private readonly notifications: NotificationsService,
	) {}

	async findAll(filters: QueryInvoicesDto) {
		const { data, total } = await this.repo.findAll({
			client_id: filters.client_id,
			project_id: filters.project_id,
			status: filters.status,
			year: filters.year,
			page: filters.page ?? 1,
			limit: filters.limit ?? 20,
		});

		const page = filters.page ?? 1;
		const limit = filters.limit ?? 20;

		return {
			data: data.map(this.serialise),
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit),
		};
	}

	async findById(id: number) {
		const inv = await this.repo.findById(id);
		if (!inv) throw new NotFoundException(`Invoice #${id} not found`);
		return this.serialise(inv);
	}

	async generate(dto: GenerateInvoiceDto) {
		const project = await this.repo.findProjectWithPackages(dto.projectId);

		if (!project)
			throw new NotFoundException(`Project #${dto.projectId} not found`);

		if (!project.hosting_package && !project.support_package) {
			throw new BadRequestException(
				'Project has no hosting or support package assigned — cannot generate invoice',
			);
		}

		const alreadyExists = await this.repo.existsForProjectAndYear(
			dto.projectId,
			dto.year,
		);
		if (alreadyExists) {
			throw new ConflictException(
				`Invoice for project #${dto.projectId} year ${dto.year} already exists`,
			);
		}

		const hostingAmount = project.hosting_package
			? Number(project.hosting_package.price_monthly) * 12
			: 0;
		const supportAmount = project.support_package
			? Number(project.support_package.price_monthly) * 12
			: 0;
		const totalAmount = hostingAmount + supportAmount;

		const periodStart = new Date(`${dto.year}-01-01T00:00:00Z`);
		const periodEnd = new Date(`${dto.year}-12-31T23:59:59Z`);
		const dueDate = new Date(`${dto.year}-01-31T23:59:59Z`);

		const inv = await this.repo.createSerialized(
			{
				project_id: BigInt(dto.projectId),
				client_id: project.client_id,
				hosting_package_id: project.hosting_package_id ?? undefined,
				support_package_id: project.support_package_id ?? undefined,
				hosting_package_snapshot: project.hosting_package?.name ?? null,
				support_package_snapshot: project.support_package?.name ?? null,
				hosting_amount: hostingAmount,
				support_amount: supportAmount,
				total_amount: totalAmount,
				period_start: periodStart,
				period_end: periodEnd,
				due_date: dueDate,
				status: 'draft',
			},
			dto.year,
		);

		this.notifications.dispatch('invoice.created', {
			invoiceNumber: inv.invoice_number,
			projectName: project.name,
			clientName: project.client.name,
			totalAmount,
			year: dto.year,
		});

		return this.serialise(inv);
	}

	async generateBulk(dto: GenerateBulkInvoiceDto) {
		const projects = await this.repo.findActiveProjectsWithPackages();

		const results: {
			projectId: number;
			invoiceNumber?: string;
			skipped?: string;
		}[] = [];

		for (const project of projects) {
			const alreadyExists = await this.repo.existsForProjectAndYear(
				Number(project.id),
				dto.year,
			);
			if (alreadyExists) {
				results.push({
					projectId: Number(project.id),
					skipped: 'already_exists',
				});
				continue;
			}

			const hostingAmount = project.hosting_package
				? Number(project.hosting_package.price_monthly) * 12
				: 0;
			const supportAmount = project.support_package
				? Number(project.support_package.price_monthly) * 12
				: 0;
			const totalAmount = hostingAmount + supportAmount;

			const periodStart = new Date(`${dto.year}-01-01T00:00:00Z`);
			const periodEnd = new Date(`${dto.year}-12-31T23:59:59Z`);
			const dueDate = new Date(`${dto.year}-01-31T23:59:59Z`);

			const inv = await this.repo.createSerialized(
				{
					project_id: project.id,
					client_id: project.client_id,
					hosting_package_id: project.hosting_package_id ?? undefined,
					support_package_id: project.support_package_id ?? undefined,
					hosting_package_snapshot: project.hosting_package?.name ?? null,
					support_package_snapshot: project.support_package?.name ?? null,
					hosting_amount: hostingAmount,
					support_amount: supportAmount,
					total_amount: totalAmount,
					period_start: periodStart,
					period_end: periodEnd,
					due_date: dueDate,
					status: 'draft',
				},
				dto.year,
			);

			this.notifications.dispatch('invoice.created', {
				invoiceNumber: inv.invoice_number,
				projectName: project.name,
				clientName: project.client.name,
				totalAmount,
				year: dto.year,
			});

			results.push({
				projectId: Number(project.id),
				invoiceNumber: inv.invoice_number,
			});
		}

		return results;
	}

	/**
	 * Generate invoices scoped to a single client.
	 * If projectIds is provided, only those projects are targeted.
	 * If omitted, all active projects of the client with at least one package are invoiced.
	 */
	async generateForClient(
		dto: GenerateClientInvoiceDto,
	): Promise<
		{ projectId: number; invoiceNumber?: string; skipped?: string }[]
	> {
		const projects = await this.repo.findActiveProjectsWithPackages(
			dto.clientId,
			dto.projectIds,
		);

		if (!projects.length) {
			throw new NotFoundException(
				`No invoiceable projects found for client #${dto.clientId}`,
			);
		}

		const results: {
			projectId: number;
			invoiceNumber?: string;
			skipped?: string;
		}[] = [];

		for (const project of projects) {
			const alreadyExists = await this.repo.existsForProjectAndYear(
				Number(project.id),
				dto.year,
			);
			if (alreadyExists) {
				results.push({
					projectId: Number(project.id),
					skipped: 'already_exists',
				});
				continue;
			}

			const hostingAmount = project.hosting_package
				? Number(project.hosting_package.price_monthly) * 12
				: 0;
			const supportAmount = project.support_package
				? Number(project.support_package.price_monthly) * 12
				: 0;
			const totalAmount = hostingAmount + supportAmount;

			const periodStart = new Date(`${dto.year}-01-01T00:00:00Z`);
			const periodEnd = new Date(`${dto.year}-12-31T23:59:59Z`);
			const dueDate = new Date(`${dto.year}-01-31T23:59:59Z`);

			const inv = await this.repo.createSerialized(
				{
					project_id: project.id,
					client_id: project.client_id,
					hosting_package_id: project.hosting_package_id ?? undefined,
					support_package_id: project.support_package_id ?? undefined,
					hosting_package_snapshot: project.hosting_package?.name ?? null,
					support_package_snapshot: project.support_package?.name ?? null,
					hosting_amount: hostingAmount,
					support_amount: supportAmount,
					total_amount: totalAmount,
					period_start: periodStart,
					period_end: periodEnd,
					due_date: dueDate,
					status: 'draft',
				},
				dto.year,
			);

			this.notifications.dispatch('invoice.created', {
				invoiceNumber: inv.invoice_number,
				projectName: project.name,
				clientName: project.client.name,
				totalAmount,
				year: dto.year,
			});

			results.push({
				projectId: Number(project.id),
				invoiceNumber: inv.invoice_number,
			});
		}

		return results;
	}

	async update(id: number, dto: UpdateInvoiceDto) {
		const inv = await this.repo.findById(id);
		if (!inv) throw new NotFoundException(`Invoice #${id} not found`);

		const data: Record<string, unknown> = {};
		if (dto.status) data.status = dto.status;
		if (dto.notes !== undefined) data.notes = dto.notes;
		if (dto.due_date) data.due_date = new Date(dto.due_date);

		const updated = await this.repo.update(id, data);
		return this.serialise(updated);
	}

	async markAsPaid(id: number) {
		const inv = await this.repo.findById(id);
		if (!inv) throw new NotFoundException(`Invoice #${id} not found`);

		const updated = await this.repo.update(id, {
			status: 'paid',
			paid_at: new Date(),
		});

		return this.serialise(updated);
	}

	async remove(id: number) {
		const inv = await this.repo.findById(id);
		if (!inv) throw new NotFoundException(`Invoice #${id} not found`);

		if (inv.status !== 'draft') {
			throw new BadRequestException('Only draft invoices can be deleted');
		}

		await this.repo.remove(Number(inv.id));
	}

	private serialise(inv: Record<string, unknown>) {
		return {
			...inv,
			id: Number((inv as { id: bigint }).id),
			project_id: Number((inv as { project_id: bigint }).project_id),
			client_id: Number((inv as { client_id: bigint }).client_id),
			hosting_package_id: inv.hosting_package_id
				? Number(inv.hosting_package_id)
				: null,
			support_package_id: inv.support_package_id
				? Number(inv.support_package_id)
				: null,
			hosting_amount: Number(
				(inv as { hosting_amount: string }).hosting_amount,
			),
			support_amount: Number(
				(inv as { support_amount: string }).support_amount,
			),
			total_amount: Number((inv as { total_amount: string }).total_amount),
		};
	}
}
