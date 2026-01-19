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
	name: string;
	type: string; // 'maintenance', 'hosting', 'domain', 'ssl'
	amount: number;
	currency: string;
	billing_cycle: string;
	client_id: number;
	project_id?: number;
	start_date?: string;
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

	renewCertificate: async (id: number) => {
		const response = await api.post(`/ssl/${id}/renew`);
		return response.data;
	},

	// Packages
	getPackages: async () => {
		try {
			const response = await api.get('/packages/');
			// Backend returns { packages: [...] }
			return response.data?.packages || [];
		} catch {
			return [];
		}
	},

	updatePackage: async (id: number, data: any) => {
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
		}
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
		data: { amount: number; payment_method: string; payment_reference?: string }
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
