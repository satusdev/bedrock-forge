import api from './api';

export interface Subscription {
	id: number;
	name: string;
	type: string;
	amount: number;
	currency: string;
	billing_cycle: string; // 'monthly', 'yearly', etc.
	status: 'active' | 'suspended' | 'cancelled' | 'pending';
	next_billing_date: string;
	client_id: number;
	client_name?: string; // Optional if joined
}

export interface CreateSubscriptionPayload {
	name?: string;
	type?: string; // 'maintenance', 'hosting', 'domain', 'ssl'
	amount?: number;
	currency?: string;
	billing_cycle?: string;
	client_id: number;
	project_id?: number;
	start_date?: string;
	package_id?: number;
	hosting_package_id?: number;
	support_package_id?: number;
	create_hosting?: boolean;
	create_support?: boolean;
}

export interface HostingPackage {
	id: number;
	name: string;
	slug: string;
	package_type: 'hosting' | 'support';
	description?: string | null;
	disk_space_gb: number;
	bandwidth_gb: number;
	domains_limit: number;
	databases_limit: number;
	email_accounts_limit: number;
	monthly_price: number;
	quarterly_price: number;
	yearly_price: number;
	biennial_price: number;
	setup_fee: number;
	currency: string;
	hosting_yearly_price: number;
	support_monthly_price: number;
	features: string[];
	is_active: boolean;
	is_featured: boolean;
}

export interface CreateHostingPackagePayload {
	package_type?: 'hosting' | 'support';
	name: string;
	slug: string;
	description?: string;
	disk_space_gb?: number;
	bandwidth_gb?: number;
	domains_limit?: number;
	databases_limit?: number;
	email_accounts_limit?: number;
	monthly_price?: number;
	quarterly_price?: number;
	yearly_price?: number;
	biennial_price?: number;
	setup_fee?: number;
	currency?: string;
	hosting_yearly_price?: number;
	support_monthly_price?: number;
	features?: string[];
	is_featured?: boolean;
}

export interface UpdateHostingPackagePayload {
	package_type?: 'hosting' | 'support';
	name?: string;
	description?: string;
	disk_space_gb?: number;
	bandwidth_gb?: number;
	domains_limit?: number;
	databases_limit?: number;
	email_accounts_limit?: number;
	monthly_price?: number;
	quarterly_price?: number;
	yearly_price?: number;
	biennial_price?: number;
	setup_fee?: number;
	currency?: string;
	hosting_yearly_price?: number;
	support_monthly_price?: number;
	features?: string[];
	is_active?: boolean;
	is_featured?: boolean;
}

export const billingService = {
	// Subscriptions
	getSubscriptions: async (): Promise<Subscription[]> => {
		try {
			const response = await api.get('/subscriptions/');
			// Backend returns { subscriptions: [...], total: N }
			return response.data?.subscriptions || [];
		} catch {
			return [];
		}
	},

	getSubscription: async (id: number) => {
		const response = await api.get<Subscription>(`/subscriptions/${id}`);
		return response.data;
	},

	createSubscription: async (data: CreateSubscriptionPayload) => {
		const response = await api.post('/subscriptions/', data);
		return response.data;
	},

	generateInvoice: async (subscriptionId: number) => {
		const response = await api.post(`/subscriptions/${subscriptionId}/invoice`);
		return response.data;
	},

	cancelSubscription: async (id: number) => {
		const response = await api.delete(`/subscriptions/${id}`);
		return response.data;
	},

	renewSubscription: async (id: number) => {
		const response = await api.post(`/subscriptions/${id}/renew`);
		return response.data;
	},

	// Domains
	getDomains: async () => {
		try {
			const response = await api.get('/domains/');
			// Backend returns { domains: [...], total: N }
			return response.data?.domains || [];
		} catch {
			return [];
		}
	},

	createDomain: async (data: {
		client_id: number;
		domain_name: string;
		registrar: string;
		expiry_date?: string;
		registration_date?: string;
		annual_cost?: number;
		auto_renew?: boolean;
		notes?: string;
		dns_provider?: string;
	}) => {
		const response = await api.post('/domains/', data);
		return response.data;
	},

	updateDomain: async (
		id: number,
		data: Partial<{
			registrar: string;
			expiry_date?: string;
			annual_cost: number;
			auto_renew: boolean;
			notes: string;
			dns_provider: string;
			status: string;
		}>,
	) => {
		const response = await api.put(`/domains/${id}`, data);
		return response.data;
	},

	deleteDomain: async (id: number) => {
		const response = await api.delete(`/domains/${id}`);
		return response.data;
	},
	refreshDomainWhois: async (id: number) => {
		const response = await api.post(`/domains/${id}/whois/refresh`);
		return response.data;
	},

	renewDomain: async (id: number, years: number = 1) => {
		const response = await api.post(`/domains/${id}/renew`, { years });
		return response.data;
	},

	// SSL
	getCertificates: async () => {
		try {
			const response = await api.get('/ssl/');
			// Backend returns { certificates: [...], total: N }
			return response.data?.certificates || [];
		} catch {
			return [];
		}
	},

	createCertificate: async (data: {
		common_name: string;
		provider: string;
		issue_date: string;
		expiry_date: string;
		auto_renew?: boolean;
		domain_id?: number;
		notes?: string;
	}) => {
		const response = await api.post('/ssl/', data);
		return response.data;
	},

	updateCertificate: async (
		id: number,
		data: Partial<{
			provider: string;
			expiry_date: string;
			auto_renew: boolean;
			notes: string;
		}>,
	) => {
		const response = await api.put(`/ssl/${id}`, data);
		return response.data;
	},

	deleteCertificate: async (id: number) => {
		const response = await api.delete(`/ssl/${id}`);
		return response.data;
	},

	renewCertificate: async (id: number) => {
		const response = await api.post(`/ssl/${id}/renew`);
		return response.data;
	},

	// Packages
	getPackages: async (
		serviceType?: 'hosting' | 'support',
	): Promise<HostingPackage[]> => {
		try {
			const response = await api.get('/packages/', {
				params: serviceType ? { service_type: serviceType } : undefined,
			});
			// Backend returns { packages: [...] }
			return response.data?.packages || [];
		} catch {
			return [];
		}
	},

	createPackage: async (data: CreateHostingPackagePayload) => {
		const response = await api.post('/packages/', data);
		return response.data;
	},

	updatePackage: async (id: number, data: UpdateHostingPackagePayload) => {
		const response = await api.put(`/packages/${id}`, data);
		return response.data;
	},

	// Invoices
	getInvoices: async (params?: {
		client_id?: number;
		status?: string;
		limit?: number;
		offset?: number;
	}) => {
		try {
			const response = await api.get('/invoices/', { params });
			return response.data;
		} catch {
			return { invoices: [], total: 0 };
		}
	},

	getInvoice: async (id: number) => {
		const response = await api.get(`/invoices/${id}`);
		return response.data;
	},

	createInvoice: async (data: {
		client_id: number;
		items: Array<{
			description: string;
			quantity: number;
			unit_price: number;
			item_type?: string;
			project_id?: number;
			subscription_id?: number;
		}>;
		issue_date?: string;
		due_date?: string;
		tax_rate?: number;
		discount_amount?: number;
		notes?: string;
		terms?: string;
		currency?: string;
	}) => {
		const response = await api.post('/invoices/', data);
		return response.data;
	},

	updateInvoice: async (
		id: number,
		data: {
			status?: string;
			due_date?: string;
			tax_rate?: number;
			discount_amount?: number;
			notes?: string;
			terms?: string;
		},
	) => {
		const response = await api.put(`/invoices/${id}`, data);
		return response.data;
	},

	deleteInvoice: async (id: number) => {
		const response = await api.delete(`/invoices/${id}`);
		return response.data;
	},

	sendInvoice: async (id: number) => {
		const response = await api.post(`/invoices/${id}/send`);
		return response.data;
	},

	recordPayment: async (
		id: number,
		data: {
			amount: number;
			payment_method: string;
			payment_reference?: string;
		},
	) => {
		const response = await api.post(`/invoices/${id}/payment`, data);
		return response.data;
	},

	downloadInvoicePdf: async (id: number) => {
		const response = await api.get(`/invoices/${id}/pdf`, {
			responseType: 'blob',
		});
		return response.data;
	},

	getInvoiceStats: async (periodDays: number = 30) => {
		const response = await api.get('/invoices/stats/summary', {
			params: { period_days: periodDays },
		});
		return response.data;
	},
};
