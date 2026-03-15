import api from '@/services/api';

export interface MonitorPayload {
	name: string;
	url: string;
	monitor_type: string;
	interval_seconds: number;
	timeout_seconds: number;
}

export const monitoringApi = {
	getMonitors: () => api.get('/monitors'),
	createMonitor: (payload: MonitorPayload) => api.post('/monitors', payload),
	deleteMonitor: (monitorId: number) => api.delete(`/monitors/${monitorId}`),
	pauseMonitor: (monitorId: number) => api.post(`/monitors/${monitorId}/pause`),
	resumeMonitor: (monitorId: number) =>
		api.post(`/monitors/${monitorId}/resume`),
};
