import { createApiClient } from './apiClient';

const clientApi = createApiClient({
	tokenStorageKey: 'client_token',
	timeout: 30000,
});

export const clientPortalApi = {
	login: (data: { email: string; password: string }) =>
		clientApi.post('/client/auth/login', data),
	logout: () => clientApi.post('/client/auth/logout'),
	getProfile: () => clientApi.get('/client/auth/me'),
	refreshToken: () => clientApi.post('/client/auth/refresh'),
	getProjects: () => clientApi.get('/client/projects'),
	getInvoices: () => clientApi.get('/client/invoices'),
	getInvoice: (invoiceId: number) =>
		clientApi.get(`/client/invoices/${invoiceId}`),
	getSubscriptions: () => clientApi.get('/client/subscriptions'),
	getBackups: () => clientApi.get('/client/backups'),
	getTickets: () => clientApi.get('/client/tickets'),
	getTicket: (ticketId: number) => clientApi.get(`/client/tickets/${ticketId}`),
	createTicket: (data: {
		subject: string;
		message: string;
		project_id?: number;
		priority?: string;
	}) => clientApi.post('/client/tickets', data),
	replyToTicket: (ticketId: number, message: string) =>
		clientApi.post(`/client/tickets/${ticketId}/reply`, { message }),
};

export default clientApi;
