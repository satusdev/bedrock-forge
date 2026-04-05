import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface ClientListItem {
	id: number;
	name: string;
}

/**
 * Fetch the full client list for use in dropdowns and selects.
 * Uses the shared `['clients-list']` cache key so all consumers share the same
 * cached response and invalidations propagate everywhere.
 */
export function useClientsList(
	options?: Partial<UseQueryOptions<ClientListItem[]>>,
) {
	return useQuery<ClientListItem[]>({
		queryKey: ['clients-list'],
		queryFn: () =>
			api
				.get<{ items: ClientListItem[] }>('/clients?limit=200')
				.then(r => r.items),
		staleTime: 60_000,
		...options,
	});
}
