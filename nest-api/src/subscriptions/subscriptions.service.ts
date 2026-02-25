import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type SubscriptionRow = {
	id: number;
	subscription_type: string;
	name: string;
	description: string | null;
	client_id: number;
	project_id: number | null;
	billing_cycle: string;
	amount: number;
	currency: string;
	start_date: Date;
	next_billing_date: Date;
	end_date: Date | null;
	status: string;
	auto_renew: boolean;
	provider: string | null;
	external_id: string | null;
	reminder_days: number;
	total_invoiced: number;
	total_paid: number;
	notes: string | null;
	created_at: Date;
	last_invoice_id: number | null;
};

@Injectable()
export class SubscriptionsService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private calculateNextBillingDate(start: Date, cycle: string) {
		const daysByCycle: Record<string, number> = {
			monthly: 30,
			quarterly: 90,
			biannual: 180,
			yearly: 365,
			biennial: 730,
			triennial: 1095,
		};
		const next = new Date(start);
		next.setDate(next.getDate() + (daysByCycle[cycle] ?? 365));
		return next;
	}

	private yearlyCost(amount: number, billingCycle: string) {
		const multipliers: Record<string, number> = {
			monthly: 12,
			quarterly: 4,
			biannual: 2,
			yearly: 1,
			biennial: 0.5,
			triennial: 1 / 3,
		};
		return amount * (multipliers[billingCycle] ?? 1);
	}

	private async getSubscriptionOrThrow(
		subscriptionId: number,
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<SubscriptionRow[]>`
			SELECT
				id,
				subscription_type::text AS subscription_type,
				name,
				description,
				client_id,
				project_id,
				billing_cycle::text AS billing_cycle,
				amount,
				currency,
				start_date,
				next_billing_date,
				end_date,
				status::text AS status,
				auto_renew,
				provider,
				external_id,
				reminder_days,
				total_invoiced,
				total_paid,
				notes,
				created_at,
				last_invoice_id
			FROM subscriptions
			WHERE id = ${subscriptionId}
				AND EXISTS (
					SELECT 1
					FROM clients c
					WHERE c.id = subscriptions.client_id
						AND c.owner_id = ${resolvedOwnerId}
				)
			LIMIT 1
		`;
		const subscription = rows[0];
		if (!subscription) {
			throw new NotFoundException({ detail: 'Subscription not found' });
		}
		return subscription;
	}

	async listSubscriptions(query: {
		subscription_type?: string;
		status?: string;
		client_id?: number;
		limit?: number;
		offset?: number;
		owner_id?: number;
	}) {
		const resolvedOwnerId = this.resolveOwnerId(query.owner_id);
		const limit = query.limit ?? 50;
		const offset = query.offset ?? 0;
		const rows = await this.prisma.$queryRaw<SubscriptionRow[]>`
			SELECT
				id,
				subscription_type::text AS subscription_type,
				name,
				description,
				client_id,
				project_id,
				billing_cycle::text AS billing_cycle,
				amount,
				currency,
				start_date,
				next_billing_date,
				end_date,
				status::text AS status,
				auto_renew,
				provider,
				external_id,
				reminder_days,
				total_invoiced,
				total_paid,
				notes,
				created_at,
				last_invoice_id
			FROM subscriptions
			WHERE (${query.subscription_type ?? null}::text IS NULL OR subscription_type::text = ${query.subscription_type ?? null})
				AND (${query.status ?? null}::text IS NULL OR status::text = ${query.status ?? null})
				AND (${query.client_id ?? null}::int IS NULL OR client_id = ${query.client_id ?? null})
				AND EXISTS (
					SELECT 1
					FROM clients c
					WHERE c.id = subscriptions.client_id
						AND c.owner_id = ${resolvedOwnerId}
				)
			ORDER BY next_billing_date ASC
			OFFSET ${offset}
			LIMIT ${limit}
		`;

		const countRows = await this.prisma.$queryRaw<{ total: bigint }[]>`
			SELECT COUNT(*)::bigint AS total
			FROM subscriptions
			WHERE (${query.subscription_type ?? null}::text IS NULL OR subscription_type::text = ${query.subscription_type ?? null})
				AND (${query.status ?? null}::text IS NULL OR status::text = ${query.status ?? null})
				AND (${query.client_id ?? null}::int IS NULL OR client_id = ${query.client_id ?? null})
				AND EXISTS (
					SELECT 1
					FROM clients c
					WHERE c.id = subscriptions.client_id
						AND c.owner_id = ${resolvedOwnerId}
				)
		`;

		return {
			subscriptions: rows.map(subscription => ({
				id: subscription.id,
				name: subscription.name,
				type: subscription.subscription_type,
				client_id: subscription.client_id,
				billing_cycle: subscription.billing_cycle,
				amount: subscription.amount,
				currency: subscription.currency,
				status: subscription.status,
				next_billing_date: subscription.next_billing_date
					.toISOString()
					.slice(0, 10),
				days_until_renewal: Math.max(
					0,
					Math.floor(
						(subscription.next_billing_date.getTime() - Date.now()) /
							(1000 * 60 * 60 * 24),
					),
				),
				auto_renew: subscription.auto_renew,
			})),
			total: Number(countRows[0]?.total ?? 0n),
		};
	}

	async listExpiring(days = 30, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() + days);
		const rows = await this.prisma.$queryRaw<SubscriptionRow[]>`
			SELECT
				id,
				subscription_type::text AS subscription_type,
				name,
				description,
				client_id,
				project_id,
				billing_cycle::text AS billing_cycle,
				amount,
				currency,
				start_date,
				next_billing_date,
				end_date,
				status::text AS status,
				auto_renew,
				provider,
				external_id,
				reminder_days,
				total_invoiced,
				total_paid,
				notes,
				created_at,
				last_invoice_id
			FROM subscriptions
			WHERE status::text = 'active'
				AND next_billing_date <= ${cutoff}
				AND next_billing_date >= CURRENT_DATE
				AND EXISTS (
					SELECT 1
					FROM clients c
					WHERE c.id = subscriptions.client_id
						AND c.owner_id = ${resolvedOwnerId}
				)
			ORDER BY next_billing_date ASC
		`;

		return {
			expiring_within_days: days,
			count: rows.length,
			subscriptions: rows.map(subscription => ({
				id: subscription.id,
				name: subscription.name,
				type: subscription.subscription_type,
				client_id: subscription.client_id,
				next_billing_date: subscription.next_billing_date
					.toISOString()
					.slice(0, 10),
				days_until_renewal: Math.max(
					0,
					Math.floor(
						(subscription.next_billing_date.getTime() - Date.now()) /
							(1000 * 60 * 60 * 24),
					),
				),
				amount: subscription.amount,
				auto_renew: subscription.auto_renew,
			})),
		};
	}

	async getSubscription(subscriptionId: number, ownerId?: number) {
		const subscription = await this.getSubscriptionOrThrow(
			subscriptionId,
			ownerId,
		);
		const daysUntilRenewal = Math.max(
			0,
			Math.floor(
				(subscription.next_billing_date.getTime() - Date.now()) /
					(1000 * 60 * 60 * 24),
			),
		);
		return {
			id: subscription.id,
			name: subscription.name,
			description: subscription.description,
			type: subscription.subscription_type,
			client_id: subscription.client_id,
			project_id: subscription.project_id,
			billing_cycle: subscription.billing_cycle,
			amount: subscription.amount,
			currency: subscription.currency,
			status: subscription.status,
			auto_renew: subscription.auto_renew,
			start_date: subscription.start_date.toISOString().slice(0, 10),
			next_billing_date: subscription.next_billing_date
				.toISOString()
				.slice(0, 10),
			end_date: subscription.end_date
				? subscription.end_date.toISOString().slice(0, 10)
				: null,
			days_until_renewal: daysUntilRenewal,
			yearly_cost: this.yearlyCost(
				subscription.amount,
				subscription.billing_cycle,
			),
			provider: subscription.provider,
			external_id: subscription.external_id,
			reminder_days: subscription.reminder_days,
			total_invoiced: subscription.total_invoiced,
			total_paid: subscription.total_paid,
			notes: subscription.notes,
			created_at: subscription.created_at.toISOString(),
		};
	}

	async createSubscription(
		payload: {
			client_id: number;
			project_id?: number | null;
			subscription_type?: string;
			name?: string;
			description?: string;
			billing_cycle?: string;
			amount?: number;
			currency?: string;
			start_date?: string;
			auto_renew?: boolean;
			reminder_days?: number;
			provider?: string;
			external_id?: string;
			package_id?: number;
			create_hosting?: boolean;
			create_support?: boolean;
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const clientRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM clients
			WHERE id = ${payload.client_id} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		if (!clientRows[0]) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		if (payload.project_id) {
			const projectRows = await this.prisma.$queryRaw<{ id: number }[]>`
				SELECT id
				FROM projects
				WHERE id = ${payload.project_id} AND owner_id = ${resolvedOwnerId}
				LIMIT 1
			`;
			if (!projectRows[0]) {
				throw new NotFoundException({ detail: 'Project not found' });
			}
		}

		const startDate = payload.start_date
			? new Date(payload.start_date)
			: new Date();
		const currency = payload.currency ?? 'USD';

		if (payload.package_id) {
			const packageRows = await this.prisma.$queryRaw<
				{
					id: number;
					name: string;
					description: string | null;
					currency: string;
					hosting_yearly_price: number;
					support_monthly_price: number;
				}[]
			>`
				SELECT id, name, description, currency, hosting_yearly_price, support_monthly_price
				FROM hosting_packages
				WHERE id = ${payload.package_id}
				LIMIT 1
			`;
			const hostingPackage = packageRows[0];
			if (!hostingPackage) {
				throw new NotFoundException({ detail: 'Package not found' });
			}

			const created: Array<Record<string, unknown>> = [];
			if (
				(payload.create_hosting ?? true) &&
				hostingPackage.hosting_yearly_price > 0
			) {
				const next = this.calculateNextBillingDate(startDate, 'yearly');
				const rows = await this.prisma.$queryRaw<
					{ id: number; next_billing_date: Date }[]
				>`
					INSERT INTO subscriptions (
						subscription_type,
						name,
						description,
						billing_cycle,
						amount,
						currency,
						start_date,
						next_billing_date,
						status,
						auto_renew,
						reminder_days,
						provider,
						external_id,
						client_id,
						project_id,
						total_invoiced,
						total_paid,
						created_at,
						updated_at,
						reminder_count
					)
					VALUES (
						${'hosting'}::subscriptiontype,
						${`${hostingPackage.name} Hosting`},
						${hostingPackage.description},
						${'yearly'}::billingcycle,
						${hostingPackage.hosting_yearly_price},
						${hostingPackage.currency || currency},
						${startDate},
						${next},
						${'active'}::subscriptionstatus,
						${payload.auto_renew ?? true},
						${payload.reminder_days ?? 30},
						${payload.provider ?? null},
						${payload.external_id ?? null},
						${payload.client_id},
						${payload.project_id ?? null},
						${0},
						${0},
						NOW(),
						NOW(),
						${0}
					)
					RETURNING id, next_billing_date
				`;
				created.push({
					id: rows[0]?.id,
					name: `${hostingPackage.name} Hosting`,
					type: 'hosting',
					amount: hostingPackage.hosting_yearly_price,
					currency: hostingPackage.currency || currency,
					billing_cycle: 'yearly',
					next_billing_date: rows[0]?.next_billing_date
						? rows[0].next_billing_date.toISOString().slice(0, 10)
						: next.toISOString().slice(0, 10),
				});
			}

			if (
				(payload.create_support ?? true) &&
				hostingPackage.support_monthly_price > 0
			) {
				const next = this.calculateNextBillingDate(startDate, 'monthly');
				const rows = await this.prisma.$queryRaw<
					{ id: number; next_billing_date: Date }[]
				>`
					INSERT INTO subscriptions (
						subscription_type,
						name,
						description,
						billing_cycle,
						amount,
						currency,
						start_date,
						next_billing_date,
						status,
						auto_renew,
						reminder_days,
						provider,
						external_id,
						client_id,
						project_id,
						total_invoiced,
						total_paid,
						created_at,
						updated_at,
						reminder_count
					)
					VALUES (
						${'support'}::subscriptiontype,
						${`${hostingPackage.name} Support`},
						${hostingPackage.description},
						${'monthly'}::billingcycle,
						${hostingPackage.support_monthly_price},
						${hostingPackage.currency || currency},
						${startDate},
						${next},
						${'active'}::subscriptionstatus,
						${payload.auto_renew ?? true},
						${payload.reminder_days ?? 30},
						${payload.provider ?? null},
						${payload.external_id ?? null},
						${payload.client_id},
						${payload.project_id ?? null},
						${0},
						${0},
						NOW(),
						NOW(),
						${0}
					)
					RETURNING id, next_billing_date
				`;
				created.push({
					id: rows[0]?.id,
					name: `${hostingPackage.name} Support`,
					type: 'support',
					amount: hostingPackage.support_monthly_price,
					currency: hostingPackage.currency || currency,
					billing_cycle: 'monthly',
					next_billing_date: rows[0]?.next_billing_date
						? rows[0].next_billing_date.toISOString().slice(0, 10)
						: next.toISOString().slice(0, 10),
				});
			}

			return {
				status: 'success',
				message: `Created ${created.length} subscription(s)`,
				subscriptions: created,
			};
		}

		const nextBilling = this.calculateNextBillingDate(
			startDate,
			payload.billing_cycle ?? 'yearly',
		);
		const rows = await this.prisma.$queryRaw<
			{ id: number; next_billing_date: Date }[]
		>`
			INSERT INTO subscriptions (
				subscription_type,
				name,
				description,
				billing_cycle,
				amount,
				currency,
				start_date,
				next_billing_date,
				status,
				auto_renew,
				reminder_days,
				provider,
				external_id,
				client_id,
				project_id,
				total_invoiced,
				total_paid,
				created_at,
				updated_at,
				reminder_count
			)
			VALUES (
				${payload.subscription_type ?? 'other'}::subscriptiontype,
				${payload.name ?? 'Subscription'},
				${payload.description ?? null},
				${payload.billing_cycle ?? 'yearly'}::billingcycle,
				${payload.amount ?? 0},
				${currency},
				${startDate},
				${nextBilling},
				${'active'}::subscriptionstatus,
				${payload.auto_renew ?? true},
				${payload.reminder_days ?? 30},
				${payload.provider ?? null},
				${payload.external_id ?? null},
				${payload.client_id},
				${payload.project_id ?? null},
				${0},
				${0},
				NOW(),
				NOW(),
				${0}
			)
			RETURNING id, next_billing_date
		`;
		const created = rows[0];
		return {
			status: 'success',
			message: 'Subscription created successfully',
			subscription_id: created?.id,
			next_billing_date: created?.next_billing_date
				? created.next_billing_date.toISOString().slice(0, 10)
				: nextBilling.toISOString().slice(0, 10),
		};
	}

	async updateSubscription(
		subscriptionId: number,
		payload: {
			name?: string;
			description?: string;
			billing_cycle?: string;
			amount?: number;
			auto_renew?: boolean;
			reminder_days?: number;
			status?: string;
			notes?: string;
		},
		ownerId?: number,
	) {
		const subscription = await this.getSubscriptionOrThrow(
			subscriptionId,
			ownerId,
		);
		await this.prisma.$executeRaw`
			UPDATE subscriptions
			SET
				name = COALESCE(${payload.name ?? null}, name),
				description = COALESCE(${payload.description ?? null}, description),
				billing_cycle = COALESCE(${payload.billing_cycle ?? null}::billingcycle, billing_cycle),
				amount = COALESCE(${payload.amount ?? null}, amount),
				auto_renew = COALESCE(${payload.auto_renew ?? null}, auto_renew),
				reminder_days = COALESCE(${payload.reminder_days ?? null}, reminder_days),
				status = COALESCE(${payload.status ?? null}::subscriptionstatus, status),
				notes = COALESCE(${payload.notes ?? null}, notes),
				updated_at = NOW()
			WHERE id = ${subscriptionId}
		`;
		return {
			status: 'success',
			message: `Subscription ${subscription.name} updated`,
		};
	}

	async cancelSubscription(subscriptionId: number, ownerId?: number) {
		const subscription = await this.getSubscriptionOrThrow(
			subscriptionId,
			ownerId,
		);
		await this.prisma.$executeRaw`
			UPDATE subscriptions
			SET
				status = ${'cancelled'}::subscriptionstatus,
				cancelled_at = NOW(),
				auto_renew = ${false},
				updated_at = NOW()
			WHERE id = ${subscriptionId}
		`;
		return {
			status: 'success',
			message: `Subscription ${subscription.name} cancelled`,
		};
	}

	async renewSubscription(subscriptionId: number, ownerId?: number) {
		const subscription = await this.getSubscriptionOrThrow(
			subscriptionId,
			ownerId,
		);
		const next = this.calculateNextBillingDate(
			subscription.next_billing_date,
			subscription.billing_cycle,
		);
		await this.prisma.$executeRaw`
			UPDATE subscriptions
			SET
				next_billing_date = ${next},
				status = ${'active'}::subscriptionstatus,
				updated_at = NOW()
			WHERE id = ${subscriptionId}
		`;
		return {
			status: 'success',
			message: `Subscription renewed until ${next.toISOString().slice(0, 10)}`,
			next_billing_date: next.toISOString().slice(0, 10),
		};
	}

	async generateRenewalInvoice(subscriptionId: number, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const subscription = await this.getSubscriptionOrThrow(
			subscriptionId,
			ownerId,
		);
		const clientRows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM clients
			WHERE id = ${subscription.client_id} AND owner_id = ${resolvedOwnerId}
			LIMIT 1
		`;
		if (!clientRows[0]) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		const invoiceNumber = `INV-${Date.now()}`;
		const issueDate = new Date();
		const dueDate = new Date(issueDate);
		dueDate.setDate(dueDate.getDate() + 30);
		const periodStart = subscription.next_billing_date;
		const periodEnd = this.calculateNextBillingDate(
			subscription.next_billing_date,
			subscription.billing_cycle,
		);

		const invoiceRows = await this.prisma.$queryRaw<
			{ id: number; total: number }[]
		>`
			INSERT INTO invoices (
				invoice_number,
				status,
				issue_date,
				due_date,
				paid_date,
				subtotal,
				tax_rate,
				tax_amount,
				discount_amount,
				total,
				amount_paid,
				payment_method,
				payment_reference,
				notes,
				terms,
				period_start,
				period_end,
				currency,
				client_id,
				created_at,
				updated_at
			)
			VALUES (
				${invoiceNumber},
				${'draft'}::invoicestatus,
				${issueDate},
				${dueDate},
				${null},
				${subscription.amount},
				${0},
				${0},
				${0},
				${subscription.amount},
				${0},
				${null},
				${null},
				${null},
				${null},
				${periodStart},
				${periodEnd},
				${subscription.currency},
				${subscription.client_id},
				NOW(),
				NOW()
			)
			RETURNING id, total
		`;
		const invoice = invoiceRows[0];
		if (!invoice) {
			throw new NotFoundException({
				detail: 'Failed to generate invoice',
			});
		}

		await this.prisma.$queryRaw`
			INSERT INTO invoice_items (
				invoice_id,
				description,
				quantity,
				unit_price,
				total,
				item_type,
				project_id
			)
			VALUES (
				${invoice.id},
				${`${subscription.name} - ${subscription.billing_cycle} Renewal`},
				${1},
				${subscription.amount},
				${subscription.amount},
				${subscription.subscription_type},
				${subscription.project_id}
			)
		`;

		await this.prisma.$executeRaw`
			UPDATE subscriptions
			SET
				last_invoice_id = ${invoice.id},
				total_invoiced = total_invoiced + ${subscription.amount},
				updated_at = NOW()
			WHERE id = ${subscriptionId}
		`;

		return {
			status: 'success',
			message: 'Renewal invoice generated',
			invoice_id: invoice.id,
			invoice_number: invoiceNumber,
			total: invoice.total,
		};
	}

	async getStatsSummary(ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const rows = await this.prisma.$queryRaw<SubscriptionRow[]>`
			SELECT
				id,
				subscription_type::text AS subscription_type,
				name,
				description,
				client_id,
				project_id,
				billing_cycle::text AS billing_cycle,
				amount,
				currency,
				start_date,
				next_billing_date,
				end_date,
				status::text AS status,
				auto_renew,
				provider,
				external_id,
				reminder_days,
				total_invoiced,
				total_paid,
				notes,
				created_at,
				last_invoice_id
			FROM subscriptions
			WHERE status::text = 'active'
				AND EXISTS (
					SELECT 1
					FROM clients c
					WHERE c.id = subscriptions.client_id
						AND c.owner_id = ${resolvedOwnerId}
				)
		`;

		const byType: Record<string, { count: number; yearly_revenue: number }> =
			{};
		let totalYearlyRevenue = 0;
		let expiringIn30Days = 0;
		let expiringIn7Days = 0;
		const today = Date.now();

		for (const subscription of rows) {
			const type = subscription.subscription_type ?? 'other';
			if (!byType[type]) {
				byType[type] = { count: 0, yearly_revenue: 0 };
			}
			const yearly = this.yearlyCost(
				subscription.amount,
				subscription.billing_cycle,
			);
			byType[type].count += 1;
			byType[type].yearly_revenue += yearly;
			totalYearlyRevenue += yearly;

			const daysUntil = Math.floor(
				(subscription.next_billing_date.getTime() - today) /
					(1000 * 60 * 60 * 24),
			);
			if (daysUntil <= 30) {
				expiringIn30Days += 1;
			}
			if (daysUntil <= 7) {
				expiringIn7Days += 1;
			}
		}

		return {
			total_active: rows.length,
			total_yearly_revenue: Number(totalYearlyRevenue.toFixed(2)),
			total_monthly_revenue: Number((totalYearlyRevenue / 12).toFixed(2)),
			expiring_in_30_days: expiringIn30Days,
			expiring_in_7_days: expiringIn7Days,
			by_type: byType,
		};
	}
}
