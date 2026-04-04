import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
	Server,
	FolderKanban,
	HardDrive,
	Plus,
	Activity,
	Users,
	Globe,
	CheckCircle2,
	XCircle,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWebSocketEvent } from '@/lib/websocket';
import { Badge } from '@/components/ui/badge';

interface DashboardSummary {
	projects: { total: number };
	servers: { total: number };
	clients: { total: number };
	monitors: {
		total: number;
		up: number;
		down: number;
		avgUptime: number | null;
	};
	domains: { expiringSoon: number };
	recentJobs: {
		id: number;
		queue_name: string;
		job_type: string | null;
		status: string;
		progress: number;
		created_at: string;
		environment?: { url: string } | null;
	}[];
}

export function DashboardPage() {
	const queryClient = useQueryClient();

	const { data: summary, isLoading } = useQuery<DashboardSummary>({
		queryKey: ['dashboard-summary'],
		queryFn: () => api.get('/dashboard/summary'),
		refetchInterval: 15_000,
	});

	// Refresh summary on any job event over WebSocket
	useWebSocketEvent('job:completed', () => {
		void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
	});
	useWebSocketEvent('job:failed', () => {
		void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
	});

	const avgUptime = summary?.monitors.avgUptime;

	return (
		<div className='space-y-6'>
			<h1 className='text-2xl font-bold'>Dashboard</h1>

			<div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4'>
				<StatCard
					label='Projects'
					value={summary?.projects.total}
					isLoading={isLoading}
					href='/projects'
					icon={<FolderKanban className='h-4 w-4' />}
				/>
				<StatCard
					label='Servers'
					value={summary?.servers.total}
					isLoading={isLoading}
					href='/servers'
					icon={<Server className='h-4 w-4' />}
				/>
				<StatCard
					label='Clients'
					value={summary?.clients.total}
					isLoading={isLoading}
					href='/clients'
					icon={<Users className='h-4 w-4' />}
				/>
				<StatCard
					label='Avg Uptime'
					value={
						avgUptime !== null && avgUptime !== undefined
							? `${avgUptime}%`
							: undefined
					}
					isLoading={isLoading}
					href='/monitors'
					className={
						avgUptime !== null && avgUptime !== undefined && avgUptime < 99
							? 'text-yellow-500'
							: 'text-green-600'
					}
					icon={<Activity className='h-4 w-4' />}
				/>
				<StatCard
					label='Monitors'
					value={summary?.monitors.total}
					isLoading={isLoading}
					href='/monitors'
					icon={<Activity className='h-4 w-4' />}
				/>
				<StatCard
					label='Domains Expiring'
					value={summary?.domains.expiringSoon}
					isLoading={isLoading}
					href='/domains'
					className={
						(summary?.domains.expiringSoon ?? 0) > 0 ? 'text-amber-500' : ''
					}
					icon={<Globe className='h-4 w-4' />}
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

			<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
				{/* Monitor Health Summary */}
				<div>
					<div className='flex items-center justify-between mb-3'>
						<h2 className='text-lg font-semibold'>Monitor Health</h2>
						<Link
							to='/monitors'
							className='text-sm text-primary hover:underline'
						>
							View all →
						</Link>
					</div>
					{isLoading ? (
						<Skeleton className='h-28 w-full rounded-lg' />
					) : !summary || summary.monitors.total === 0 ? (
						<p className='text-muted-foreground text-sm'>
							No monitors configured.{' '}
							<Link to='/monitors' className='text-primary hover:underline'>
								Add one
							</Link>
						</p>
					) : (
						<div className='bg-card border rounded-lg p-4 space-y-3'>
							<div className='flex items-center justify-between'>
								<span className='text-sm text-muted-foreground'>
									{summary.monitors.total} monitor
									{summary.monitors.total !== 1 ? 's' : ''} total
								</span>
								<span className='text-sm font-medium'>
									{avgUptime !== null && avgUptime !== undefined
										? `${avgUptime}% avg uptime`
										: '—'}
								</span>
							</div>
							<div className='flex gap-4'>
								<div className='flex items-center gap-2'>
									<CheckCircle2 className='h-5 w-5 text-green-500' />
									<span className='text-2xl font-bold text-green-600'>
										{summary.monitors.up}
									</span>
									<span className='text-sm text-muted-foreground'>up</span>
								</div>
								<div className='flex items-center gap-2'>
									<XCircle className='h-5 w-5 text-red-500' />
									<span className='text-2xl font-bold text-red-600'>
										{summary.monitors.down}
									</span>
									<span className='text-sm text-muted-foreground'>down</span>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Recent Activity Feed */}
				<div>
					<div className='flex items-center justify-between mb-3'>
						<h2 className='text-lg font-semibold flex items-center gap-1.5'>
							<Activity className='h-4 w-4' />
							Recent Activity
						</h2>
						<Link
							to='/activity'
							className='text-sm text-primary hover:underline'
						>
							View all →
						</Link>
					</div>
					{isLoading ? (
						<div className='space-y-2'>
							{Array.from({ length: 4 }).map((_, i) => (
								<Skeleton key={i} className='h-12 w-full rounded-md' />
							))}
						</div>
					) : !summary?.recentJobs.length ? (
						<p className='text-muted-foreground text-sm'>No recent jobs.</p>
					) : (
						<div className='space-y-2'>
							{summary.recentJobs.map(job => (
								<div
									key={job.id}
									className='flex items-center justify-between p-3 bg-card border rounded-md gap-2'
								>
									<div className='flex items-center gap-2 min-w-0'>
										<StatusDot status={job.status} />
										<span className='text-sm font-mono truncate'>
											{job.job_type ?? job.queue_name}
										</span>
									</div>
									<div className='flex items-center gap-2 shrink-0'>
										{job.status === 'active' && (
											<span className='text-xs text-muted-foreground'>
												{job.progress}%
											</span>
										)}
										<Badge variant='outline' className='text-xs capitalize'>
											{job.status}
										</Badge>
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function StatusDot({ status }: { status: string }) {
	const color =
		status === 'completed'
			? 'bg-green-500'
			: status === 'failed' || status === 'dead_letter'
				? 'bg-red-500'
				: status === 'active'
					? 'bg-blue-500 animate-pulse'
					: 'bg-muted-foreground';
	return <span className={`h-2 w-2 rounded-full shrink-0 ${color}`} />;
}

function StatCard({
	label,
	value,
	href,
	className = '',
	isLoading = false,
	icon,
}: {
	label: string;
	value?: number | string;
	href?: string;
	className?: string;
	isLoading?: boolean;
	icon?: React.ReactNode;
}) {
	const inner = (
		<div className='bg-card border rounded-lg p-4 transition-colors hover:bg-muted/30'>
			<div className='flex items-center justify-between mb-1'>
				<p className='text-sm text-muted-foreground'>{label}</p>
				{icon && <span className='text-muted-foreground'>{icon}</span>}
			</div>
			{isLoading ? (
				<Skeleton className='h-9 w-16 mt-1' />
			) : (
				<p className={`text-3xl font-bold mt-1 ${className}`}>{value ?? '—'}</p>
			)}
		</div>
	);
	return href ? <Link to={href}>{inner}</Link> : inner;
}
