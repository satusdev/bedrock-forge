import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

interface Client {
	id: number;
	name: string;
	email?: string;
	website?: string;
}

export function ClientsPage() {
	const { data, isLoading } = useQuery({
		queryKey: ['clients'],
		queryFn: () => api.get<{ items: Client[]; total: number }>('/clients'),
	});

	return (
		<div className='space-y-4'>
			<div className='flex items-center justify-between'>
				<h1 className='text-2xl font-bold'>Clients</h1>
				<span className='text-sm text-muted-foreground'>
					{data?.total ?? 0} total
				</span>
			</div>

			{isLoading && <p className='text-muted-foreground'>Loading…</p>}

			<div className='bg-card border rounded-lg overflow-hidden'>
				<table className='w-full text-sm'>
					<thead className='border-b bg-muted/40'>
						<tr>
							<th className='text-left px-4 py-3 font-medium'>Name</th>
							<th className='text-left px-4 py-3 font-medium'>Email</th>
							<th className='text-left px-4 py-3 font-medium'>Website</th>
						</tr>
					</thead>
					<tbody className='divide-y'>
						{data?.items.map(c => (
							<tr key={c.id} className='hover:bg-muted/20'>
								<td className='px-4 py-3 font-medium'>{c.name}</td>
								<td className='px-4 py-3 text-muted-foreground'>
									{c.email ?? '—'}
								</td>
								<td className='px-4 py-3 text-muted-foreground'>
									{c.website ?? '—'}
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{data?.items.length === 0 && (
					<p className='text-center text-muted-foreground py-8'>
						No clients yet.
					</p>
				)}
			</div>
		</div>
	);
}
