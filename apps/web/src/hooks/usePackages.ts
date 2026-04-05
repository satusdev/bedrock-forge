import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface PackageItem {
	id: number;
	name: string;
	price_monthly: number;
}

/**
 * Fetch both hosting and support package lists.
 * Shares cache with `['packages-hosting']` and `['packages-support']` keys.
 */
export function useHostingPackages() {
	return useQuery<PackageItem[]>({
		queryKey: ['packages-hosting'],
		queryFn: () => api.get<PackageItem[]>('/packages/hosting'),
		staleTime: 120_000,
	});
}

export function useSupportPackages() {
	return useQuery<PackageItem[]>({
		queryKey: ['packages-support'],
		queryFn: () => api.get<PackageItem[]>('/packages/support'),
		staleTime: 120_000,
	});
}
