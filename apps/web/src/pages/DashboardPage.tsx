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
	Shield,
	Zap,
	Calendar,
	ArrowUpRight,
} from 'lucide-react';
import {
	AreaChart,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	PieChart,
	Pie,
	Cell,
} from 'recharts';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useWebSocketEvent } from '@/lib/websocket';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ── Mock History Data for Visual Excellence ──────────────────────────────
const MOCK_ACTIVITY_DATA = [
	{ date: 'Mon', backups: 12, syncs: 5, alerts: 1 },
	{ date: 'Tue', backups: 15, syncs: 8, alerts: 0 },
	{ date: 'Wed', backups: 10, syncs: 4, alerts: 2 },
	{ date: 'Thu', backups: 22, syncs: 12, alerts: 0 },
	{ date: 'Fri', backups: 18, syncs: 7, alerts: 1 },
	{ date: 'Sat', backups: 8, syncs: 2, alerts: 0 },
	{ date: 'Sun', backups: 25, syncs: 15, alerts: 0 },
];

const HEALTH_COLORS = ['#22c55e', '#eab308', '#ef4444'];

interface JobItem {
	id: number;
	queue_name: string;
	job_type: string | null;
	status: string;
	progress: number;
	last_error?: string | null;
	payload?: Record<string, unknown> | null;
	created_at: string;
	environment?: {
		id?: number;
		url: string;
		project?: { id: number; name: string };
	} | null;
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

function getRetryEndpoint(
	job: JobItem,
): { url: string; body: Record<string, unknown> } | null {
	const p = job.payload ?? {};
	if (job.queue_name === 'backups') {
		const envId = (p as { environmentId?: number }).environmentId;
		if (!envId) return null;
		return {
			url: '/backups/create',
			body: {
				environment_id: envId,
				type: (p as { type?: string }).type ?? 'full',
			},
		};
	}
	if (job.queue_name === 'sync') {
		const sourceId = (p as { sourceEnvironmentId?: number }).sourceEnvironmentId;
		const targetId = (p as { targetEnvironmentId?: number }).targetEnvironmentId;
		if (!sourceId || !targetId) return null;
		return {
			url: '/sync/clone',
			body: {
				source_environment_id: sourceId,
				target_environment_id: targetId,
			},
		};
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
		mutationFn: ({
			url,
			body,
		}: {
			url: string;
			body: Record<string, unknown>;
		}) => api.post(url, body),
		onSuccess: () => {
			toast({ title: 'Job re-queued' });
			void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
		},
		onError: () => toast({ title: 'Retry failed', variant: 'destructive' }),
	});

	const avgUptime = summary?.monitors.avgUptime;
	const runningJobs = summary?.runningJobs ?? [];
	const failedJobs24h = summary?.failedJobs24h ?? [];

	// Prepare Health Data for Pie Chart
	const healthData = healthScores
		? [
				{
					name: 'Healthy',
					value: healthScores.filter(s => s.score >= 90).length,
				},
				{
					name: 'Warning',
					value: healthScores.filter(s => s.score < 90 && s.score >= 70).length,
				},
				{
					name: 'Critical',
					value: healthScores.filter(s => s.score < 70).length,
				},
			].filter(d => d.value > 0)
		: [];

	return (
		<div className='space-y-6'>
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-3xl font-bold tracking-tight'>Dashboard</h1>
					<p className='text-muted-foreground'>
						Welcome back. Here is what&apos;s happening with your projects today.
					</p>
				</div>
				<div className='flex items-center gap-2'>
					<Button variant='outline' size='sm' className='h-9'>
						<Calendar className='h-4 w-4 mr-2' />
						Last 7 Days
					</Button>
					<Button
						size='sm'
						className='h-9 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20'
						onClick={() => navigate('/projects')}
					>
						<Plus className='h-4 w-4 mr-2' />
						New Project
					</Button>
				</div>
			</div>

			{/* Stats Grid */}
			<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
				<StatCard
					label='Active Projects'
					value={summary?.projects.total}
					isLoading={isLoading}
					href='/projects'
					icon={<FolderKanban className='h-5 w-5 text-blue-500' />}
					trend='+2 from last week'
				/>
				<StatCard
					label='Managed Servers'
					value={summary?.servers.total}
					isLoading={isLoading}
					href='/servers'
					icon={<Server className='h-5 w-5 text-purple-500' />}
					trend='All systems operational'
				/>
				<StatCard
					label='Uptime Rate'
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
							: 'text-green-500'
					}
					icon={<Activity className='h-5 w-5 text-green-500' />}
					trend='Last 24 hours'
				/>
				<StatCard
					label='Security Posture'
					value='AF-Secure'
					isLoading={isLoading}
					href='/security'
					className='text-blue-500'
					icon={<Shield className='h-5 w-5 text-blue-500' />}
					trend='3 active hardening rules'
				/>
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
				{/* Activity Chart */}
				<Card className='lg:col-span-2'>
					<CardHeader className='flex flex-row items-center justify-between pb-2'>
						<CardTitle className='text-base font-semibold'>
							System Activity
						</CardTitle>
						<Zap className='h-4 w-4 text-yellow-500' />
					</CardHeader>
					<CardContent>
						<div className='h-[300px] w-full mt-4'>
							<ResponsiveContainer width='100%' height='100%'>
								<AreaChart data={MOCK_ACTIVITY_DATA}>
									<defs>
										<linearGradient id='colorBackups' x1='0' y1='0' x2='0' y2='1'>
											<stop offset='5%' stopColor='#3b82f6' stopOpacity={0.3} />
											<stop offset='95%' stopColor='#3b82f6' stopOpacity={0} />
										</linearGradient>
										<linearGradient id='colorSyncs' x1='0' y1='0' x2='0' y2='1'>
											<stop offset='5%' stopColor='#10b981' stopOpacity={0.3} />
											<stop offset='95%' stopColor='#10b981' stopOpacity={0} />
										</linearGradient>
									</defs>
									<CartesianGrid
										strokeDasharray='3 3'
										vertical={false}
										stroke='#f0f0f0'
									/>
									<XAxis
										dataKey='date'
										axisLine={false}
										tickLine={false}
										tick={{ fontSize: 12, fill: '#888' }}
										dy={10}
									/>
									<YAxis hide />
									<Tooltip
										contentStyle={{
											borderRadius: '8px',
											border: 'none',
											boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
										}}
									/>
									<Area
										type='monotone'
										dataKey='backups'
										stroke='#3b82f6'
										strokeWidth={3}
										fillOpacity={1}
										fill='url(#colorBackups)'
									/>
									<Area
										type='monotone'
										dataKey='syncs'
										stroke='#10b981'
										strokeWidth={3}
										fillOpacity={1}
										fill='url(#colorSyncs)'
									/>
								</AreaChart>
							</ResponsiveContainer>
						</div>
						<div className='flex items-center gap-6 mt-4 justify-center text-xs text-muted-foreground'>
							<div className='flex items-center gap-2'>
								<span className='h-2 w-2 rounded-full bg-blue-500' />
								Backups Created
							</div>
							<div className='flex items-center gap-2'>
								<span className='h-2 w-2 rounded-full bg-green-500' />
								Environment Syncs
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Environment Health Pie */}
				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-base font-semibold'>
							Environment Health
						</CardTitle>
					</CardHeader>
					<CardContent className='flex flex-col items-center justify-center'>
						<div className='h-[200px] w-full relative'>
							<ResponsiveContainer width='100%' height='100%'>
								<PieChart>
									<Pie
										data={
											healthData.length > 0
												? healthData
												: [{ name: 'N/A', value: 1 }]
										}
										cx='50%'
										cy='50%'
										innerRadius={60}
										outerRadius={80}
										paddingAngle={5}
										dataKey='value'
									>
										{healthData.length > 0 ? (
											healthData.map((_, index) => (
												<Cell
													key={`cell-${index}`}
													fill={HEALTH_COLORS[index % HEALTH_COLORS.length]}
												/>
											))
										) : (
											<Cell fill='#e5e7eb' />
										)}
									</Pie>
									<Tooltip />
								</PieChart>
							</ResponsiveContainer>
							<div className='absolute inset-0 flex flex-col items-center justify-center pointer-events-none'>
								<span className='text-2xl font-bold'>
									{healthScores?.length || 0}
								</span>
								<span className='text-[10px] text-muted-foreground uppercase tracking-wider'>
									Environments
								</span>
							</div>
						</div>
						<div className='w-full space-y-2 mt-4'>
							<div className='flex items-center justify-between text-xs'>
								<div className='flex items-center gap-2'>
									<div className='h-2 w-2 rounded-full bg-green-500' />
									<span>Healthy</span>
								</div>
								<span className='font-semibold'>
									{healthData.find(d => d.name === 'Healthy')?.value || 0}
								</span>
							</div>
							<div className='flex items-center justify-between text-xs'>
								<div className='flex items-center gap-2'>
									<div className='h-2 w-2 rounded-full bg-yellow-500' />
									<span>Warning</span>
								</div>
								<span className='font-semibold'>
									{healthData.find(d => d.name === 'Warning')?.value || 0}
								</span>
							</div>
							<div className='flex items-center justify-between text-xs'>
								<div className='flex items-center gap-2'>
									<div className='h-2 w-2 rounded-full bg-red-500' />
									<span>Critical</span>
								</div>
								<span className='font-semibold'>
									{healthData.find(d => d.name === 'Critical')?.value || 0}
								</span>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			<div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
				{/* Attention Items */}
				<Card className='border-amber-500/20 bg-amber-500/[0.02]'>
					<CardHeader className='pb-3'>
						<CardTitle className='text-base font-semibold flex items-center gap-2 text-amber-600'>
							<AlertTriangle className='h-4 w-4' />
							Priority Attention
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-3'>
						{attentionItems && attentionItems.length > 0 ? (
							attentionItems.slice(0, 5).map(item => (
								<div
									key={item.id}
									className='flex items-start gap-3 p-3 bg-background border rounded-lg shadow-sm hover:shadow-md transition-shadow'
								>
									<div
										className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
											item.severity === 'critical'
												? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
												: 'bg-amber-500'
										}`}
									/>
									<div className='flex-1 min-w-0'>
										<p className='text-sm font-semibold truncate'>{item.title}</p>
										<p className='text-xs text-muted-foreground line-clamp-1 mt-0.5'>
											{item.description}
										</p>
									</div>
									<Link to={item.projectId ? `/projects/${item.projectId}` : '#'}>
										<Button variant='ghost' size='sm' className='h-8 px-2'>
											<ArrowUpRight className='h-4 w-4' />
										</Button>
									</Link>
								</div>
							))
						) : (
							<div className='text-center py-8 text-muted-foreground'>
								<CheckCircle2 className='h-8 w-8 mx-auto mb-2 opacity-20' />
								<p className='text-sm'>All systems operational</p>
							</div>
						)}
					</CardContent>
				</Card>

				{/* Running Jobs */}
				<Card>
					<CardHeader className='pb-3'>
						<CardTitle className='text-base font-semibold flex items-center gap-2'>
							<RefreshCw
								className={`h-4 w-4 ${runningJobs.length > 0 ? 'animate-spin' : ''}`}
							/>
							Active Processes
						</CardTitle>
					</CardHeader>
					<CardContent className='space-y-4'>
						{runningJobs.length > 0 ? (
							runningJobs.map(job => (
								<div key={job.id} className='space-y-2'>
									<div className='flex items-center justify-between text-xs font-medium'>
										<span className='capitalize'>
											{job.job_type || job.queue_name}
										</span>
										<span>{job.progress}%</span>
									</div>
									<div className='h-2 bg-muted rounded-full overflow-hidden'>
										<div
											className='h-full bg-blue-500 transition-all duration-1000'
											style={{ width: `${job.progress}%` }}
										/>
									</div>
									<p className='text-[10px] text-muted-foreground truncate'>
										Project: {job.environment?.project?.name || 'System'}
									</p>
								</div>
							))
						) : (
							<div className='text-center py-8 text-muted-foreground'>
								<Zap className='h-8 w-8 mx-auto mb-2 opacity-20' />
								<p className='text-sm'>No active background jobs</p>
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Recent Completed Activity */}
			<Card>
				<CardHeader className='flex flex-row items-center justify-between pb-3'>
					<CardTitle className='text-base font-semibold'>
						Recent Completed Activity
					</CardTitle>
					<Link
						to='/activity'
						className='text-xs text-primary hover:underline font-medium'
					>
						View full log
					</Link>
				</CardHeader>
				<CardContent className='px-0'>
					<div className='divide-y border-t'>
						{(summary?.recentJobs || []).slice(0, 8).map(job => (
							<div
								key={job.id}
								className='flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors'
							>
								<div className='flex items-center gap-3'>
									<div
										className={`h-2 w-2 rounded-full ${
											job.status === 'completed'
												? 'bg-green-500'
												: job.status === 'failed'
													? 'bg-red-500'
													: 'bg-blue-500 animate-pulse'
										}`}
									/>
									<div>
										<p className='text-sm font-medium capitalize'>
											{job.job_type || job.queue_name}
										</p>
										<p className='text-[10px] text-muted-foreground'>
											{new Date(job.created_at).toLocaleString()}
										</p>
									</div>
								</div>
								<Badge variant='outline' className='text-[10px] uppercase'>
									{job.status}
								</Badge>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function StatCard({
	label,
	value,
	href,
	className = '',
	isLoading = false,
	icon,
	trend,
}: {
	label: string;
	value?: number | string;
	href?: string;
	className?: string;
	isLoading?: boolean;
	icon?: React.ReactNode;
	trend?: string;
}) {
	const content = (
		<Card className='hover:border-primary/40 transition-colors shadow-sm group'>
			<CardContent className='pt-6'>
				<div className='flex items-center justify-between'>
					{icon}
					<ArrowUpRight className='h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity' />
				</div>
				<div className='mt-3'>
					<p className='text-2xl font-bold tracking-tight'>
						{isLoading ? <Skeleton className='h-8 w-16' /> : value ?? '—'}
					</p>
					<p className='text-xs font-medium text-muted-foreground mt-1'>
						{label}
					</p>
				</div>
				{trend && (
					<div className='mt-4 flex items-center gap-1'>
						<span className='text-[10px] text-muted-foreground font-medium'>
							{trend}
						</span>
					</div>
				)}
			</CardContent>
		</Card>
	);

	if (href) return <Link to={href}>{content}</Link>;
	return content;
}
