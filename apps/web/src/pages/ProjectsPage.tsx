import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

interface Project {
	id: number;
	name: string;
	client: { name: string };
	server: { name: string };
	status: string;
}

export function ProjectsPage() {
	const { data, isLoading } = useQuery({
		queryKey: ['projects'],
		queryFn: () => api.get<{ items: Project[]; total: number }>('/projects'),
	});

	return (
		<div className='space-y-4'>
			<div className='flex items-center justify-between'>
				<h1 className='text-2xl font-bold'>Projects</h1>
				<span className='text-sm text-muted-foreground'>
					{data?.total ?? 0} total
				</span>
			</div>
			{isLoading && <p className='text-muted-foreground'>Loading…</p>}
			<div className='grid gap-4'>
				{data?.items.map(p => (
					<div key={p.id} className='bg-card border rounded-lg p-4'>
						<div className='flex items-center justify-between'>
							<h3 className='font-semibold'>{p.name}</h3>
							<span className='text-xs bg-muted px-2 py-0.5 rounded-full'>
								{p.status}
							</span>
						</div>
						<div className='flex gap-4 mt-2 text-sm text-muted-foreground'>
							<span>Client: {p.client.name}</span>
							<span>Server: {p.server.name}</span>
						</div>
					</div>
				))}
				{data?.items.length === 0 && (
					<p className='text-muted-foreground'>No projects yet.</p>
				)}
			</div>
		</div>
	);
}
