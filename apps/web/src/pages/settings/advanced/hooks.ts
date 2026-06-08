import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { advancedApi } from './api';

export function useAdvancedSettings() {
	return useQuery({
		queryKey: ['settings'],
		queryFn: advancedApi.getSettings,
	});
}

export function useUpdateSettingMutation(onSuccessCallback?: () => void) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ key, value }: { key: string; value: string }) =>
			advancedApi.updateSetting(key, value),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['settings'] });
			if (onSuccessCallback) onSuccessCallback();
			toast({ title: 'Setting updated' });
		},
		onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
	});
}

export function useDeleteSettingMutation(onSuccessCallback?: () => void) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (key: string) => advancedApi.deleteSetting(key),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['settings'] });
			if (onSuccessCallback) onSuccessCallback();
			toast({ title: 'Setting deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});
}
