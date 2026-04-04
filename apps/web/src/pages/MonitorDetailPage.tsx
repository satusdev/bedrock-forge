import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
	ArrowLeft,
	Activity,
	Clock,
	TrendingUp,
	Wifi,
	WifiOff,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// ── Types ────────────────────────────────────────────────────────────────────

interface MonitorDetail {
	id: number;
	enabled: boolean;
	interval_seconds: number;
	uptime_pct: number | string;
	last_status: number | null;
	last_response_ms: number | null;
	last_checked_at: string | null;
	environment: { id: number; url: string; type: string };
	monitor_results: MonitorResult[];
}

interface MonitorResult {
	id: number;
	is_up: boolean;
	status_code: number;
	response_ms: number;
	checked_at: string;
}

interface MonitorLog {
	id: number;
	event_type: 'down' | 'up' | 'degraded';
	status_code: number | null;
	response_ms: number | null;
	message: string | null;
	occurred_at: string;
	resolved_at: string | null;
	duration_seconds: number | null;
}

interface PaginatedLogs {
	items: MonitorLog[];
	total: number;
	page: number;
	limit: number;
}

interface PaginatedResults {
	items: MonitorResult[];
	total: number;
	page: number;
	limit: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isUp(statusCode: number | null): boolean {
	return statusCode !== null && statusCode >= 200 && statusCode < 400;
}

function formatDuration(seconds: number | null): string {
	if (seconds === null) return '—';
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	return `${h}h ${m}m`;
}

function StatusDot({ statusCode }: { statusCode: number | null }) {
	if (statusCode === null)
		return (
			<span className='inline-block w-2.5 h-2.5 rounded-full bg-muted shrink-0' />
		);
	return (
		<span
			className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
				isUp(statusCode) ? 'bg-green-500' : 'bg-red-500'
			}`}
		/>
	);
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function ResponseTimeSparkline({ results }: { results: MonitorResult[] }) {
	if (results.length < 2) {
		return (
			<div className='flex items-center justify-center h-20 text-xs text-muted-foreground'>
				Not enough data yet
			</div>
		);
	}

	// Reverse so oldest is leftmost
	const sorted = [...results].reverse();
	const values = sorted.map(r => r.response_ms);
	const max = Math.max(...values, 1);
	const min = Math.min(...values);
	const range = max - min || 1;

	const WIDTH = 600;
	const HEIGHT = 80;
	const PADDING = 4;

	const points = values.map((v, i) => {
		const x = PADDING + ((WIDTH - PADDING * 2) / (values.length - 1)) * i;
		const y = PADDING + (HEIGHT - PADDING * 2) * (1 - (v - min) / range);
		return `${x},${y}`;
	});

	const polylinePoints = points.join(' ');

	// Area fill path
	const first = points[0].split(',');
	const last = points[points.length - 1].split(',');
	const areaPath = `M${first[0]},${HEIGHT - PADDING} L${polylinePoints.replace(/ /g, ' L')} L${last[0]},${HEIGHT - PADDING} Z`;

	return (
		<div className='w-full'>
			<svg
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				className='w-full h-20 overflow-visible'
				preserveAspectRatio='none'
			>
				<defs>
					<linearGradient id='sparkGradient' x1='0' y1='0' x2='0' y2='1'>
						<stop
							offset='0%'
							stopColor='hsl(var(--primary))'
							stopOpacity='0.3'
						/>
						<stop
							offset='100%'
							stopColor='hsl(var(--primary))'
							stopOpacity='0.02'
						/>
					</linearGradient>
				</defs>
				<path d={areaPath} fill='url(#sparkGradient)' />
				<polyline
					points={polylinePoints}
					fill='none'
					stroke='hsl(var(--primary))'
					strokeWidth='2'
					strokeLinejoin='round'
					strokeLinecap='round'
					vectorEffect='non-scaling-stroke'
				/>
			</svg>
			<div className='flex justify-between text-xs text-muted-foreground mt-1'>
				<span>
					{sorted[0] ? new Date(sorted[0].checked_at).toLocaleTimeString() : ''}
				</span>
				<span className='font-medium'>Response time (ms)</span>
				<span>
					{sorted[sorted.length - 1]
						? new Date(
								sorted[sorted.length - 1].checked_at,
							).toLocaleTimeString()
						: ''}
				</span>
			</div>
		</div>
	);
}

// ── Incident Log ──────────────────────────────────────────────────────────────

function IncidentLog({ logs }: { logs: MonitorLog[] }) {
	if (logs.length === 0) {
		return (
			<div className='text-center py-8 text-sm text-muted-foreground'>
				No incidents recorded yet.
			</div>
		);
	}

	return (
		<div className='space-y-0 divide-y divide-border'>
			{logs.map(log => (
				<div key={log.id} className='flex items-start gap-3 py-3 px-1'>
					<div className='mt-0.5 shrink-0'>
						{log.event_type === 'down' ? (
							<WifiOff className='h-4 w-4 text-destructive' />
						) : log.event_type === 'up' ? (
							<Wifi className='h-4 w-4 text-green-500' />
						) : (
							<Activity className='h-4 w-4 text-yellow-500' />
						)}
					</div>
					<div className='flex-1 min-w-0'>
						<div className='flex items-center gap-2 flex-wrap'>
							<span
								className={`text-sm font-medium ${
									log.event_type === 'down'
										? 'text-destructive'
										: log.event_type === 'up'
											? 'text-green-600 dark:text-green-400'
											: 'text-yellow-600 dark:text-yellow-400'
								}`}
							>
								{log.event_type === 'down'
									? 'Down'
									: log.event_type === 'up'
										? 'Recovered'
										: 'Degraded'}
							</span>
							{log.status_code !== null && (
								<Badge variant='outline' className='text-xs font-mono'>
									HTTP {log.status_code}
								</Badge>
							)}
							{log.event_type === 'down' && log.duration_seconds !== null && (
								<span className='text-xs text-muted-foreground'>
									Duration: {formatDuration(log.duration_seconds)}
								</span>
							)}
							{log.event_type === 'down' && log.resolved_at === null && (
								<Badge variant='destructive' className='text-xs'>
									Ongoing
								</Badge>
							)}
						</div>
						{log.message && (
							<p className='text-xs text-muted-foreground mt-0.5'>
								{log.message}
							</p>
						)}
						<p className='text-xs text-muted-foreground mt-0.5'>
							{new Date(log.occurred_at).toLocaleString()}
							{log.resolved_at && (
								<> — resolved {new Date(log.resolved_at).toLocaleString()}</>
							)}
						</p>
					</div>
					{log.response_ms !== null && (
						<span className='text-xs text-muted-foreground font-mono shrink-0'>
							{log.response_ms}ms
						</span>
					)}
				</div>
			))}
		</div>
	);
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function MonitorDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const monitorId = Number(id);

	const { data: monitor, isLoading } = useQuery({
		queryKey: ['monitor', monitorId],
		queryFn: () => api.get<MonitorDetail>(`/monitors/${monitorId}`),
		refetchInterval: 30_000,
	});

	const { data: logsData, isLoading: logsLoading } = useQuery({
		queryKey: ['monitor-logs', monitorId],
		queryFn: () =>
			api.get<PaginatedLogs>(`/monitors/${monitorId}/logs?limit=20`),
		refetchInterval: 30_000,
	});

	const { data: resultsData } = useQuery({
		queryKey: ['monitor-results', monitorId],
		queryFn: () =>
			api.get<PaginatedResults>(`/monitors/${monitorId}/results?limit=100`),
		refetchInterval: 30_000,
	});

	if (isLoading) {
		return (
			<div className='space-y-4'>
				<Skeleton className='h-8 w-64' />
				<div className='grid grid-cols-1 sm:grid-cols-4 gap-4'>
					{[1, 2, 3, 4].map(i => (
						<Skeleton key={i} className='h-24 rounded-lg' />
					))}
				</div>
				<Skeleton className='h-32 rounded-lg' />
				<Skeleton className='h-64 rounded-lg' />
			</div>
		);
	}

	if (!monitor) {
		return (
			<div className='text-center py-8 text-muted-foreground'>
				Monitor not found.
			</div>
		);
	}

	const uptimePct = parseFloat(String(monitor.uptime_pct ?? 0));
	const results = resultsData?.items ?? monitor.monitor_results ?? [];
	const logs = logsData?.items ?? [];

	return (
		<div className='space-y-5'>
			{/* Header */}
			<div className='flex items-start gap-3'>
				<Button
					variant='ghost'
					size='icon'
					className='h-8 w-8 mt-0.5 shrink-0'
					onClick={() => navigate('/monitors')}
				>
					<ArrowLeft className='h-4 w-4' />
				</Button>
				<div className='flex-1 min-w-0'>
					<div className='flex items-center gap-2 flex-wrap'>
						<StatusDot statusCode={monitor.last_status} />
						<a
							href={monitor.environment.url}
							target='_blank'
							rel='noopener noreferrer'
							className='font-mono text-sm text-primary hover:underline truncate'
						>
							{monitor.environment.url}
						</a>
						<Badge variant='outline' className='text-xs capitalize'>
							{monitor.environment.type}
						</Badge>
						{!monitor.enabled && (
							<Badge variant='secondary' className='text-xs'>
								Paused
							</Badge>
						)}
					</div>
					<p className='text-xs text-muted-foreground mt-1'>
						Checks every {monitor.interval_seconds}s ·{' '}
						{monitor.last_checked_at
							? `Last checked ${new Date(monitor.last_checked_at).toLocaleString()}`
							: 'Never checked'}
					</p>
				</div>
			</div>

			{/* Stat cards */}
			<div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
				<Card>
					<CardHeader className='pb-1 pt-3 px-4'>
						<CardTitle className='text-xs text-muted-foreground font-normal'>
							Status
						</CardTitle>
					</CardHeader>
					<CardContent className='px-4 pb-3'>
						<p
							className={`text-xl font-semibold ${
								isUp(monitor.last_status)
									? 'text-green-600 dark:text-green-400'
									: monitor.last_status === null
										? 'text-muted-foreground'
										: 'text-destructive'
							}`}
						>
							{monitor.last_status === null
								? 'Pending'
								: isUp(monitor.last_status)
									? 'UP'
									: 'DOWN'}
						</p>
						{monitor.last_status !== null && (
							<p className='text-xs text-muted-foreground font-mono'>
								HTTP {monitor.last_status}
							</p>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='pb-1 pt-3 px-4'>
						<CardTitle className='text-xs text-muted-foreground font-normal flex items-center gap-1'>
							<TrendingUp className='h-3 w-3' /> Uptime
						</CardTitle>
					</CardHeader>
					<CardContent className='px-4 pb-3'>
						<p
							className={`text-xl font-semibold font-mono ${
								uptimePct >= 99
									? 'text-green-600 dark:text-green-400'
									: uptimePct >= 95
										? 'text-yellow-600 dark:text-yellow-400'
										: 'text-destructive'
							}`}
						>
							{uptimePct.toFixed(2)}%
						</p>
						<p className='text-xs text-muted-foreground'>30-day rolling</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='pb-1 pt-3 px-4'>
						<CardTitle className='text-xs text-muted-foreground font-normal flex items-center gap-1'>
							<Clock className='h-3 w-3' /> Response
						</CardTitle>
					</CardHeader>
					<CardContent className='px-4 pb-3'>
						<p className='text-xl font-semibold font-mono'>
							{monitor.last_response_ms !== null
								? `${monitor.last_response_ms}ms`
								: '—'}
						</p>
						<p className='text-xs text-muted-foreground'>Last check</p>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='pb-1 pt-3 px-4'>
						<CardTitle className='text-xs text-muted-foreground font-normal flex items-center gap-1'>
							<Activity className='h-3 w-3' /> Incidents
						</CardTitle>
					</CardHeader>
					<CardContent className='px-4 pb-3'>
						<p className='text-xl font-semibold'>
							{logs.filter(l => l.event_type === 'down').length}
						</p>
						<p className='text-xs text-muted-foreground'>
							{logsData?.total ?? 0} log entries
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Response time chart */}
			<Card>
				<CardHeader className='pb-2'>
					<CardTitle className='text-sm'>Response Time</CardTitle>
				</CardHeader>
				<CardContent>
					<ResponseTimeSparkline results={results} />
				</CardContent>
			</Card>

			{/* Incident history */}
			<Card>
				<CardHeader className='pb-2'>
					<CardTitle className='text-sm'>Incident History</CardTitle>
				</CardHeader>
				<CardContent className='px-4 pb-4'>
					{logsLoading ? (
						<div className='space-y-3'>
							{[1, 2, 3].map(i => (
								<Skeleton key={i} className='h-12 w-full' />
							))}
						</div>
					) : (
						<IncidentLog logs={logs} />
					)}
				</CardContent>
			</Card>

			{/* Raw check results table */}
			<Card>
				<CardHeader className='pb-2'>
					<CardTitle className='text-sm'>Recent Checks</CardTitle>
				</CardHeader>
				<CardContent className='p-0'>
					<div className='overflow-x-auto'>
						<table className='w-full text-xs'>
							<thead>
								<tr className='border-b bg-muted/50'>
									<th className='px-4 py-2.5 text-left font-medium text-muted-foreground'>
										Time
									</th>
									<th className='px-4 py-2.5 text-left font-medium text-muted-foreground'>
										Status
									</th>
									<th className='px-4 py-2.5 text-left font-medium text-muted-foreground'>
										HTTP Code
									</th>
									<th className='px-4 py-2.5 text-right font-medium text-muted-foreground'>
										Response
									</th>
								</tr>
							</thead>
							<tbody className='divide-y divide-border'>
								{results.slice(0, 50).map(r => (
									<tr
										key={r.id}
										className='hover:bg-muted/30 transition-colors'
									>
										<td className='px-4 py-2 text-muted-foreground font-mono'>
											{new Date(r.checked_at).toLocaleString()}
										</td>
										<td className='px-4 py-2'>
											<div className='flex items-center gap-1.5'>
												<StatusDot statusCode={r.status_code} />
												<span
													className={
														r.is_up
															? 'text-green-600 dark:text-green-400 font-medium'
															: 'text-destructive font-medium'
													}
												>
													{r.is_up ? 'UP' : 'DOWN'}
												</span>
											</div>
										</td>
										<td className='px-4 py-2 font-mono text-muted-foreground'>
											{r.status_code || '—'}
										</td>
										<td className='px-4 py-2 text-right font-mono'>
											{r.response_ms}ms
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
