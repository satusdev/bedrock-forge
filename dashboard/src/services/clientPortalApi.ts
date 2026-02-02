import axios from 'axios';

const API_BASE_URL =
	import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

const clientApi = axios.create({
	baseURL: API_BASE_URL,
	timeout: 30000,
	headers: {
		'Content-Type': 'application/json',
	},
});

clientApi.interceptors.request.use(config => {
	const token = localStorage.getItem('client_token');
	if (token) {
		config.headers.Authorization = `Bearer ${token}`;
	}
	return config;
});

export const clientPortalApi = {
	getProjects: () => clientApi.get('/client/projects'),
	getInvoices: () => clientApi.get('/client/invoices'),
	getTickets: () => clientApi.get('/client/tickets'),
	getTicket: (ticketId: number) => clientApi.get(`/client/tickets/${ticketId}`),
	createTicket: (data: {
		subject: string;
		message: string;
		project_id?: number;
		priority?: string;
	}) => clientApi.post('/client/tickets', data),
};

export default clientApi;
