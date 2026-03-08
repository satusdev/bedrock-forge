import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import {
	billingcycle,
	Prisma,
	subscriptionstatus,
	subscriptiontype,
} from '@prisma/client';
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
	package_id: number | null;
};

type DueSubscriptionClaim = {
	id: number;
};

type SubscriptionRunnerSnapshot = {
	enabled: boolean;
	runs_total: number;
	last_run_at: string | null;
	last_outcome: {
		claimed: number;
		renewals_succeeded: number;
		renewals_failed: number;
		reminders_sent: number;
		error: string | null;
	} | null;
};

const subscriptionSelect = {
	id: true,
	subscription_type: true,
	name: true,
	description: true,
	client_id: true,
	project_id: true,
	billing_cycle: true,
	amount: true,
	currency: true,
	start_date: true,
	next_billing_date: true,
	end_date: true,
	status: true,
	auto_renew: true,
	provider: true,
	external_id: true,
	reminder_days: true,
	total_invoiced: true,
	total_paid: true,
	notes: true,
	created_at: true,
	last_invoice_id: true,
	package_id: true,
} satisfies Prisma.subscriptionsSelect;

@Injectable()
export class SubscriptionsService {
	constructor(private readonly prisma: PrismaService) {}

	private readonly fallbackOwnerId = 1;
	private runnerSnapshot: SubscriptionRunnerSnapshot = {
		enabled:
			(process.env.SUBSCRIPTION_RUNNER_ENABLED ?? 'true').toLowerCase() !==
			'false',
		runs_total: 0,
		last_run_at: null,
		last_outcome: null,
	};
	private readonly validSubscriptionTypes = new Set<subscriptiontype>([
		'hosting',
		'domain',
		'ssl',
		'maintenance',
		'support',
		'backup',
		'cdn',
		'email',
		'other',
	]);
	private readonly validSubscriptionStatuses = new Set<subscriptionstatus>([
		'active',
		'pending',
		'cancelled',
		'expired',
		'suspended',
	]);
	private readonly validBillingCycles = new Set<billingcycle>([
		'monthly',
		'quarterly',
		'biannual',
		'yearly',
		'biennial',
		'triennial',
	]);

	getRunnerSnapshot() {
		return this.runnerSnapshot;
	}

	recordRunnerSnapshot(outcome: {
		claimed: number;
		renewals_succeeded: number;
		renewals_failed: number;
		reminders_sent: number;
		error?: string | null;
	}) {
		this.runnerSnapshot = {
			...this.runnerSnapshot,
			runs_total: this.runnerSnapshot.runs_total + 1,
			last_run_at: new Date().toISOString(),
			last_outcome: {
				claimed: outcome.claimed,
				renewals_succeeded: outcome.renewals_succeeded,
				renewals_failed: outcome.renewals_failed,
				reminders_sent: outcome.reminders_sent,
				error: outcome.error ?? null,
			},
		};
	}

	private resolveOwnerId(ownerId?: number) {
		return ownerId ?? this.fallbackOwnerId;
	}

	private toSubscriptionRow(
		subscription: Prisma.subscriptionsGetPayload<{
			select: typeof subscriptionSelect;
		}>,
	): SubscriptionRow {
		return {
			...subscription,
			subscription_type: subscription.subscription_type,
			billing_cycle: subscription.billing_cycle,
			status: subscription.status,
		};
	}

	private normalizeSubscriptionType(
		value: string | undefined,
		fallback: subscriptiontype,
	) {
		if (!value) {
			return fallback;
		}
		const normalized = value.trim().toLowerCase();
		if (!this.validSubscriptionTypes.has(normalized as subscriptiontype)) {
			throw new BadRequestException({ detail: 'Invalid subscription_type' });
		}
		return normalized as subscriptiontype;
	}

	private normalizeSubscriptionStatus(
		value: string | undefined,
		fallback: subscriptionstatus,
	) {
		if (!value) {
			return fallback;
		}
		const normalized = value.trim().toLowerCase();
		if (!this.validSubscriptionStatuses.has(normalized as subscriptionstatus)) {
			throw new BadRequestException({ detail: 'Invalid status' });
		}
		return normalized as subscriptionstatus;
	}

	private normalizeBillingCycle(
		value: string | undefined,
		fallback: billingcycle,
	) {
		if (!value) {
			return fallback;
		}
		const normalized = value.trim().toLowerCase();
		if (!this.validBillingCycles.has(normalized as billingcycle)) {
			throw new BadRequestException({ detail: 'Invalid billing_cycle' });
		}
		return normalized as billingcycle;
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
		const subscription = await this.prisma.subscriptions.findFirst({
			where: {
				id: subscriptionId,
				clients: {
					is: {
						owner_id: resolvedOwnerId,
					},
				},
			},
			select: subscriptionSelect,
		});
		if (!subscription) {
			throw new NotFoundException({ detail: 'Subscription not found' });
		}
		return this.toSubscriptionRow(subscription);
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
		const where: Prisma.subscriptionsWhereInput = {
			clients: {
				is: {
					owner_id: resolvedOwnerId,
				},
			},
			...(query.client_id ? { client_id: query.client_id } : {}),
		};

		if (query.subscription_type) {
			where.subscription_type = this.normalizeSubscriptionType(
				query.subscription_type,
				'other',
			);
		}

		if (query.status) {
			where.status = this.normalizeSubscriptionStatus(query.status, 'active');
		}

		const [rows, total] = await Promise.all([
			this.prisma.subscriptions.findMany({
				where,
				orderBy: { next_billing_date: 'asc' },
				skip: offset,
				take: limit,
				select: subscriptionSelect,
			}),
			this.prisma.subscriptions.count({ where }),
		]);

		return {
			subscriptions: rows.map(current => {
				const subscription = this.toSubscriptionRow(current);
				return {
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
				};
			}),
			total,
		};
	}

	async listExpiring(days = 30, ownerId?: number) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() + days);
		const rows = await this.prisma.subscriptions.findMany({
			where: {
				status: 'active',
				next_billing_date: {
					gte: today,
					lte: cutoff,
				},
				clients: {
					is: {
						owner_id: resolvedOwnerId,
					},
				},
			},
			orderBy: { next_billing_date: 'asc' },
			select: subscriptionSelect,
		});

		return {
			expiring_within_days: days,
			count: rows.length,
			subscriptions: rows.map(current => {
				const subscription = this.toSubscriptionRow(current);
				return {
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
				};
			}),
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
			package_id: subscription.package_id,
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
			hosting_package_id?: number;
			support_package_id?: number;
			create_hosting?: boolean;
			create_support?: boolean;
		},
		ownerId?: number,
	) {
		const resolvedOwnerId = this.resolveOwnerId(ownerId);
		const client = await this.prisma.clients.findFirst({
			where: {
				id: payload.client_id,
				owner_id: resolvedOwnerId,
			},
			select: { id: true },
		});
		if (!client) {
			throw new NotFoundException({ detail: 'Client not found' });
		}

		if (payload.project_id) {
			const project = await this.prisma.projects.findFirst({
				where: {
					id: payload.project_id,
					owner_id: resolvedOwnerId,
				},
				select: { id: true },
			});
			if (!project) {
				throw new NotFoundException({ detail: 'Project not found' });
			}
		}

		const startDate = payload.start_date
			? new Date(payload.start_date)
			: new Date();
		const currency = payload.currency ?? 'USD';

		if (
			payload.package_id ||
			payload.hosting_package_id ||
			payload.support_package_id
		) {
			const packageIds = Array.from(
				new Set(
					[
						payload.package_id,
						payload.hosting_package_id,
						payload.support_package_id,
					].filter((entry): entry is number => Number.isFinite(entry)),
				),
			);
			if (packageIds.length === 0) {
				throw new NotFoundException({ detail: 'Package not found' });
			}
			const packageRows = await this.prisma.hosting_packages.findMany({
				where: {
					id: {
						in: packageIds,
					},
				},
				select: {
					id: true,
					name: true,
					package_type: true,
					description: true,
					currency: true,
					monthly_price: true,
					yearly_price: true,
					hosting_yearly_price: true,
					support_monthly_price: true,
				},
			});
			if (packageRows.length === 0) {
				throw new NotFoundException({ detail: 'Package not found' });
			}
			const packageById = new Map(packageRows.map(row => [row.id, row]));

			const selectedHostingPackageId = payload.hosting_package_id
				? payload.hosting_package_id
				: payload.create_hosting === false
					? undefined
					: payload.package_id;
			const selectedSupportPackageId = payload.support_package_id
				? payload.support_package_id
				: payload.create_support === false
					? undefined
					: payload.package_id;

			const created: Array<Record<string, unknown>> = [];
			if (payload.create_hosting ?? true) {
				const hostingPackage = selectedHostingPackageId
					? packageById.get(selectedHostingPackageId)
					: undefined;
				if (selectedHostingPackageId && !hostingPackage) {
					throw new NotFoundException({ detail: 'Hosting package not found' });
				}
				const hostingAmount = hostingPackage
					? hostingPackage.package_type === 'support'
						? hostingPackage.hosting_yearly_price
						: hostingPackage.hosting_yearly_price > 0
							? hostingPackage.hosting_yearly_price
							: hostingPackage.yearly_price
					: 0;
				if (hostingPackage && hostingAmount > 0) {
					const next = this.calculateNextBillingDate(startDate, 'yearly');
					const createdSubscription = await this.prisma.subscriptions.create({
						data: {
							subscription_type: 'hosting',
							name: `${hostingPackage.name} Hosting`,
							description: hostingPackage.description,
							billing_cycle: 'yearly',
							amount: hostingAmount,
							currency: hostingPackage.currency || currency,
							start_date: startDate,
							next_billing_date: next,
							status: 'active',
							auto_renew: payload.auto_renew ?? true,
							reminder_days: payload.reminder_days ?? 30,
							provider: payload.provider ?? null,
							external_id: payload.external_id ?? null,
							client_id: payload.client_id,
							project_id: payload.project_id ?? null,
							package_id: hostingPackage.id,
							total_invoiced: 0,
							total_paid: 0,
							updated_at: new Date(),
							reminder_count: 0,
						},
						select: {
							id: true,
							next_billing_date: true,
						},
					});
					created.push({
						id: createdSubscription.id,
						name: `${hostingPackage.name} Hosting`,
						type: 'hosting',
						amount: hostingAmount,
						currency: hostingPackage.currency || currency,
						billing_cycle: 'yearly',
						next_billing_date: createdSubscription.next_billing_date
							.toISOString()
							.slice(0, 10),
					});
				}
			}

			if (payload.create_support ?? true) {
				const supportPackage = selectedSupportPackageId
					? packageById.get(selectedSupportPackageId)
					: undefined;
				if (selectedSupportPackageId && !supportPackage) {
					throw new NotFoundException({ detail: 'Support package not found' });
				}
				const supportAmount = supportPackage
					? supportPackage.package_type === 'hosting'
						? supportPackage.support_monthly_price
						: supportPackage.support_monthly_price > 0
							? supportPackage.support_monthly_price
							: supportPackage.monthly_price
					: 0;
				if (supportPackage && supportAmount > 0) {
					const next = this.calculateNextBillingDate(startDate, 'monthly');
					const createdSubscription = await this.prisma.subscriptions.create({
						data: {
							subscription_type: 'support',
							name: `${supportPackage.name} Support`,
							description: supportPackage.description,
							billing_cycle: 'monthly',
							amount: supportAmount,
							currency: supportPackage.currency || currency,
							start_date: startDate,
							next_billing_date: next,
							status: 'active',
							auto_renew: payload.auto_renew ?? true,
							reminder_days: payload.reminder_days ?? 30,
							provider: payload.provider ?? null,
							external_id: payload.external_id ?? null,
							client_id: payload.client_id,
							project_id: payload.project_id ?? null,
							package_id: supportPackage.id,
							total_invoiced: 0,
							total_paid: 0,
							updated_at: new Date(),
							reminder_count: 0,
						},
						select: {
							id: true,
							next_billing_date: true,
						},
					});
					created.push({
						id: createdSubscription.id,
						name: `${supportPackage.name} Support`,
						type: 'support',
						amount: supportAmount,
						currency: supportPackage.currency || currency,
						billing_cycle: 'monthly',
						next_billing_date: createdSubscription.next_billing_date
							.toISOString()
							.slice(0, 10),
					});
				}
			}

			if (created.length === 0) {
				throw new NotFoundException({
					detail: 'No matching hosting/support package pricing found',
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
		const created = await this.prisma.subscriptions.create({
			data: {
				subscription_type: this.normalizeSubscriptionType(
					payload.subscription_type,
					'other',
				),
				name: payload.name ?? 'Subscription',
				description: payload.description ?? null,
				billing_cycle: this.normalizeBillingCycle(
					payload.billing_cycle,
					'yearly',
				),
				amount: payload.amount ?? 0,
				currency,
				start_date: startDate,
				next_billing_date: nextBilling,
				status: 'active',
				auto_renew: payload.auto_renew ?? true,
				reminder_days: payload.reminder_days ?? 30,
				provider: payload.provider ?? null,
				external_id: payload.external_id ?? null,
				client_id: payload.client_id,
				project_id: payload.project_id ?? null,
				package_id: payload.package_id ?? null,
				total_invoiced: 0,
				total_paid: 0,
				updated_at: new Date(),
				reminder_count: 0,
			},
			select: {
				id: true,
				next_billing_date: true,
			},
		});
		return {
			status: 'success',
			message: 'Subscription created successfully',
			subscription_id: created.id,
			next_billing_date: created.next_billing_date.toISOString().slice(0, 10),
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
		await this.prisma.subscriptions.update({
			where: { id: subscriptionId },
			data: {
				name: payload.name ?? subscription.name,
				description: payload.description ?? subscription.description,
				billing_cycle: this.normalizeBillingCycle(
					payload.billing_cycle,
					subscription.billing_cycle as billingcycle,
				),
				amount: payload.amount ?? subscription.amount,
				auto_renew: payload.auto_renew ?? subscription.auto_renew,
				reminder_days: payload.reminder_days ?? subscription.reminder_days,
				status: this.normalizeSubscriptionStatus(
					payload.status,
					subscription.status as subscriptionstatus,
				),
				notes: payload.notes ?? subscription.notes,
				updated_at: new Date(),
			},
		});
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
		await this.prisma.subscriptions.update({
			where: { id: subscriptionId },
			data: {
				status: 'cancelled',
				cancelled_at: new Date(),
				auto_renew: false,
				updated_at: new Date(),
			},
		});
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
		await this.prisma.subscriptions.update({
			where: { id: subscriptionId },
			data: {
				next_billing_date: next,
				status: 'active',
				updated_at: new Date(),
			},
		});
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
		const client = await this.prisma.clients.findFirst({
			where: {
				id: subscription.client_id,
				owner_id: resolvedOwnerId,
			},
			select: { id: true },
		});
		if (!client) {
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

		const invoice = await this.prisma.invoices.create({
			data: {
				invoice_number: invoiceNumber,
				status: 'draft',
				issue_date: issueDate,
				due_date: dueDate,
				paid_date: null,
				subtotal: subscription.amount,
				tax_rate: 0,
				tax_amount: 0,
				discount_amount: 0,
				total: subscription.amount,
				amount_paid: 0,
				payment_method: null,
				payment_reference: null,
				notes: null,
				terms: null,
				period_start: periodStart,
				period_end: periodEnd,
				currency: subscription.currency,
				client_id: subscription.client_id,
				updated_at: new Date(),
			},
			select: {
				id: true,
				total: true,
			},
		});
		if (!invoice) {
			throw new NotFoundException({
				detail: 'Failed to generate invoice',
			});
		}

		await this.prisma.invoice_items.create({
			data: {
				invoice_id: invoice.id,
				description: `${subscription.name} - ${subscription.billing_cycle} Renewal`,
				quantity: 1,
				unit_price: subscription.amount,
				total: subscription.amount,
				item_type: subscription.subscription_type,
				project_id: subscription.project_id,
				subscription_id: subscription.id,
			},
		});

		await this.prisma.subscriptions.update({
			where: { id: subscriptionId },
			data: {
				last_invoice_id: invoice.id,
				total_invoiced: {
					increment: subscription.amount,
				},
				updated_at: new Date(),
			},
		});

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
		const rows = await this.prisma.subscriptions.findMany({
			where: {
				status: 'active',
				clients: {
					is: {
						owner_id: resolvedOwnerId,
					},
				},
			},
			select: subscriptionSelect,
		});

		const byType: Record<string, { count: number; yearly_revenue: number }> =
			{};
		let totalYearlyRevenue = 0;
		let expiringIn30Days = 0;
		let expiringIn7Days = 0;
		const today = Date.now();

		for (const current of rows) {
			const subscription = this.toSubscriptionRow(current);
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

	async claimDueAutoRenewals(limit = 5) {
		const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
		const now = new Date();
		const staleThreshold = new Date(now.getTime() - 60_000);
		const due = await this.prisma.subscriptions.findMany({
			where: {
				status: 'active',
				auto_renew: true,
				next_billing_date: { lte: now },
				updated_at: { lte: staleThreshold },
			},
			orderBy: [{ next_billing_date: 'asc' }, { id: 'asc' }],
			take: safeLimit,
			select: { id: true },
		});

		if (due.length === 0) {
			return [];
		}

		await this.prisma.subscriptions.updateMany({
			where: { id: { in: due.map(row => row.id) } },
			data: { updated_at: now },
		});

		return due;
	}

	async processAutoRenewal(subscriptionId: number) {
		const subscription = await this.prisma.subscriptions.findUnique({
			where: { id: subscriptionId },
			select: subscriptionSelect,
		});
		if (!subscription) {
			throw new NotFoundException({ detail: 'Subscription not found' });
		}

		const current = this.toSubscriptionRow(subscription);
		if (current.status !== 'active' || !current.auto_renew) {
			return {
				subscription_id: current.id,
				status: 'skipped',
			};
		}

		const invoiceNumber = `INV-${Date.now()}-${current.id}`;
		const issueDate = new Date();
		const dueDate = new Date(issueDate);
		dueDate.setDate(dueDate.getDate() + 30);
		const periodStart = current.next_billing_date;
		const periodEnd = this.calculateNextBillingDate(
			current.next_billing_date,
			current.billing_cycle,
		);

		const invoice = await this.prisma.invoices.create({
			data: {
				invoice_number: invoiceNumber,
				status: 'draft',
				issue_date: issueDate,
				due_date: dueDate,
				paid_date: null,
				subtotal: current.amount,
				tax_rate: 0,
				tax_amount: 0,
				discount_amount: 0,
				total: current.amount,
				amount_paid: 0,
				payment_method: null,
				payment_reference: null,
				notes: null,
				terms: null,
				period_start: periodStart,
				period_end: periodEnd,
				currency: current.currency,
				client_id: current.client_id,
				updated_at: issueDate,
			},
			select: { id: true, total: true },
		});

		await this.prisma.invoice_items.create({
			data: {
				invoice_id: invoice.id,
				description: `${current.name} - ${current.billing_cycle} Renewal`,
				quantity: 1,
				unit_price: current.amount,
				total: current.amount,
				item_type: current.subscription_type,
				project_id: current.project_id,
				subscription_id: current.id,
			},
		});

		const nextBillingDate = this.calculateNextBillingDate(
			current.next_billing_date,
			current.billing_cycle,
		);

		await this.prisma.subscriptions.update({
			where: { id: current.id },
			data: {
				next_billing_date: nextBillingDate,
				last_invoice_id: invoice.id,
				total_invoiced: { increment: current.amount },
				last_reminder_sent: null,
				updated_at: new Date(),
			},
		});

		return {
			subscription_id: current.id,
			status: 'renewed',
			invoice_id: invoice.id,
			next_billing_date: nextBillingDate.toISOString().slice(0, 10),
		};
	}

	async processRenewalReminders(limit = 25) {
		const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
		const now = new Date();
		const reminderThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		const rows = await this.prisma.subscriptions.findMany({
			where: {
				status: 'active',
				auto_renew: true,
				next_billing_date: { gte: now },
				OR: [
					{ last_reminder_sent: null },
					{ last_reminder_sent: { lte: reminderThreshold } },
				],
			},
			orderBy: [{ next_billing_date: 'asc' }, { id: 'asc' }],
			select: {
				id: true,
				next_billing_date: true,
				reminder_days: true,
			},
			take: safeLimit,
		});

		const dueIds = rows
			.filter(row => {
				const expiryWindow = new Date(now);
				expiryWindow.setDate(expiryWindow.getDate() + row.reminder_days);
				return row.next_billing_date <= expiryWindow;
			})
			.map(row => row.id);

		for (const id of dueIds) {
			await this.prisma.subscriptions.update({
				where: { id },
				data: {
					last_reminder_sent: now,
					reminder_count: { increment: 1 },
					updated_at: now,
				},
			});
		}

		return {
			reminders_sent: dueIds.length,
		};
	}
}
