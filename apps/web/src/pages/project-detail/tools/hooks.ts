import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { toolsApi } from './api';
import { CleanupScheduleData } from './types';

export function useCleanupScheduleQuery(envId: number | null) {
	return useQuery({
		queryKey: ['cleanup-schedule', envId],
		queryFn: () => toolsApi.getCleanupSchedule(envId!),
		enabled: !!envId,
		staleTime: 30_000,
		retry: false,
	});
}

export function useDebugStatusQuery(envId: number | null) {
	return useQuery({
		queryKey: ['wp-debug-status', envId],
		queryFn: () => toolsApi.getDebugStatus(envId!),
		enabled: !!envId,
		staleTime: 30_000,
	});
}

export function useMaintenanceStatusQuery(envId: number | null) {
	return useQuery({
		queryKey: ['wp-maintenance-status', envId],
		queryFn: () => toolsApi.getMaintenanceStatus(envId!),
		enabled: !!envId,
		staleTime: 30_000,
		retry: false,
	});
}

export function useDebugMutation(envId: number | null, debugRevertMin: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ enabled }: { enabled: boolean }) =>
			toolsApi.toggleDebugMode(envId!, {
				enabled,
				revert_after_minutes: parseInt(debugRevertMin, 10) || 0,
			}),
		onSuccess: (_, { enabled }) => {
			toast({ title: `WP_DEBUG ${enabled ? 'enable' : 'disable'} queued` });
			qc.invalidateQueries({ queryKey: ['wp-debug-status', envId] });
		},
		onError: () => toast({ title: 'Failed to update WP_DEBUG mode', variant: 'destructive' }),
	});
}

export function useMaintenanceMutation(envId: number | null, maintenanceRevertMin: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ enabled }: { enabled: boolean }) =>
			toolsApi.toggleMaintenanceMode(envId!, {
				enabled,
				revert_after_minutes: parseInt(maintenanceRevertMin, 10) || 0,
			}),
		onSuccess: (_, { enabled }) => {
			toast({
				title: `Maintenance mode ${enabled ? 'enable' : 'disable'} queued`,
			});
			qc.invalidateQueries({ queryKey: ['wp-maintenance-status', envId] });
		},
		onError: () => toast({ title: 'Failed to update Maintenance mode', variant: 'destructive' }),
	});
}

export function useUpsertCleanupScheduleMutation(envId: number | null) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (form: CleanupScheduleData) =>
			toolsApi.upsertCleanupSchedule(envId!, form),
		onSuccess: () => {
			toast({ title: 'Cleanup schedule saved' });
			qc.invalidateQueries({ queryKey: ['cleanup-schedule', envId] });
		},
		onError: () =>
			toast({ title: 'Failed to save schedule', variant: 'destructive' }),
	});
}

export function useDeleteCleanupScheduleMutation(envId: number | null, onDeleted?: () => void) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => toolsApi.deleteCleanupSchedule(envId!),
		onSuccess: () => {
			toast({ title: 'Cleanup schedule removed' });
			qc.invalidateQueries({ queryKey: ['cleanup-schedule', envId] });
			if (onDeleted) onDeleted();
		},
		onError: () =>
			toast({ title: 'Failed to remove schedule', variant: 'destructive' }),
	});
}
