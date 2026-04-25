import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	RefreshCw,
	Loader2,
	TerminalSquare,
	Bug,
	FileText,
	Clock,
	Trash2,
	Play,
	CalendarClock,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '@/components/ui/card';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface Environment {
	id: number;
	type: string;
	url?: string;
	root_path?: string;
	server: { name: string };
}

interface DebugStatus {
	success: boolean;
	was_enabled?: boolean;
	now_enabled?: boolean;
}

interface LogResult {
	success: boolean;
	file?: string;
	lines?: string[];
	error?: string;
}

interface CronJob {
	hook: string;
	schedule: string;
	next_run: string;
	next_run_timestamp: number;
	args: unknown[];
}

interface CronResult {
	success: boolean;
	source?: string;
	cron?: CronJob[];
	error?: string;
}

interface CleanupScheduleData {
	id?: number;
	enabled: boolean;
	frequency: string;
	hour: number;
	minute: number;
	day_of_week: number | null;
	day_of_month: number | null;
	keep_revisions: number;
	last_run_at?: string | null;
}

const DEFAULT_SCHEDULE: CleanupScheduleData = {
	enabled: true,
	frequency: 'weekly',
	hour: 3,
	minute: 30,
	day_of_week: 1,
	day_of_month: 1,
	keep_revisions: 3,
};

const WP_FIX_ACTIONS = [
	{
		value: 'flush_rewrite',
		label: 'Flush Rewrite Rules',
		description: 'Regenerate WordPress permalink rules',
	},
	{
		value: 'clear_cache',
		label: 'Clear Cache',
		description: 'Delete all transients and object cache',
	},
	{
		value: 'fix_permissions',
		label: 'Fix Permissions',
		description: 'Set 755 dirs, 644 files, chown to site owner',
	},
	{
		value: 'disable_plugins',
		label: 'Disable All Plugins',
		description: 'Rename plugins folder to disable all plugins',
	},
	{
		value: 'enable_plugins',
		label: 'Re-enable Plugins',
		description: 'Rename plugins-disabled folder back to plugins',
	},
] as const;

const REVERT_OPTIONS = [
	{ value: '0', label: 'Never' },
	{ value: '15', label: '15 minutes' },
	{ value: '30', label: '30 minutes' },
	{ value: '60', label: '1 hour' },
	{ value: '120', label: '2 hours' },
];

export function ToolsTab({ environments }: { environments: Environment[] }) {
	const [selectedEnvId, setSelectedEnvId] = useState<number | null>(
		environments.find(e => e.type === 'production')?.id ??
			environments[0]?.id ??
			null,
	);
	const [debugRevertMin, setDebugRevertMin] = useState('0');
	const [logType, setLogType] = useState<'debug' | 'php' | 'nginx' | 'apache'>(
		'debug',
	);
	const [logLines, setLogLines] = useState('100');
	const [lastFixResult, setLastFixResult] = useState<
		Record<string, 'success' | 'error'>
	>({});
	const [showCron, setShowCron] = useState(false);
	const [logOutput, setLogOutput] = useState<LogResult | null>(null);
	const [cronData, setCronData] = useState<CronResult | null>(null);

	const qc = useQueryClient();
	const selectedEnv = environments.find(e => e.id === selectedEnvId);
	const envBaseUrl = selectedEnvId
		? `/environments/${selectedEnvId}/wp-actions`
		: null;

	// ── Cleanup Schedule form state ────────────────────────────────────────────
	const [scheduleForm, setScheduleForm] =
		useState<CleanupScheduleData>(DEFAULT_SCHEDULE);

	const { data: cleanupSchedule, isLoading: scheduleLoading } =
		useQuery<CleanupScheduleData | null>({
			queryKey: ['cleanup-schedule', selectedEnvId],
			queryFn: () =>
				api.get<CleanupScheduleData | null>(
					`/environments/${selectedEnvId}/cleanup-schedule`,
				),
			enabled: !!selectedEnvId,
			staleTime: 30_000,
			retry: false,
		});

	useEffect(() => {
		if (cleanupSchedule) {
			setScheduleForm({
				enabled: cleanupSchedule.enabled ?? true,
				frequency: cleanupSchedule.frequency ?? 'weekly',
				hour: cleanupSchedule.hour ?? 3,
				minute: cleanupSchedule.minute ?? 30,
				day_of_week: cleanupSchedule.day_of_week ?? 1,
				day_of_month: cleanupSchedule.day_of_month ?? 1,
				keep_revisions: cleanupSchedule.keep_revisions ?? 3,
			});
		} else {
			setScheduleForm(DEFAULT_SCHEDULE);
		}
	}, [cleanupSchedule, selectedEnvId]);

	// ── Debug status ─────────────────────────────────────────────────────────
	const {
		data: debugStatus,
		isLoading: debugLoading,
		refetch: refetchDebug,
	} = useQuery<DebugStatus>({
		queryKey: ['wp-debug-status', selectedEnvId],
		queryFn: () => api.get(`${envBaseUrl}/debug-status`),
		enabled: !!selectedEnvId,
		staleTime: 30_000,
	});

	const debugEnabled =
		debugStatus?.now_enabled ?? debugStatus?.was_enabled ?? false;

	// ── Mutations ─────────────────────────────────────────────────────────────
	const fixMutation = useMutation({
		mutationFn: ({ action }: { action: string }) =>
			api.post(`${envBaseUrl}/fix`, { action }),
		onSuccess: (_, { action }) => {
			setLastFixResult(p => ({ ...p, [action]: 'success' }));
			toast({
				title: 'Action queued',
				description: `"${action}" is running in background`,
			});
		},
		onError: (_, { action }) => {
			setLastFixResult(p => ({ ...p, [action]: 'error' }));
			toast({ title: 'Failed to queue action', variant: 'destructive' });
		},
	});

	const debugMutation = useMutation({
		mutationFn: ({ enabled }: { enabled: boolean }) =>
			api.post(`${envBaseUrl}/debug-mode`, {
				enabled,
				revert_after_minutes: parseInt(debugRevertMin, 10) || 0,
			}),
		onSuccess: (_, { enabled }) => {
			toast({ title: `WP_DEBUG ${enabled ? 'enable' : 'disable'} queued` });
			void refetchDebug();
		},
		onError: () => toast({ title: 'Failed', variant: 'destructive' }),
	});

	const logsMutation = useMutation({
		mutationFn: () =>
			api.get(
				`${envBaseUrl}/logs?type=${logType}&lines=${logLines}`,
			) as Promise<LogResult>,
		onSuccess: (data: LogResult) => setLogOutput(data),
		onError: () =>
			toast({ title: 'Failed to fetch logs', variant: 'destructive' }),
	});

	const cronMutation = useMutation({
		mutationFn: () => api.get(`${envBaseUrl}/cron`) as Promise<CronResult>,
		onSuccess: (data: CronResult) => {
			setCronData(data);
			setShowCron(true);
		},
		onError: () =>
			toast({ title: 'Failed to fetch cron', variant: 'destructive' }),
	});

	const cleanupMutation = useMutation({
		mutationFn: ({ dryRun }: { dryRun: boolean }) =>
			api.post(`${envBaseUrl}/cleanup`, { dry_run: dryRun }),
		onSuccess: () => toast({ title: 'Cleanup job queued' }),
		onError: () => toast({ title: 'Failed', variant: 'destructive' }),
	});

	const upsertScheduleMutation = useMutation({
		mutationFn: (form: CleanupScheduleData) =>
			api.put(`/environments/${selectedEnvId}/cleanup-schedule`, form),
		onSuccess: () => {
			toast({ title: 'Cleanup schedule saved' });
			qc.invalidateQueries({ queryKey: ['cleanup-schedule', selectedEnvId] });
		},
		onError: () =>
			toast({ title: 'Failed to save schedule', variant: 'destructive' }),
	});

	const deleteScheduleMutation = useMutation({
		mutationFn: () =>
			api.delete(`/environments/${selectedEnvId}/cleanup-schedule`),
		onSuccess: () => {
			toast({ title: 'Cleanup schedule removed' });
			qc.invalidateQueries({ queryKey: ['cleanup-schedule', selectedEnvId] });
			setScheduleForm(DEFAULT_SCHEDULE);
		},
		onError: () =>
			toast({ title: 'Failed to remove schedule', variant: 'destructive' }),
	});

	if (!environments.length) {
		return (
			<p className='text-muted-foreground text-sm'>
				No environments configured.
			</p>
		);
	}

	return (
		<div className='space-y-6'>
			{/* Environment Selector */}
			<div className='flex items-center gap-3'>
				<Label className='text-sm font-medium shrink-0'>Environment:</Label>
				<Select
					value={String(selectedEnvId ?? '')}
					onValueChange={v => setSelectedEnvId(Number(v))}
				>
					<SelectTrigger className='w-56'>
						<SelectValue placeholder='Select environment' />
					</SelectTrigger>
					<SelectContent>
						{environments.map(e => (
							<SelectItem key={e.id} value={String(e.id)}>
								<span className='capitalize'>{e.type}</span>
								<span className='text-muted-foreground ml-1 text-xs'>
									— {e.server.name}
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{selectedEnv?.root_path && (
					<span className='text-xs text-muted-foreground font-mono'>
						{selectedEnv.root_path}
					</span>
				)}
			</div>

			{/* Quick Fix Actions */}
			<Card>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-base'>
						<TerminalSquare className='h-4 w-4' />
						Quick Fix Actions
					</CardTitle>
					<CardDescription>
						Run one-click WordPress maintenance actions remotely
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
						{WP_FIX_ACTIONS.map(({ value, label, description }) => {
							const result = lastFixResult[value];
							return (
								<div
									key={value}
									className='flex flex-col gap-1.5 p-3 border rounded-md bg-muted/30'
								>
									<div className='flex items-center justify-between'>
										<span className='text-sm font-medium'>{label}</span>
										{result === 'success' && (
											<Badge
												variant='outline'
												className='text-xs text-green-600 border-green-500'
											>
												Queued
											</Badge>
										)}
										{result === 'error' && (
											<Badge variant='destructive' className='text-xs'>
												Failed
											</Badge>
										)}
									</div>
									<p className='text-xs text-muted-foreground'>{description}</p>
									<Button
										variant='outline'
										size='sm'
										className='mt-1 self-start'
										disabled={!selectedEnvId || fixMutation.isPending}
										onClick={() => fixMutation.mutate({ action: value })}
									>
										{fixMutation.isPending &&
										fixMutation.variables?.action === value ? (
											<Loader2 className='h-3 w-3 animate-spin mr-1' />
										) : (
											<Play className='h-3 w-3 mr-1' />
										)}
										Run
									</Button>
								</div>
							);
						})}
					</div>
				</CardContent>
			</Card>

			{/* Debug Mode */}
			<Card>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-base'>
						<Bug className='h-4 w-4' />
						WP_DEBUG Mode
					</CardTitle>
					<CardDescription>
						Enable or disable WordPress debug logging.
						{selectedEnv?.type === 'production' && (
							<span className='text-amber-500 ml-1 font-medium'>
								⚠ Production environment — use with caution
							</span>
						)}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='flex flex-wrap items-center gap-6'>
						<div className='flex items-center gap-3'>
							{debugLoading ? (
								<Skeleton className='h-6 w-12 rounded-full' />
							) : (
								<Switch
									checked={debugEnabled}
									onCheckedChange={v => debugMutation.mutate({ enabled: v })}
									disabled={debugMutation.isPending || !selectedEnvId}
								/>
							)}
							<Label className='text-sm'>
								WP_DEBUG{' '}
								<Badge
									variant={debugEnabled ? 'destructive' : 'secondary'}
									className='text-xs ml-1'
								>
									{debugEnabled ? 'ENABLED' : 'disabled'}
								</Badge>
							</Label>
						</div>
						<div className='flex items-center gap-2'>
							<Label className='text-sm text-muted-foreground shrink-0'>
								Auto-revert:
							</Label>
							<Select value={debugRevertMin} onValueChange={setDebugRevertMin}>
								<SelectTrigger className='w-36'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{REVERT_OPTIONS.map(o => (
										<SelectItem key={o.value} value={o.value}>
											{o.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button
							variant='ghost'
							size='sm'
							onClick={() => void refetchDebug()}
							disabled={debugLoading || !selectedEnvId}
						>
							<RefreshCw className='h-3.5 w-3.5 mr-1' />
							Refresh
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Error Logs */}
			<Card>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-base'>
						<FileText className='h-4 w-4' />
						Error Logs
					</CardTitle>
					<CardDescription>
						Fetch and display recent log file entries
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-3'>
					<div className='flex flex-wrap items-center gap-3'>
						<Select
							value={logType}
							onValueChange={v => setLogType(v as typeof logType)}
						>
							<SelectTrigger className='w-32'>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value='debug'>WP Debug</SelectItem>
								<SelectItem value='php'>PHP Error</SelectItem>
								<SelectItem value='nginx'>Nginx</SelectItem>
								<SelectItem value='apache'>Apache</SelectItem>
							</SelectContent>
						</Select>
						<div className='flex items-center gap-2'>
							<Label className='text-sm text-muted-foreground'>Lines:</Label>
							<Input
								type='number'
								min='1'
								max='500'
								value={logLines}
								onChange={e => setLogLines(e.target.value)}
								className='w-20 h-9'
							/>
						</div>
						<Button
							variant='outline'
							size='sm'
							disabled={logsMutation.isPending || !selectedEnvId}
							onClick={() => logsMutation.mutate()}
						>
							{logsMutation.isPending ? (
								<Loader2 className='h-3.5 w-3.5 animate-spin mr-1' />
							) : (
								<FileText className='h-3.5 w-3.5 mr-1' />
							)}
							Fetch Logs
						</Button>
						{logOutput && (
							<span className='text-xs text-muted-foreground'>
								{logOutput.file}
							</span>
						)}
					</div>
					{logOutput && (
						<pre className='bg-muted text-xs rounded-md p-3 overflow-auto max-h-72 font-mono whitespace-pre-wrap'>
							{logOutput.lines?.length
								? logOutput.lines.join('\n')
								: (logOutput.error ?? 'No output')}
						</pre>
					)}
				</CardContent>
			</Card>

			{/* WP Cron */}
			<Card>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-base'>
						<Clock className='h-4 w-4' />
						WP Cron Jobs
					</CardTitle>
					<CardDescription>
						Inspect scheduled WordPress cron events
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-3'>
					<Button
						variant='outline'
						size='sm'
						disabled={cronMutation.isPending || !selectedEnvId}
						onClick={() => cronMutation.mutate()}
					>
						{cronMutation.isPending ? (
							<Loader2 className='h-3.5 w-3.5 animate-spin mr-1' />
						) : (
							<RefreshCw className='h-3.5 w-3.5 mr-1' />
						)}
						{showCron ? 'Reload Cron' : 'Load Cron'}
					</Button>
					{showCron && cronData?.cron && (
						<div className='border rounded-md overflow-auto max-h-72'>
							<table className='w-full text-sm'>
								<thead className='bg-muted'>
									<tr>
										<th className='text-left px-3 py-2 font-medium'>Hook</th>
										<th className='text-left px-3 py-2 font-medium'>
											Schedule
										</th>
										<th className='text-left px-3 py-2 font-medium'>
											Next Run
										</th>
									</tr>
								</thead>
								<tbody>
									{cronData.cron.map((job, i) => (
										<tr key={i} className='border-t hover:bg-muted/40'>
											<td className='px-3 py-2 font-mono text-xs break-all max-w-xs'>
												{job.hook}
											</td>
											<td className='px-3 py-2'>
												<Badge variant='outline' className='text-xs'>
													{job.schedule}
												</Badge>
											</td>
											<td className='px-3 py-2 text-xs text-muted-foreground'>
												{job.next_run}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
					{showCron && cronData?.error && (
						<p className='text-xs text-destructive'>{cronData.error}</p>
					)}
				</CardContent>
			</Card>

			{/* DB Cleanup */}
			<Card>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-base'>
						<Trash2 className='h-4 w-4' />
						DB Cleanup
					</CardTitle>
					<CardDescription>
						Remove post revisions, expired transients, spam comments, and
						orphaned postmeta
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='flex flex-wrap gap-3'>
						<Button
							variant='outline'
							size='sm'
							disabled={cleanupMutation.isPending || !selectedEnvId}
							onClick={() => cleanupMutation.mutate({ dryRun: true })}
						>
							{cleanupMutation.isPending &&
							cleanupMutation.variables?.dryRun ? (
								<Loader2 className='h-3.5 w-3.5 animate-spin mr-1' />
							) : (
								<RefreshCw className='h-3.5 w-3.5 mr-1' />
							)}
							Dry Run (count only)
						</Button>
						<Button
							variant='destructive'
							size='sm'
							disabled={cleanupMutation.isPending || !selectedEnvId}
							onClick={() => cleanupMutation.mutate({ dryRun: false })}
						>
							{cleanupMutation.isPending &&
							!cleanupMutation.variables?.dryRun ? (
								<Loader2 className='h-3.5 w-3.5 animate-spin mr-1' />
							) : (
								<Trash2 className='h-3.5 w-3.5 mr-1' />
							)}
							Run Cleanup
						</Button>
						<p className='text-xs text-muted-foreground self-center'>
							Results visible in the Activity log once the job completes.
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Cleanup Schedule */}
			<Card>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-base'>
						<CalendarClock className='h-4 w-4' />
						Cleanup Schedule
					</CardTitle>
					<CardDescription>
						Automatically run database cleanup on a recurring schedule
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-4'>
					{scheduleLoading ? (
						<p className='text-xs text-muted-foreground'>Loading schedule…</p>
					) : (
						<>
							{/* Enabled toggle */}
							<div className='flex items-center gap-3'>
								<Switch
									id='sched-enabled'
									checked={scheduleForm.enabled}
									onCheckedChange={v =>
										setScheduleForm(f => ({ ...f, enabled: v }))
									}
								/>
								<Label htmlFor='sched-enabled' className='text-sm'>
									{scheduleForm.enabled ? 'Enabled' : 'Disabled'}
								</Label>
							</div>

							{/* Frequency + time */}
							<div className='grid grid-cols-2 gap-3'>
								<div className='space-y-1'>
									<Label className='text-xs'>Frequency</Label>
									<Select
										value={scheduleForm.frequency}
										onValueChange={v =>
											setScheduleForm(f => ({ ...f, frequency: v }))
										}
									>
										<SelectTrigger className='h-8 text-xs'>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='daily'>Daily</SelectItem>
											<SelectItem value='weekly'>Weekly</SelectItem>
											<SelectItem value='monthly'>Monthly</SelectItem>
										</SelectContent>
									</Select>
								</div>
								<div className='space-y-1'>
									<Label className='text-xs'>Time (hour : minute)</Label>
									<div className='flex items-center gap-1'>
										<Input
											type='number'
											min={0}
											max={23}
											value={scheduleForm.hour}
											onChange={e =>
												setScheduleForm(f => ({
													...f,
													hour: Math.min(
														23,
														Math.max(0, parseInt(e.target.value) || 0),
													),
												}))
											}
											className='h-8 text-xs w-16 font-mono'
										/>
										<span className='text-muted-foreground text-xs'>:</span>
										<Input
											type='number'
											min={0}
											max={59}
											value={scheduleForm.minute}
											onChange={e =>
												setScheduleForm(f => ({
													...f,
													minute: Math.min(
														59,
														Math.max(0, parseInt(e.target.value) || 0),
													),
												}))
											}
											className='h-8 text-xs w-16 font-mono'
										/>
									</div>
								</div>
							</div>

							{/* Day-of-week (weekly only) */}
							{scheduleForm.frequency === 'weekly' && (
								<div className='space-y-1'>
									<Label className='text-xs'>Day of week</Label>
									<Select
										value={String(scheduleForm.day_of_week ?? 1)}
										onValueChange={v =>
											setScheduleForm(f => ({ ...f, day_of_week: Number(v) }))
										}
									>
										<SelectTrigger className='h-8 text-xs'>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{[
												'Sunday',
												'Monday',
												'Tuesday',
												'Wednesday',
												'Thursday',
												'Friday',
												'Saturday',
											].map((d, i) => (
												<SelectItem key={i} value={String(i)}>
													{d}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}

							{/* Day-of-month (monthly only) */}
							{scheduleForm.frequency === 'monthly' && (
								<div className='space-y-1'>
									<Label className='text-xs'>Day of month (1–28)</Label>
									<Input
										type='number'
										min={1}
										max={28}
										value={scheduleForm.day_of_month ?? 1}
										onChange={e =>
											setScheduleForm(f => ({
												...f,
												day_of_month: Math.min(
													28,
													Math.max(1, parseInt(e.target.value) || 1),
												),
											}))
										}
										className='h-8 text-xs w-20 font-mono'
									/>
								</div>
							)}

							{/* Keep revisions */}
							<div className='space-y-1'>
								<Label className='text-xs'>
									Keep post revisions (0 = delete all)
								</Label>
								<Input
									type='number'
									min={0}
									max={100}
									value={scheduleForm.keep_revisions}
									onChange={e =>
										setScheduleForm(f => ({
											...f,
											keep_revisions: Math.max(
												0,
												parseInt(e.target.value) || 0,
											),
										}))
									}
									className='h-8 text-xs w-20 font-mono'
								/>
							</div>

							{cleanupSchedule?.last_run_at && (
								<p className='text-xs text-muted-foreground'>
									Last run:{' '}
									{new Date(cleanupSchedule.last_run_at).toLocaleString()}
								</p>
							)}

							<div className='flex flex-wrap gap-2 pt-1'>
								<Button
									size='sm'
									disabled={upsertScheduleMutation.isPending || !selectedEnvId}
									onClick={() => upsertScheduleMutation.mutate(scheduleForm)}
								>
									{upsertScheduleMutation.isPending ? (
										<Loader2 className='h-3.5 w-3.5 animate-spin mr-1' />
									) : null}
									{cleanupSchedule ? 'Update Schedule' : 'Save Schedule'}
								</Button>
								{cleanupSchedule && (
									<Button
										size='sm'
										variant='outline'
										disabled={deleteScheduleMutation.isPending}
										onClick={() => deleteScheduleMutation.mutate()}
									>
										Remove Schedule
									</Button>
								)}
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
