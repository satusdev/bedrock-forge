import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Server, FolderKanban, HardDrive, Plus } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface CountResponse {
	total: number;
}

export function DashboardPage() {
	// 'clients-count' avoids cache collision with ClientsPage's ['clients', page, search]
	const { data: clientsData, isLoading: clientsLoading } = useQuery({
		queryKey: ['clients-count'],
		queryFn: () => api.get<CountResponse>('/clients?limit=1'),
	});
	const { data: serversData, isLoading: serversLoading } = useQuery({
		queryKey: ['servers-count'],
		queryFn: () => api.get<CountResponse>('/servers?limit=1'),
	});
	const { data: monitors, isLoading: monitorsLoading } = useQuery({
		queryKey: ['monitors'],
		queryFn: () =>
			api.get<
				{
					id: number;
					last_status: number | null;
					uptime_pct: number | string | null;
					environment: { url: string };
				}[]
			>('/monitors'),
	});

	const upCount =
		monitors?.filter(
			m =>
				m.last_status !== null && m.last_status >= 200 && m.last_status < 300,
		).length ?? 0;
	const downCount = (monitors?.length ?? 0) - upCount;

	return (
		<div className='space-y-6'>
			<h1 className='text-2xl font-bold'>Dashboard</h1>

			<div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
				<StatCard
					label='Clients'
					value={clientsData?.total}
					isLoading={clientsLoading}
					href='/clients'
				/>
				<StatCard
					label='Servers'
					value={serversData?.total}
					isLoading={serversLoading}
					href='/servers'
				/>
				<StatCard
					label='Monitors Up'
					value={upCount}
					isLoading={monitorsLoading}
					className='text-green-600'
					href='/monitors'
				/>
				<StatCard
					label='Monitors Down'
					value={downCount}
					isLoading={monitorsLoading}
					className={downCount > 0 ? 'text-destructive' : ''}
					href='/monitors'
				/>
			</div>

			{/* Quick Actions */}
			<div>
				<h2 className='text-lg font-semibold mb-3'>Quick Actions</h2>
				<div className='flex flex-wrap gap-3'>
					<Button asChild variant='outline' size='sm'>
						<Link to='/servers'>
							<Server className='h-4 w-4 mr-1.5' />
							Add Server
						</Link>
					</Button>
					<Button asChild variant='outline' size='sm'>
						<Link to='/projects'>
							<FolderKanban className='h-4 w-4 mr-1.5' />
							New Project
						</Link>
					</Button>
					<Button asChild variant='outline' size='sm'>
						<Link to='/backups'>
							<HardDrive className='h-4 w-4 mr-1.5' />
							New Backup
						</Link>
					</Button>
					<Button asChild variant='outline' size='sm'>
						<Link to='/clients'>
							<Plus className='h-4 w-4 mr-1.5' />
							Add Client
						</Link>
					</Button>
				</div>
			</div>

			<div>
				<div className='flex items-center justify-between mb-3'>
					<h2 className='text-lg font-semibold'>Monitor Status</h2>
					<Link to='/monitors' className='text-sm text-primary hover:underline'>
						View all →
					</Link>
				</div>
				{monitorsLoading ? (
					<div className='space-y-2'>
						{Array.from({ length: 3 }).map((_, i) => (
							<Skeleton key={i} className='h-12 w-full rounded-md' />
						))}
					</div>
				) : !monitors || monitors.length === 0 ? (
					<p className='text-muted-foreground text-sm'>
						No monitors configured.{' '}
						<Link to='/monitors' className='text-primary hover:underline'>
							Add one
						</Link>
					</p>
				) : (
					<div className='space-y-2'>
						{monitors.map(m => (
							<div
								key={m.id}
								className='flex items-center justify-between p-3 bg-card border rounded-md'
							>
								<div className='flex items-center gap-2'>
									<span
										className={`h-2 w-2 rounded-full ${
											m.last_status !== null &&
											m.last_status >= 200 &&
											m.last_status < 300
												? 'bg-green-500'
												: 'bg-red-500'
										}`}
									/>
									<span className='text-sm font-medium font-mono'>
										{m.environment.url}
									</span>
								</div>
								<span className='text-xs text-muted-foreground'>
									{parseFloat(String(m.uptime_pct ?? 0)).toFixed(1)}% uptime
								</span>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function StatCard({
	label,
	value,
	href,
	className = '',
	isLoading = false,
}: {
	label: string;
	value?: number | string;
	href?: string;
	className?: string;
	isLoading?: boolean;
}) {
	const inner = (
		<div className='bg-card border rounded-lg p-4 transition-colors hover:bg-muted/30'>
			<p className='text-sm text-muted-foreground'>{label}</p>
			{isLoading ? (
				<Skeleton className='h-9 w-16 mt-1' />
			) : (
				<p className={`text-3xl font-bold mt-1 ${className}`}>{value ?? '—'}</p>
			)}
		</div>
	);
	return href ? <Link to={href}>{inner}</Link> : inner;
}
