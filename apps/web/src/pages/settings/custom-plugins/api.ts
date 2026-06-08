import { api } from '@/lib/api-client';
import { CustomPlugin, CustomPluginInventory, PluginFormData } from './types';

export const customPluginsApi = {
	getPlugins: () => api.get<CustomPlugin[]>('/custom-plugins'),

	getInventory: (id: number) =>
		api.get<CustomPluginInventory>(`/custom-plugins/${id}/inventory`),

	scanAll: () =>
		api.post<{ count: number; jobs: unknown[] }>('/plugin-scans/bulk/scan', {}),

	checkVersions: (id: number) =>
		api.post<{ latest_version: string | null; updated: number }>(
			`/custom-plugins/${id}/check-versions`,
			{},
		),

	updateInstalled: (id: number) =>
		api.post<{ count: number; jobs: unknown[] }>(
			`/custom-plugins/${id}/update-installed`,
			{},
		),

	createPlugin: (data: PluginFormData) =>
		api.post<CustomPlugin>('/custom-plugins', data),

	updatePlugin: (id: number, data: PluginFormData) =>
		api.put<CustomPlugin>(`/custom-plugins/${id}`, data),

	deletePlugin: (id: number) => api.delete(`/custom-plugins/${id}`),
};
