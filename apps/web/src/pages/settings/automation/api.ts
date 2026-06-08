import { api } from '@/lib/api-client';

export const automationApi = {
	getSettings: () => api.get<Record<string, string>>('/settings'),
	updateSetting: (key: string, value: string) => api.put<void>(`/settings/${key}`, { value }),
};
