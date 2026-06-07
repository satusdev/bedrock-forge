import { api } from '@/lib/api-client';
import {
	CleanupScheduleData,
	DebugStatus,
	MaintenanceStatus,
	LogResult,
	CronResult,
} from './types';

export const toolsApi = {
	getCleanupSchedule: async (envId: number): Promise<CleanupScheduleData | null> => {
		return api.get<CleanupScheduleData | null>(
			`/environments/${envId}/cleanup-schedule`,
		);
	},

	upsertCleanupSchedule: async (envId: number, form: CleanupScheduleData): Promise<unknown> => {
		return api.put(`/environments/${envId}/cleanup-schedule`, form);
	},

	deleteCleanupSchedule: async (envId: number): Promise<unknown> => {
		return api.delete(`/environments/${envId}/cleanup-schedule`);
	},

	getDebugStatus: async (envId: number): Promise<DebugStatus> => {
		return api.get(`/environments/${envId}/wp-actions/debug-status`);
	},

	toggleDebugMode: async (
		envId: number,
		payload: { enabled: boolean; revert_after_minutes: number },
	): Promise<unknown> => {
		return api.post(`/environments/${envId}/wp-actions/debug-mode`, payload);
	},

	getMaintenanceStatus: async (envId: number): Promise<MaintenanceStatus> => {
		return api.get(`/environments/${envId}/wp-actions/maintenance-status`);
	},

	toggleMaintenanceMode: async (
		envId: number,
		payload: { enabled: boolean; revert_after_minutes: number },
	): Promise<unknown> => {
		return api.post(`/environments/${envId}/wp-actions/maintenance-mode`, payload);
	},

	runQuickFix: async (envId: number, action: string): Promise<unknown> => {
		return api.post(`/environments/${envId}/wp-actions/fix`, { action });
	},

	getLogs: async (
		envId: number,
		logType: string,
		logLines: string,
	): Promise<LogResult> => {
		return api.get(
			`/environments/${envId}/wp-actions/logs?type=${logType}&lines=${logLines}`,
		);
	},

	getCronJobs: async (envId: number): Promise<CronResult> => {
		return api.get(`/environments/${envId}/wp-actions/cron`);
	},

	runCleanup: async (envId: number, dryRun: boolean): Promise<unknown> => {
		return api.post(`/environments/${envId}/wp-actions/cleanup`, { dry_run: dryRun });
	},
};
