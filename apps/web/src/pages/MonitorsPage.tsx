import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

interface Monitor {
	id: number;
	name: string;
	url: string;
	type: string;
	interval_seconds: number;
	is_active: boolean;
	last_checked_at: string | null;
	last_status: string | null;
	uptime_percentage: number;
}

function StatusDot({ status }: { status: string | null }) {
	if (!status)
		return <span className='inline-block w-2 h-2 rounded-full bg-muted' />;
	return (
		<span
			className={`inline-block w-2 h-2 rounded-full ${status === 'up' ? 'bg-green-500' : 'bg-red-500'}`}
		/>
	);
}

export function MonitorsPage() {
	const qc = useQueryClient();

	const { data, isLoading } = useQuery({
		queryKey: ['monitors'],
		queryFn: () => api.get<{ items: Monitor[]; total: number }>('/monitors'),
	});

	const toggle = useMutation({
		mutationFn: ({ id, active }: { id: number; active: boolean }) =>
			active
				? api.put(`/monitors/${id}/deactivate`, {})
				: api.put(`/monitors/${id}/activate`, {}),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['monitors'] }),
	});

	return (
		<div className='space-y-4'>
			<div className='flex items-center justify-between'>
				<h1 className='text-2xl font-bold'>Monitors</h1>
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
								<th className='pb-2 pr-4 font-medium'>Status</th>
								<th className='pb-2 pr-4 font-medium'>Name</th>
								<th className='pb-2 pr-4 font-medium'>URL</th>
								<th className='pb-2 pr-4 font-medium'>Type</th>
								<th className='pb-2 pr-4 font-medium'>Interval</th>
								<th className='pb-2 pr-4 font-medium'>Uptime</th>
								<th className='pb-2 pr-4 font-medium'>Last Check</th>
								<th className='pb-2 font-medium'>Active</th>
							</tr>
						</thead>
						<tbody className='divide-y'>
							{data.items.map(m => (
								<tr key={m.id}>
									<td className='py-3 pr-4'>
										<div className='flex items-center gap-2'>
											<StatusDot status={m.last_status} />
											<span
												className={`text-xs font-medium ${m.last_status === 'up' ? 'text-green-600 dark:text-green-400' : m.last_status === 'down' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
											>
												{m.last_status ?? 'pending'}
											</span>
										</div>
									</td>
									<td className='py-3 pr-4 font-medium'>{m.name}</td>
									<td className='py-3 pr-4'>
										<a
											href={m.url}
											target='_blank'
											rel='noopener noreferrer'
											className='font-mono text-xs text-primary underline truncate max-w-[200px] block'
										>
											{m.url}
										</a>
									</td>
									<td className='py-3 pr-4 capitalize'>{m.type}</td>
									<td className='py-3 pr-4'>{m.interval_seconds}s</td>
									<td className='py-3 pr-4'>
										<span
											className={`font-mono ${m.uptime_percentage >= 99 ? 'text-green-600 dark:text-green-400' : m.uptime_percentage >= 95 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}
										>
											{m.uptime_percentage.toFixed(2)}%
										</span>
									</td>
									<td className='py-3 pr-4 text-muted-foreground text-xs'>
										{m.last_checked_at
											? new Date(m.last_checked_at).toLocaleString()
											: '—'}
									</td>
									<td className='py-3'>
										<button
											onClick={() =>
												toggle.mutate({ id: m.id, active: m.is_active })
											}
											disabled={toggle.isPending}
											className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${m.is_active ? 'bg-primary' : 'bg-muted'}`}
										>
											<span
												className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${m.is_active ? 'translate-x-4' : 'translate-x-1'}`}
											/>
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{data?.items.length === 0 && (
				<p className='text-muted-foreground'>No monitors yet.</p>
			)}
		</div>
	);
}
