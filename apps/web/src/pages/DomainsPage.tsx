import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

interface Domain {
	id: number;
	domain: string;
	registrar: string | null;
	expires_at: string | null;
	last_checked_at: string | null;
}

const WARN_DAYS = 30;

function daysUntil(date: string | null): number | null {
	if (!date) return null;
	return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function ExpiryCell({ expires_at }: { expires_at: string | null }) {
	const days = daysUntil(expires_at);
	if (days === null) return <span className='text-muted-foreground'>—</span>;
	const cls =
		days < 0
			? 'text-red-600 dark:text-red-400 font-semibold'
			: days <= WARN_DAYS
				? 'text-yellow-600 dark:text-yellow-400 font-semibold'
				: 'text-muted-foreground';
	return (
		<span className={cls}>
			{new Date(expires_at!).toLocaleDateString()}
			{days < 0 && ' (expired)'}
			{days >= 0 && days <= WARN_DAYS && ` (${days}d)`}
		</span>
	);
}

export function DomainsPage() {
	const qc = useQueryClient();

	const { data, isLoading } = useQuery({
		queryKey: ['domains'],
		queryFn: () => api.get<{ items: Domain[]; total: number }>('/domains'),
	});

	const refresh = useMutation({
		mutationFn: (id: number) => api.post(`/domains/${id}/whois-refresh`, {}),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['domains'] }),
	});

	return (
		<div className='space-y-4'>
			<div className='flex items-center justify-between'>
				<h1 className='text-2xl font-bold'>Domains</h1>
				<span className='text-sm text-muted-foreground'>
					{data?.total ?? 0} total
				</span>
			</div>

			{isLoading && <p className='text-muted-foreground'>Loading…</p>}

			{data?.items && data.items.length > 0 && (
				<div className='overflow-x-auto'>
					<table className='w-full text-sm'>
						<thead>
							<tr className='border-b text-left text-muted-foreground'>
								<th className='pb-2 pr-4 font-medium'>Domain</th>
								<th className='pb-2 pr-4 font-medium'>Registrar</th>
								<th className='pb-2 pr-4 font-medium'>Expires</th>
								<th className='pb-2 pr-4 font-medium'>Last Checked</th>
								<th className='pb-2 font-medium' />
							</tr>
						</thead>
						<tbody className='divide-y'>
							{data.items.map(d => (
								<tr key={d.id}>
									<td className='py-3 pr-4 font-mono font-medium'>
										{d.domain}
									</td>
									<td className='py-3 pr-4 text-muted-foreground'>
										{d.registrar ?? '—'}
									</td>
									<td className='py-3 pr-4'>
										<ExpiryCell expires_at={d.expires_at} />
									</td>
									<td className='py-3 pr-4 text-muted-foreground text-xs'>
										{d.last_checked_at
											? new Date(d.last_checked_at).toLocaleString()
											: '—'}
									</td>
									<td className='py-3'>
										<button
											onClick={() => refresh.mutate(d.id)}
											disabled={refresh.isPending}
											className='text-xs text-primary underline disabled:opacity-40'
										>
											Refresh WHOIS
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{data?.items.length === 0 && (
				<p className='text-muted-foreground'>No domains yet.</p>
			)}
		</div>
	);
}
