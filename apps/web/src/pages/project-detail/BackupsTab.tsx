import { useState, useEffect, useRef, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	HardDrive,
	Trash2,
	RotateCcw,
	Plus,
	Download,
	AlertCircle,
	Clock,
	Calendar,
	Pencil,
	XCircle,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog } from '@/components/ui/alert-dialog';
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
import { useWebSocketEvent, useSubscribeEnvironment } from '@/lib/websocket';
import {
	ExecutionLogPanel,
	ExpandLogButton,
} from '@/components/ui/execution-log-panel';

interface Environment {
	id: number;
	type: string;
	url?: string;
	google_drive_folder_id: string | null;
	server: { name: string };
}

interface Backup {
	id: number;
	type: 'full' | 'db_only' | 'files_only';
	status: 'pending' | 'running' | 'completed' | 'failed';
	size_bytes: number | null;
	error_message: string | null;
	created_at: string;
	completed_at: string | null;
	jobExecution: {
		id: number;
		status: string;
		progress: number;
		last_error: string | null;
		execution_log: unknown[] | null;
	} | null;
}

const BACKUP_TYPE_LABELS: Record<string, string> = {
	full: 'Full',
	db_only: 'Database',
	files_only: 'Files',
};

const STATUS_VARIANT: Record<
	string,
	'success' | 'secondary' | 'warning' | 'destructive'
> = {
	pending: 'secondary',
	running: 'warning',
	completed: 'success',
	failed: 'destructive',
};

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function BackupsTab({
	projectId,
	environments,
}: {
	projectId: number;
	environments: Environment[];
}) {
	const qc = useQueryClient();
	const [selectedEnvId, setSelectedEnvId] = useState<number | null>(
		environments[0]?.id ?? null,
	);
	const [backupType, setBackupType] = useState<
		'full' | 'db_only' | 'files_only'
	>('full');
	const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);
	const [runningJobs, setRunningJobs] = useState<
		Record<string, { progress: number; step?: string }>
	>({});
	const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
	const [activeJobExecutionId, setActiveJobExecutionId] = useState<
		number | null
	>(null);
	const backupJobIdRef = useRef<string | null>(null);
	const backupEnvIdRef = useRef<number | null>(null);

	// ── Schedule state ──────────────────────────────────────────────────────
	const [scheduleFormOpen, setScheduleFormOpen] = useState(false);
	const [scheduleForm, setScheduleForm] = useState({
		type: 'full' as 'full' | 'db_only' | 'files_only',
		frequency: 'daily' as 'daily' | 'weekly' | 'monthly',
		hour: 3,
		minute: 0,
		day_of_week: 0,
		day_of_month: 1,
		enabled: true,
		retention_count: null as number | null,
		retention_days: null as number | null,
	});

	useEffect(() => {
		if (!selectedEnvId && environments.length > 0) {
			setSelectedEnvId(environments[0].id);
		}
	}, [environments, selectedEnvId]);

	useSubscribeEnvironment(selectedEnvId);

	const { data, isLoading } = useQuery({
		queryKey: ['backups', selectedEnvId],
		enabled: !!selectedEnvId,
		queryFn: () =>
			api.get<{ items: Backup[]; total: number }>(
				`/backups/environment/${selectedEnvId}?page=1&limit=20`,
			),
		// Polling fallback: recover if a WS event was missed or the socket dropped
		refetchInterval: 15_000,
	});

	useWebSocketEvent('job:progress', (raw: unknown) => {
		const event = raw as {
			queueName: string;
			jobId: string;
			progress: number;
			step?: string;
			environmentId?: number;
		};
		const matchesEnv =
			event.queueName === 'backups' && event.environmentId === selectedEnvId;
		const matchesJob =
			event.queueName === 'backups' &&
			event.jobId != null &&
			event.jobId === backupJobIdRef.current;
		if (!matchesEnv && !matchesJob) return;
		setRunningJobs(prev => ({
			...prev,
			[event.jobId]: { progress: event.progress, step: event.step },
		}));
	});

	useWebSocketEvent('job:completed', (raw: unknown) => {
		const event = raw as {
			queueName: string;
			jobId?: string;
			environmentId?: number;
		};
		if (event.queueName !== 'backups' || event.environmentId !== selectedEnvId)
			return;
		backupJobIdRef.current = null;
		backupEnvIdRef.current = null;
		setActiveJobExecutionId(null);
		qc.invalidateQueries({ queryKey: ['backups', selectedEnvId] });
		setRunningJobs({});
	});

	useWebSocketEvent('job:failed', (raw: unknown) => {
		const event = raw as {
			queueName: string;
			jobId?: string;
			environmentId?: number;
			error?: string;
		};
		if (event.queueName !== 'backups' || event.environmentId !== selectedEnvId)
			return;
		backupJobIdRef.current = null;
		backupEnvIdRef.current = null;
		setActiveJobExecutionId(null);
		setRunningJobs({});
		qc.invalidateQueries({ queryKey: ['backups', selectedEnvId] });
		toast({
			title: 'Backup failed',
			description: event.error ?? 'An unexpected error occurred',
			variant: 'destructive',
		});
	});

	const createMutation = useMutation({
		mutationFn: () =>
			api.post<{ jobExecutionId: number; bullJobId: string }>(
				'/backups/create',
				{
					environmentId: selectedEnvId,
					type: backupType,
				},
			),
		onSuccess: data => {
			backupJobIdRef.current = data?.bullJobId ?? null;
			backupEnvIdRef.current = selectedEnvId;
			setActiveJobExecutionId(data?.jobExecutionId ?? null);
			toast({ title: 'Backup queued' });
			qc.invalidateQueries({ queryKey: ['backups', selectedEnvId] });
		},
		onError: () =>
			toast({ title: 'Failed to start backup', variant: 'destructive' }),
	});

	const restoreMutation = useMutation({
		mutationFn: (backupId: number) =>
			api.post<{ jobExecutionId: number; bullJobId: string }>(
				'/backups/restore',
				{ backupId },
			),
		onSuccess: data => {
			backupJobIdRef.current = data?.bullJobId ?? null;
			backupEnvIdRef.current = selectedEnvId;
			setActiveJobExecutionId(data?.jobExecutionId ?? null);
			toast({ title: 'Restore queued' });
			setRestoreTarget(null);
		},
		onError: () => toast({ title: 'Restore failed', variant: 'destructive' }),
	});

	const cancelBackupMutation = useMutation({
		mutationFn: (execId: number) =>
			api.post<{ cancelled: boolean }>(
				`/backups/execution/${execId}/cancel`,
				{},
			),
		onSuccess: () => {
			setActiveJobExecutionId(null);
			setRunningJobs({});
			backupJobIdRef.current = null;
			backupEnvIdRef.current = null;
			qc.invalidateQueries({ queryKey: ['backups', selectedEnvId] });
			toast({ title: 'Backup job cancelled' });
		},
		onError: () =>
			toast({ title: 'Could not cancel job', variant: 'destructive' }),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/backups/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['backups', selectedEnvId] });
			setDeleteTarget(null);
			toast({ title: 'Backup deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	// ── Backup schedule query + mutations ───────────────────────────────────

	interface BackupSchedule {
		id: number;
		type: 'full' | 'db_only' | 'files_only';
		frequency: string;
		hour: number;
		minute: number;
		day_of_week: number | null;
		day_of_month: number | null;
		enabled: boolean;
		last_run_at: string | null;
		retention_count: number | null;
		retention_days: number | null;
	}

	const { data: scheduleData, isLoading: scheduleLoading } = useQuery({
		queryKey: ['backup-schedule', selectedEnvId],
		enabled: !!selectedEnvId,
		queryFn: () =>
			api
				.get<BackupSchedule | null>(
					`/environments/${selectedEnvId}/backup-schedule`,
				)
				.catch(() => null),
		staleTime: 30_000,
	});

	const upsertScheduleMutation = useMutation({
		mutationFn: (payload: typeof scheduleForm) =>
			api.put(`/environments/${selectedEnvId}/backup-schedule`, payload),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['backup-schedule', selectedEnvId] });
			setScheduleFormOpen(false);
			toast({ title: 'Schedule saved' });
		},
		onError: () =>
			toast({ title: 'Failed to save schedule', variant: 'destructive' }),
	});

	const deleteScheduleMutation = useMutation({
		mutationFn: () =>
			api.delete(`/environments/${selectedEnvId}/backup-schedule`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['backup-schedule', selectedEnvId] });
			toast({ title: 'Schedule removed' });
		},
		onError: () =>
			toast({ title: 'Failed to remove schedule', variant: 'destructive' }),
	});

	function openScheduleForm(existing?: BackupSchedule | null) {
		setScheduleForm(
			existing
				? {
						type: existing.type,
						frequency: existing.frequency as typeof scheduleForm.frequency,
						hour: existing.hour,
						minute: existing.minute,
						day_of_week: existing.day_of_week ?? 0,
						day_of_month: existing.day_of_month ?? 1,
						enabled: existing.enabled,
						retention_count: existing.retention_count ?? null,
						retention_days: existing.retention_days ?? null,
					}
				: {
						type: 'full' as const,
						frequency: 'daily' as const,
						hour: 3,
						minute: 0,
						day_of_week: 0,
						day_of_month: 1,
						enabled: true,
						retention_count: null,
						retention_days: null,
					},
		);
		setScheduleFormOpen(true);
	}

	if (environments.length === 0) {
		return (
			<div className='text-center py-12 text-muted-foreground'>
				<HardDrive className='h-10 w-10 mx-auto mb-3 opacity-40' />
				<p className='font-medium'>No environments configured</p>
				<p className='text-sm mt-1'>
					Add an environment first to manage backups
				</p>
			</div>
		);
	}

	const runningCount = Object.keys(runningJobs).length;
	const selectedEnv = environments.find(e => e.id === selectedEnvId);
	const missingFolderId = !!selectedEnv && !selectedEnv.google_drive_folder_id;

	return (
		<div className='space-y-4'>
			<div className='flex flex-wrap items-center gap-3'>
				<Select
					value={selectedEnvId?.toString()}
					onValueChange={v => setSelectedEnvId(Number(v))}
				>
					<SelectTrigger className='w-56'>
						<SelectValue placeholder='Select environment…' />
					</SelectTrigger>
					<SelectContent>
						{environments.map(e => (
							<SelectItem key={e.id} value={e.id.toString()}>
								<span className='capitalize'>{e.type}</span>
								<span className='text-muted-foreground ml-1.5 text-xs'>
									({e.server.name})
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={backupType}
					onValueChange={v => setBackupType(v as typeof backupType)}
				>
					<SelectTrigger className='w-36'>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value='full'>Full backup</SelectItem>
						<SelectItem value='db_only'>Database only</SelectItem>
						<SelectItem value='files_only'>Files only</SelectItem>
					</SelectContent>
				</Select>

				<Button
					size='sm'
					onClick={() => createMutation.mutate()}
					disabled={
						!selectedEnvId || createMutation.isPending || missingFolderId
					}
				>
					<Plus className='h-4 w-4 mr-1.5' />
					Create Backup
				</Button>

				{runningCount > 0 && (
					<p className='text-sm text-muted-foreground'>
						{runningCount} job{runningCount !== 1 ? 's' : ''} running…
					</p>
				)}
			</div>

			{missingFolderId && (
				<div className='flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'>
					<AlertCircle className='h-4 w-4 mt-0.5 shrink-0' />
					<div>
						<p className='font-medium'>No Google Drive folder configured</p>
						<p className='text-xs mt-0.5 opacity-80'>
							Open the <strong>Environments</strong> tab, edit this environment,
							and add a Google Drive Folder ID to enable backups.
						</p>
					</div>
				</div>
			)}

			{runningCount > 0 && (
				<div className='border rounded-lg p-4 space-y-3 bg-muted/30'>
					<div className='flex items-center justify-between'>
						<span className='text-xs text-muted-foreground font-medium'>
							Job running…
						</span>
						<Button
							variant='outline'
							size='sm'
							className='h-7 text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10'
							disabled={cancelBackupMutation.isPending || !activeJobExecutionId}
							onClick={() =>
								activeJobExecutionId &&
								cancelBackupMutation.mutate(activeJobExecutionId)
							}
						>
							<XCircle className='h-3.5 w-3.5' />
							{cancelBackupMutation.isPending ? 'Stopping…' : 'Stop'}
						</Button>
					</div>{' '}
					{Object.entries(runningJobs).map(([jobId, { step, progress }]) => (
						<div key={jobId}>
							{' '}
							<div className='flex justify-between items-center text-xs mb-1.5'>
								<span className='text-muted-foreground'>
									{step ?? 'Processing…'}
								</span>
								<span className='font-medium tabular-nums'>{progress}%</span>
							</div>
							<div className='h-1.5 bg-muted rounded-full overflow-hidden'>
								<div
									className='h-1.5 bg-primary rounded-full transition-all duration-500'
									style={{ width: `${progress}%` }}
								/>
							</div>
						</div>
					))}
				</div>
			)}

			{isLoading && (
				<div className='space-y-2'>
					{[1, 2, 3].map(i => (
						<Skeleton key={i} className='h-12 rounded-lg' />
					))}
				</div>
			)}

			{!isLoading && (
				<div className='border rounded-lg overflow-hidden'>
					<table className='w-full text-sm'>
						<thead className='border-b bg-muted/40'>
							<tr>
								<th className='text-left px-4 py-3 font-medium'>Type</th>
								<th className='text-left px-4 py-3 font-medium'>Size</th>
								<th className='text-left px-4 py-3 font-medium'>Status</th>
								<th className='text-left px-4 py-3 font-medium'>Created</th>
								<th className='w-36' />
							</tr>
						</thead>
						<tbody className='divide-y'>
							{data?.items.map(b => (
								<Fragment key={b.id}>
									<tr>
										<td className='px-4 py-3'>
											<Badge variant='outline' className='text-xs'>
												{BACKUP_TYPE_LABELS[b.type]}
											</Badge>
										</td>
										<td className='px-4 py-3 text-muted-foreground'>
											{b.size_bytes ? formatBytes(b.size_bytes) : '—'}
										</td>
										<td className='px-4 py-3'>
											<Badge variant={STATUS_VARIANT[b.status] ?? 'secondary'}>
												{b.status}
											</Badge>{' '}
											{b.status === 'failed' &&
												(b.error_message ?? b.jobExecution?.last_error) && (
													<p
														className='text-xs text-destructive mt-0.5 max-w-xs truncate'
														title={
															b.error_message ??
															b.jobExecution?.last_error ??
															undefined
														}
													>
														{b.error_message ?? b.jobExecution?.last_error}
													</p>
												)}{' '}
										</td>
										<td className='px-4 py-3 text-muted-foreground text-xs'>
											{new Date(b.created_at).toLocaleString()}
										</td>
										<td className='px-2 py-3'>
											<div className='flex items-center gap-1 justify-end'>
												<ExpandLogButton
													expanded={expandedLogId === b.jobExecution?.id}
													onToggle={() =>
														setExpandedLogId(prev =>
															prev === b.jobExecution?.id
																? null
																: (b.jobExecution?.id ?? null),
														)
													}
													disabled={!b.jobExecution?.id}
												/>
												{b.status === 'completed' && (
													<Button
														variant='ghost'
														size='icon'
														className='h-7 w-7'
														title='Restore'
														onClick={() => setRestoreTarget(b)}
													>
														<RotateCcw className='h-3.5 w-3.5' />
													</Button>
												)}
												{b.status === 'completed' && (
													<Button
														variant='ghost'
														size='icon'
														className='h-7 w-7'
														title='Download'
														onClick={() =>
															window.open(
																`/api/backups/${b.id}/download`,
																'_blank',
															)
														}
													>
														<Download className='h-3.5 w-3.5' />
													</Button>
												)}
												<Button
													variant='ghost'
													size='icon'
													className='h-7 w-7 text-destructive hover:text-destructive'
													title='Delete'
													onClick={() => setDeleteTarget(b)}
												>
													<Trash2 className='h-3.5 w-3.5' />
												</Button>
											</div>
										</td>
									</tr>
									{expandedLogId === b.jobExecution?.id && (
										<tr key={`log-${b.id}`}>
											<td colSpan={5} className='px-4 pb-3 bg-muted/30'>
												<ExecutionLogPanel
													jobExecutionId={b.jobExecution?.id ?? null}
												/>
											</td>
										</tr>
									)}
								</Fragment>
							))}
						</tbody>
					</table>
					{!data?.items.length && (
						<p className='text-center text-muted-foreground py-10 text-sm'>
							No backups for this environment yet.
						</p>
					)}
				</div>
			)}

			{/* ── Backup Schedule ─────────────────────────────────────────────── */}
			{selectedEnvId && (
				<div className='border rounded-lg'>
					<div className='flex items-center justify-between px-4 py-3 border-b'>
						<div className='flex items-center gap-2 text-sm font-medium'>
							<Clock className='h-4 w-4 text-muted-foreground' />
							Backup Schedule
						</div>
						{!scheduleFormOpen && (
							<Button
								size='sm'
								variant='outline'
								className='h-7 text-xs gap-1.5'
								disabled={scheduleLoading}
								onClick={() => openScheduleForm(scheduleData)}
							>
								{scheduleData ? (
									<>
										<Pencil className='h-3 w-3' /> Edit
									</>
								) : (
									<>
										<Plus className='h-3 w-3' /> Set up schedule
									</>
								)}
							</Button>
						)}
					</div>

					<div className='p-4'>
						{/* Current schedule summary */}
						{!scheduleFormOpen && !scheduleLoading && scheduleData && (
							<div className='flex flex-wrap items-center gap-4 text-sm'>
								<div className='flex items-center gap-1.5'>
									<Calendar className='h-3.5 w-3.5 text-muted-foreground' />
									<span className='capitalize font-medium'>
										{scheduleData.frequency}
									</span>
									{scheduleData.frequency === 'weekly' &&
										scheduleData.day_of_week != null && (
											<span className='text-muted-foreground'>
												—{' '}
												{
													['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
														scheduleData.day_of_week
													]
												}
											</span>
										)}
									{scheduleData.frequency === 'monthly' &&
										scheduleData.day_of_month && (
											<span className='text-muted-foreground'>
												— day {scheduleData.day_of_month}
											</span>
										)}
									<span className='text-muted-foreground'>
										at {String(scheduleData.hour).padStart(2, '0')}:
										{String(scheduleData.minute).padStart(2, '0')} UTC
									</span>
								</div>
								<Badge variant='outline' className='text-xs capitalize'>
									{scheduleData.type.replace('_', ' ')}
								</Badge>
								<Badge
									variant={scheduleData.enabled ? 'success' : 'secondary'}
									className='text-xs'
								>
									{scheduleData.enabled ? 'Enabled' : 'Disabled'}
								</Badge>
								{scheduleData.last_run_at && (
									<span className='text-xs text-muted-foreground'>
										Last ran{' '}
										{new Date(scheduleData.last_run_at).toLocaleString()}
									</span>
								)}{' '}
								{(scheduleData.retention_count ||
									scheduleData.retention_days) && (
									<span className='text-xs text-muted-foreground'>
										Retention:
										{scheduleData.retention_count
											? ` keep last ${scheduleData.retention_count}`
											: ''}
										{scheduleData.retention_count && scheduleData.retention_days
											? ' ·'
											: ''}
										{scheduleData.retention_days
											? ` delete after ${scheduleData.retention_days}d`
											: ''}
									</span>
								)}{' '}
								<Button
									size='sm'
									variant='ghost'
									className='h-6 text-xs text-destructive hover:text-destructive ml-auto'
									onClick={() => deleteScheduleMutation.mutate()}
									disabled={deleteScheduleMutation.isPending}
								>
									<Trash2 className='h-3 w-3 mr-1' />
									Remove
								</Button>
							</div>
						)}

						{!scheduleFormOpen && !scheduleLoading && !scheduleData && (
							<p className='text-sm text-muted-foreground'>
								No schedule configured — backups are created manually only.
							</p>
						)}

						{scheduleLoading && <Skeleton className='h-6 w-64' />}

						{/* Schedule edit form */}
						{scheduleFormOpen && (
							<div className='space-y-4'>
								<div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
									{/* Backup type */}
									<div className='space-y-1.5'>
										<Label className='text-xs'>Backup type</Label>
										<Select
											value={scheduleForm.type}
											onValueChange={v =>
												setScheduleForm(f => ({
													...f,
													type: v as typeof f.type,
												}))
											}
										>
											<SelectTrigger className='h-8 text-xs'>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value='full'>Full</SelectItem>
												<SelectItem value='db_only'>Database only</SelectItem>
												<SelectItem value='files_only'>Files only</SelectItem>
											</SelectContent>
										</Select>
									</div>

									{/* Frequency */}
									<div className='space-y-1.5'>
										<Label className='text-xs'>Frequency</Label>
										<Select
											value={scheduleForm.frequency}
											onValueChange={v =>
												setScheduleForm(f => ({
													...f,
													frequency: v as typeof f.frequency,
												}))
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

									{/* Hour */}
									<div className='space-y-1.5'>
										<Label className='text-xs'>Hour (UTC 0–23)</Label>
										<Input
											type='number'
											min={0}
											max={23}
											className='h-8 text-xs'
											value={scheduleForm.hour}
											onChange={e =>
												setScheduleForm(f => ({
													...f,
													hour: Math.min(
														23,
														Math.max(0, Number(e.target.value)),
													),
												}))
											}
										/>
									</div>

									{/* Minute */}
									<div className='space-y-1.5'>
										<Label className='text-xs'>Minute (0–59)</Label>
										<Input
											type='number'
											min={0}
											max={59}
											className='h-8 text-xs'
											value={scheduleForm.minute}
											onChange={e =>
												setScheduleForm(f => ({
													...f,
													minute: Math.min(
														59,
														Math.max(0, Number(e.target.value)),
													),
												}))
											}
										/>
									</div>

									{/* Day of week (weekly) */}
									{scheduleForm.frequency === 'weekly' && (
										<div className='space-y-1.5'>
											<Label className='text-xs'>Day of week</Label>
											<Select
												value={String(scheduleForm.day_of_week)}
												onValueChange={v =>
													setScheduleForm(f => ({
														...f,
														day_of_week: Number(v),
													}))
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

									{/* Day of month (monthly) */}
									{scheduleForm.frequency === 'monthly' && (
										<div className='space-y-1.5'>
											<Label className='text-xs'>Day of month (1–28)</Label>
											<Input
												type='number'
												min={1}
												max={28}
												className='h-8 text-xs'
												value={scheduleForm.day_of_month}
												onChange={e =>
													setScheduleForm(f => ({
														...f,
														day_of_month: Math.min(
															28,
															Math.max(1, Number(e.target.value)),
														),
													}))
												}
											/>
										</div>
									)}
								</div>

								{/* Enabled toggle */}
								<div className='flex items-center gap-2'>
									<Switch
										id='schedule-enabled'
										checked={scheduleForm.enabled}
										onCheckedChange={v =>
											setScheduleForm(f => ({ ...f, enabled: v }))
										}
									/>
									<Label
										htmlFor='schedule-enabled'
										className='text-sm cursor-pointer'
									>
										{scheduleForm.enabled ? 'Enabled' : 'Disabled'}
									</Label>
								</div>

								{/* Retention policy */}
								<div className='border-t pt-4 space-y-3'>
									<p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>
										Retention Policy
									</p>
									<div className='grid grid-cols-2 gap-3'>
										<div className='space-y-1.5'>
											<Label className='text-xs'>Keep last N backups</Label>
											<Input
												type='number'
												min={1}
												max={1000}
												placeholder='Unlimited'
												className='h-8 text-xs'
												value={
													scheduleForm.retention_count === null
														? ''
														: String(scheduleForm.retention_count)
												}
												onChange={e =>
													setScheduleForm(f => ({
														...f,
														retention_count: e.target.value
															? Math.max(
																	1,
																	Math.min(1000, Number(e.target.value)),
																)
															: null,
													}))
												}
											/>
											<p className='text-xs text-muted-foreground'>
												Leave empty for unlimited
											</p>
										</div>
										<div className='space-y-1.5'>
											<Label className='text-xs'>Delete after N days</Label>
											<Input
												type='number'
												min={1}
												max={365}
												placeholder='Never'
												className='h-8 text-xs'
												value={
													scheduleForm.retention_days === null
														? ''
														: String(scheduleForm.retention_days)
												}
												onChange={e =>
													setScheduleForm(f => ({
														...f,
														retention_days: e.target.value
															? Math.max(
																	1,
																	Math.min(365, Number(e.target.value)),
																)
															: null,
													}))
												}
											/>
											<p className='text-xs text-muted-foreground'>
												Leave empty to keep forever
											</p>
										</div>
									</div>
								</div>

								<div className='flex gap-2'>
									<Button
										size='sm'
										onClick={() => upsertScheduleMutation.mutate(scheduleForm)}
										disabled={upsertScheduleMutation.isPending}
									>
										Save schedule
									</Button>
									<Button
										size='sm'
										variant='ghost'
										onClick={() => setScheduleFormOpen(false)}
									>
										Cancel
									</Button>
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			<AlertDialog
				open={!!restoreTarget}
				onOpenChange={o => !o && setRestoreTarget(null)}
				title='Restore Backup'
				description='This will overwrite the current site files and/or database with this backup. The operation cannot be undone.'
				confirmLabel='Restore'
				onConfirm={() =>
					restoreTarget && restoreMutation.mutate(restoreTarget.id)
				}
				isPending={restoreMutation.isPending}
			/>

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title='Delete Backup'
				description='This will permanently delete the backup record and the remote backup file.'
				confirmLabel='Delete'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}
