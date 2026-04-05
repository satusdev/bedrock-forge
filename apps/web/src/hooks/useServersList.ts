import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface ServerListItem {
	id: number;
	name: string;
	ip_address: string;
	ssh_port: number;
	ssh_user: string;
}

/**
 * Fetch the full server list for use in dropdowns and selects.
 * Uses the shared `['servers-list']` cache key so all consumers share the same
 * cached response.
 */
export function useServersList(
	options?: Partial<UseQueryOptions<ServerListItem[]>>,
) {
	return useQuery<ServerListItem[]>({
		queryKey: ['servers-list'],
		queryFn: () =>
			api
				.get<{ items: ServerListItem[] }>('/servers?limit=200')
				.then(r => r.items),
		staleTime: 60_000,
		...options,
	});
}
