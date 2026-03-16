import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export function DashboardPage() {
	const { data: clients } = useQuery({
		queryKey: ['clients'],
		queryFn: () => api.get<{ total: number }>('/clients?limit=1'),
	});
	const { data: servers } = useQuery({
		queryKey: ['servers'],
		queryFn: () => api.get<unknown[]>('/servers'),
	});
	const { data: monitors } = useQuery({
		queryKey: ['monitors'],
		queryFn: () =>
			api.get<
				{
					id: number;
					name: string;
					last_is_up: boolean;
					uptime_percentage: number;
				}[]
			>('/monitors'),
	});

	const upCount = monitors?.filter(m => m.last_is_up).length ?? 0;
	const downCount = (monitors?.length ?? 0) - upCount;

	return (
		<div className='space-y-6'>
			<h1 className='text-2xl font-bold'>Dashboard</h1>

			<div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
				<StatCard label='Clients' value={(clients as any)?.total ?? '—'} />
				<StatCard label='Servers' value={servers?.length ?? '—'} />
				<StatCard
					label='Monitors Up'
					value={upCount}
					className='text-green-600'
				/>
				<StatCard
					label='Monitors Down'
					value={downCount}
					className={downCount > 0 ? 'text-destructive' : ''}
				/>
			</div>

			<div>
				<h2 className='text-lg font-semibold mb-3'>Monitor Status</h2>
				{monitors?.length === 0 && (
					<p className='text-muted-foreground text-sm'>
						No monitors configured.
					</p>
				)}
				<div className='space-y-2'>
					{monitors?.map(m => (
						<div
							key={m.id}
							className='flex items-center justify-between p-3 bg-card border rounded-md'
						>
							<div className='flex items-center gap-2'>
								<span
									className={`h-2 w-2 rounded-full ${m.last_is_up ? 'bg-green-500' : 'bg-red-500'}`}
								/>
								<span className='text-sm font-medium'>{m.name}</span>
							</div>
							<span className='text-xs text-muted-foreground'>
								{m.uptime_percentage?.toFixed(1)}% uptime
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function StatCard({
	label,
	value,
	className = '',
}: {
	label: string;
	value: number | string;
	className?: string;
}) {
	return (
		<div className='bg-card border rounded-lg p-4'>
			<p className='text-sm text-muted-foreground'>{label}</p>
			<p className={`text-3xl font-bold mt-1 ${className}`}>{value}</p>
		</div>
	);
}
