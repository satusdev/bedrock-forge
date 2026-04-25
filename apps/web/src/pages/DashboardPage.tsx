import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
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
	RefreshCw,
	AlertTriangle,
	RotateCcw,
	X,
	ChevronDown,
	ChevronUp,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useWebSocketEvent } from '@/lib/websocket';
import { toast } from '@/hooks/use-toast';

interface JobItem {
	id: number;
	queue_name: string;
	job_type: string | null;
	status: string;
	progress: number;
	last_error?: string | null;
	payload?: Record<string, unknown> | null;
	created_at: string;
	environment?: { id?: number; url: string; project?: { id: number; name: string } } | null;
}

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
	recentJobs: JobItem[];
	runningJobs: JobItem[];
	failedJobs24h: JobItem[];
}

interface AttentionItem {
	id: string;
	severity: 'critical' | 'warning' | 'info';
	type: string;
	title: string;
	description: string;
	environmentId?: number;
	projectId?: number;
	projectName?: string;
	action: string;
	actionPayload: Record<string, unknown>;
}

interface HealthScore {
	environmentId: number;
	projectId: number;
	projectName: string;
	envType: string;
	url: string;
	score: number;
	breakdown: {
		backupRecency: number;
		uptimePct: number;
		domainExpiry: number;
		pluginScanFreshness: number;
		jobFailureRate: number;
	};
}

interface Summary24h {
	backupsSucceeded: number;
	backupsFailed: number;
	monitorDownEvents: number;
	monitorDownMinutesTotal: number;
	syncOperations: number;
	pluginUpdates: number;
}

function getRetryEndpoint(job: JobItem): { url: string; body: Record<string, unknown> } | null {
	const p = job.payload ?? {};
	if (job.queue_name === 'backups') {
		const envId = (p as { environmentId?: number }).environmentId;
		if (!envId) return null;
		return { url: '/backups/create', body: { environment_id: envId, type: (p as { type?: string }).type ?? 'full' } };
	}
	if (job.queue_name === 'sync') {
		const sourceId = (p as { sourceEnvironmentId?: number }).sourceEnvironmentId;
		const targetId = (p as { targetEnvironmentId?: number }).targetEnvironmentId;
		if (!sourceId || !targetId) return null;
		return { url: '/sync/clone', body: { source_environment_id: sourceId, target_environment_id: targetId } };
	}
	return null;
}

function getCancelEndpoint(job: JobItem): string | null {
	if (job.queue_name === 'backups') return `/backups/execution/${job.id}/cancel`;
	if (job.queue_name === 'sync') return `/sync/execution/${job.id}/cancel`;
	return null;
}

export function DashboardPage() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const { data: summary, isLoading } = useQuery<DashboardSummary>({
		queryKey: ['dashboard-summary'],
		queryFn: () => api.get('/dashboard/summary'),
		refetchInterval: 15_000,
	});

	const { data: attentionItems } = useQuery<AttentionItem[]>({
		queryKey: ['dashboard-attention'],
		queryFn: () => api.get('/dashboard/attention'),
		refetchInterval: 60_000,
	});

	const { data: healthScores } = useQuery<HealthScore[]>({
		queryKey: ['dashboard-health-scores'],
		queryFn: () => api.get('/dashboard/health-scores'),
		refetchInterval: 120_000,
	});

	const { data: summary24h } = useQuery<Summary24h>({
		queryKey: ['dashboard-summary-24h'],
		queryFn: () => api.get('/dashboard/summary-24h'),
		refetchInterval: 60_000,
	});

	useWebSocketEvent('job:completed', () => {
		void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
	});
	useWebSocketEvent('job:failed', () => {
		void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
	});
	useWebSocketEvent('job:progress', () => {
		void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
	});

	const cancelMutation = useMutation({
		mutationFn: (url: string) => api.post(url, {}),
		onSuccess: () => {
			toast({ title: 'Job cancelled' });
			void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
		},
		onError: () => toast({ title: 'Cancel failed', variant: 'destructive' }),
	});

	const retryMutation = useMutation({
		mutationFn: ({ url, body }: { url: string; body: Record<string, unknown> }) =>
			api.post(url, body),
		onSuccess: () => {
			toast({ title: 'Job re-queued' });
			void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
		},
		onError: () => toast({ title: 'Retry failed', variant: 'destructive' }),
	});

	const avgUptime = summary?.monitors.avgUptime;
	const runningJobs = summary?.runningJobs ?? [];
	const failedJobs24h = summary?.failedJobs24h ?? [];

	return (
		<div className='space-y-6'>
			<div className='flex items-center justify-between'>
				<h1 className='text-2xl font-bold'>Dashboard</h1>
			</div>

			{/* Quick Actions Bar */}
			<div className='flex flex-wrap gap-2 p-3 bg-muted/30 rounded-lg border'>
				<Button variant='outline' size='sm' onClick={() => navigate('/servers')}>
					<Server className='h-4 w-4 mr-1.5' />
					Add Server
				</Button>
				<Button variant='outline' size='sm' onClick={() => navigate('/projects')}>
					<FolderKanban className='h-4 w-4 mr-1.5' />
					New Project
				</Button>
				<Button variant='outline' size='sm' onClick={() => navigate('/backups')}>
					<HardDrive className='h-4 w-4 mr-1.5' />
					Run Backup
				</Button>
				<Button variant='outline' size='sm' onClick={() => navigate('/clients')}>
					<Plus className='h-4 w-4 mr-1.5' />
					Add Client
				</Button>
				<Button variant='outline' size='sm' onClick={() => navigate('/monitors')}>
					<Activity className='h-4 w-4 mr-1.5' />
					Monitors
				</Button>
			</div>

			{/* Stats Grid */}
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
					className={(summary?.domains.expiringSoon ?? 0) > 0 ? 'text-amber-500' : ''}
					icon={<Globe className='h-4 w-4' />}
				/>
			</div>

			{/* 24h Activity Summary */}
			{summary24h && (
				<div className='grid grid-cols-3 md:grid-cols-6 gap-3'>
					<div className='bg-card border rounded-md p-3 text-center'>
						<p className='text-xs text-muted-foreground mb-1'>Backups OK</p>
						<p className='text-xl font-semibold text-green-600'>{summary24h.backupsSucceeded}</p>
					</div>
					<div className='bg-card border rounded-md p-3 text-center'>
						<p className='text-xs text-muted-foreground mb-1'>Backups Failed</p>
						<p className={`text-xl font-semibold ${summary24h.backupsFailed > 0 ? 'text-destructive' : ''}`}>{summary24h.backupsFailed}</p>
					</div>
					<div className='bg-card border rounded-md p-3 text-center'>
						<p className='text-xs text-muted-foreground mb-1'>Down Events</p>
						<p className={`text-xl font-semibold ${summary24h.monitorDownEvents > 0 ? 'text-amber-500' : ''}`}>{summary24h.monitorDownEvents}</p>
					</div>
					<div className='bg-card border rounded-md p-3 text-center'>
						<p className='text-xs text-muted-foreground mb-1'>Down Minutes</p>
						<p className={`text-xl font-semibold ${summary24h.monitorDownMinutesTotal > 0 ? 'text-amber-500' : ''}`}>{summary24h.monitorDownMinutesTotal}</p>
					</div>
					<div className='bg-card border rounded-md p-3 text-center'>
						<p className='text-xs text-muted-foreground mb-1'>Syncs (24h)</p>
						<p className='text-xl font-semibold'>{summary24h.syncOperations}</p>
					</div>
					<div className='bg-card border rounded-md p-3 text-center'>
						<p className='text-xs text-muted-foreground mb-1'>Plugin Updates</p>
						<p className='text-xl font-semibold text-blue-500'>{summary24h.pluginUpdates}</p>
					</div>
				</div>
			)}

			<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
				{/* Monitor Health Summary */}
				<div>
					<div className='flex items-center justify-between mb-3'>
						<h2 className='text-lg font-semibold'>Monitor Health</h2>
						<Link to='/monitors' className='text-sm text-primary hover:underline'>
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
									{summary.monitors.total} monitor{summary.monitors.total !== 1 ? 's' : ''} total
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
									<span className='text-2xl font-bold text-green-600'>{summary.monitors.up}</span>
									<span className='text-sm text-muted-foreground'>up</span>
								</div>
								<div className='flex items-center gap-2'>
									<XCircle className='h-5 w-5 text-red-500' />
									<span className='text-2xl font-bold text-red-600'>{summary.monitors.down}</span>
									<span className='text-sm text-muted-foreground'>down</span>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Running Jobs */}
				<div>
					<div className='flex items-center justify-between mb-3'>
						<h2 className='text-lg font-semibold flex items-center gap-1.5'>
							<RefreshCw className='h-4 w-4 animate-spin' style={{ animationPlayState: runningJobs.length > 0 ? 'running' : 'paused' }} />
							Running Jobs
							{runningJobs.length > 0 && (
								<Badge variant='secondary' className='text-xs'>{runningJobs.length}</Badge>
							)}
						</h2>
						<Link to='/activity' className='text-sm text-primary hover:underline'>
							View all →
						</Link>
					</div>
					{isLoading ? (
						<div className='space-y-2'>
							{Array.from({ length: 2 }).map((_, i) => (
								<Skeleton key={i} className='h-14 w-full rounded-md' />
							))}
						</div>
					) : runningJobs.length === 0 ? (
						<p className='text-muted-foreground text-sm'>No running jobs.</p>
					) : (
						<div className='space-y-2'>
							{runningJobs.map(job => {
								const cancelUrl = getCancelEndpoint(job);
								return (
									<div key={job.id} className='flex items-center justify-between p-3 bg-card border rounded-md gap-3'>
										<div className='flex-1 min-w-0'>
											<div className='flex items-center gap-2 mb-1'>
												<span className='h-2 w-2 rounded-full bg-blue-500 animate-pulse shrink-0' />
												<span className='text-sm font-mono truncate'>{job.job_type ?? job.queue_name}</span>
												{job.environment?.project && (
													<span className='text-xs text-muted-foreground truncate'>— {job.environment.project.name}</span>
												)}
											</div>
											<div className='w-full bg-muted rounded-full h-1.5 overflow-hidden'>
												<div
													className='bg-primary h-1.5 rounded-full transition-all duration-500'
													style={{ width: `${job.progress ?? 0}%` }}
												/>
											</div>
											<span className='text-xs text-muted-foreground mt-0.5 inline-block'>{job.progress ?? 0}%</span>
										</div>
										{cancelUrl && (
											<Button
												variant='ghost'
												size='icon'
												className='h-7 w-7 shrink-0'
												title='Cancel'
												onClick={() => cancelMutation.mutate(cancelUrl)}
											>
												<X className='h-3.5 w-3.5' />
											</Button>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>

			{/* Failed Jobs (24h) */}
			{(isLoading || failedJobs24h.length > 0) && (
				<div>
					<div className='flex items-center justify-between mb-3'>
						<h2 className='text-lg font-semibold flex items-center gap-1.5'>
							<AlertTriangle className='h-4 w-4 text-destructive' />
							Failed Jobs (24h)
							{failedJobs24h.length > 0 && (
								<Badge variant='destructive' className='text-xs'>{failedJobs24h.length}</Badge>
							)}
						</h2>
						<Link to='/activity?status=failed' className='text-sm text-primary hover:underline'>
							View all →
						</Link>
					</div>
					{isLoading ? (
						<Skeleton className='h-20 w-full rounded-lg' />
					) : (
						<div className='space-y-2'>
							{failedJobs24h.map(job => {
								const retryEndpoint = getRetryEndpoint(job);
								return (
									<div key={job.id} className='flex items-start justify-between p-3 bg-card border border-destructive/20 rounded-md gap-3'>
										<div className='flex-1 min-w-0'>
											<div className='flex items-center gap-2 mb-0.5'>
												<span className='h-2 w-2 rounded-full bg-red-500 shrink-0' />
												<span className='text-sm font-mono truncate'>{job.job_type ?? job.queue_name}</span>
												{job.environment?.project && (
													<span className='text-xs text-muted-foreground truncate'>— {job.environment.project.name}</span>
												)}
											</div>
											{job.last_error && (
												<p className='text-xs text-destructive truncate pl-4'>{job.last_error}</p>
											)}
										</div>
										<div className='flex items-center gap-1 shrink-0'>
											<Link to='/activity'>
												<Button variant='ghost' size='sm' className='h-7 text-xs'>Logs</Button>
											</Link>
											{retryEndpoint && (
												<Button
													variant='outline'
													size='sm'
													className='h-7 text-xs gap-1'
													onClick={() => retryMutation.mutate(retryEndpoint)}
													disabled={retryMutation.isPending}
												>
													<RotateCcw className='h-3 w-3' />
													Retry
												</Button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}

			{/* Attention Items + Health Scores */}
			{((attentionItems && attentionItems.length > 0) || (healthScores && healthScores.length > 0)) && (
				<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
					{/* Attention Items */}
					{attentionItems && attentionItems.length > 0 && (
						<div>
							<h2 className='text-lg font-semibold flex items-center gap-1.5 mb-3'>
								<AlertTriangle className='h-4 w-4 text-amber-500' />
								Needs Attention
								<Badge variant='outline' className='text-xs ml-1'>{attentionItems.length}</Badge>
							</h2>
							<div className='space-y-2'>
								{attentionItems.slice(0, 8).map((item) => (
									<div
										key={item.id}
										className={`flex items-start gap-3 p-3 border rounded-md ${
											item.severity === 'critical'
												? 'border-destructive/40 bg-destructive/5'
												: item.severity === 'warning'
													? 'border-amber-500/40 bg-amber-500/5'
													: 'border-border bg-card'
										}`}
									>
										<span
											className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${
												item.severity === 'critical'
													? 'bg-destructive'
													: item.severity === 'warning'
														? 'bg-amber-500'
														: 'bg-blue-500'
											}`}
										/>
										<div className='flex-1 min-w-0'>
											<p className='text-sm font-medium truncate'>{item.title}</p>
											<p className='text-xs text-muted-foreground truncate'>{item.description}</p>
										</div>
										{item.projectId && (
											<Link to={`/projects/${item.projectId}`}>
												<Button variant='ghost' size='sm' className='h-6 text-xs shrink-0 px-2'>
													View
												</Button>
											</Link>
										)}
									</div>
								))}
							</div>
						</div>
					)}

					{/* Bottom Health Scores */}
					{healthScores && healthScores.length > 0 && (
						<div>
							<h2 className='text-lg font-semibold flex items-center gap-1.5 mb-3'>
								<ChevronDown className='h-4 w-4 text-muted-foreground' />
								Lowest Health Scores
							</h2>
							<div className='space-y-2'>
								{[...healthScores]
									.sort((a, b) => a.score - b.score)
									.slice(0, 5)
									.map((hs) => (
										<div key={hs.environmentId} className='flex items-center gap-3 p-3 bg-card border rounded-md'>
											<div className='flex-1 min-w-0'>
												<p className='text-sm font-medium truncate'>{hs.projectName}</p>
												<p className='text-xs text-muted-foreground truncate'>{hs.envType} · {hs.url}</p>
											</div>
											<Badge
												variant='outline'
												className={`text-sm font-bold shrink-0 ${
													hs.score < 50
														? 'border-destructive text-destructive'
														: hs.score < 75
															? 'border-amber-500 text-amber-500'
															: 'border-green-600 text-green-600'
												}`}
											>
												{hs.score}
											</Badge>
											<Link to={`/projects/${hs.projectId}`}>
												<Button variant='ghost' size='icon' className='h-7 w-7 shrink-0'>
													<ChevronUp className='h-3.5 w-3.5' />
												</Button>
											</Link>
										</div>
									))}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Recent Completed Activity */}
			<div>
				<div className='flex items-center justify-between mb-3'>
					<h2 className='text-lg font-semibold flex items-center gap-1.5'>
						<Activity className='h-4 w-4' />
						Recent Activity
					</h2>
					<Link to='/activity' className='text-sm text-primary hover:underline'>
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
									<span className='text-sm font-mono truncate'>{job.job_type ?? job.queue_name}</span>
								</div>
								<div className='flex items-center gap-2 shrink-0'>
									{job.status === 'active' && (
										<span className='text-xs text-muted-foreground'>{job.progress}%</span>
									)}
									<Badge variant='outline' className='text-xs capitalize'>{job.status}</Badge>
								</div>
							</div>
						))}
					</div>
				)}
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
