import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { billingApi } from './api';

export function useUpdateBillingSettingsMutation(onSuccessCallback?: () => void) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (data: { currency_code: string; currency_locale: string }) =>
			billingApi.saveBillingSettings(data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['settings'] });
			qc.invalidateQueries({ queryKey: ['settings', 'billing'] });
			if (onSuccessCallback) onSuccessCallback();
			toast({ title: 'Billing currency updated' });
		},
		onError: (err) =>
			toast({
				title: 'Failed to save billing settings',
				description: err instanceof Error ? err.message : undefined,
				variant: 'destructive',
			}),
	});
}
