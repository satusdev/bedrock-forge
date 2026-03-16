import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

interface Server {
	id: number;
	name: string;
	ip_address: string;
	ssh_username: string;
	status: string;
}

export function ServersPage() {
	const { data, isLoading } = useQuery({
		queryKey: ['servers'],
		queryFn: () => api.get<Server[]>('/servers'),
	});

	return (
		<div className='space-y-4'>
			<h1 className='text-2xl font-bold'>Servers</h1>
			{isLoading && <p className='text-muted-foreground'>Loading…</p>}
			<div className='bg-card border rounded-lg overflow-hidden'>
				<table className='w-full text-sm'>
					<thead className='border-b bg-muted/40'>
						<tr>
							<th className='text-left px-4 py-3 font-medium'>Name</th>
							<th className='text-left px-4 py-3 font-medium'>IP Address</th>
							<th className='text-left px-4 py-3 font-medium'>SSH User</th>
							<th className='text-left px-4 py-3 font-medium'>Status</th>
						</tr>
					</thead>
					<tbody className='divide-y'>
						{data?.map(s => (
							<tr key={s.id} className='hover:bg-muted/20'>
								<td className='px-4 py-3 font-medium'>{s.name}</td>
								<td className='px-4 py-3 font-mono text-muted-foreground'>
									{s.ip_address}
								</td>
								<td className='px-4 py-3 text-muted-foreground'>
									{s.ssh_username}
								</td>
								<td className='px-4 py-3'>
									<span
										className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}
									>
										{s.status}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				{data?.length === 0 && (
					<p className='text-center text-muted-foreground py-8'>
						No servers yet.
					</p>
				)}
			</div>
		</div>
	);
}
