import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	ArrowRight,
	RefreshCw,
	AlertTriangle,
	ChevronDown,
	ChevronUp,
	CheckCircle2,
	XCircle,
	Clock,
	Loader2,
	ShieldOff,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
	ExecutionLogPanel,
	ExpandLogButton,
} from '@/components/ui/execution-log-panel';
import { useWebSocketEvent } from '@/lib/websocket';

interface Environment {
	id: number;
	type: string;
	url?: string;
	google_drive_folder_id?: string | null;
	server: { name: string };
}

interface JobProgress {
	jobId: string;
	progress: number;
	message: string;
	step?: string;
}

interface JobResult {
	jobId: string;
	status: string;
	message?: string;
}

interface JobExecutionRow {
	id: number;
	queue_name: string;
	status: string;
	progress: number | null;
	last_error: string | null;
	started_at: string | null;
	completed_at: string | null;
	created_at: string;
	environment: {
		id: number;
		type: string;
		url: string | null;
		project: { id: number; name: string; client: { id: number; name: string } };
	} | null;
}

interface SyncHistoryPage {
	data: JobExecutionRow[];
	total: number;
}

function EnvCard({ env, label }: { env: Environment | null; label: string }) {
	if (!env) {
		return (
			<div className='flex-1 border-2 border-dashed rounded-lg p-6 text-center text-muted-foreground text-sm'>
				{label}
			</div>
		);
	}
	return (
		<div className='flex-1 border rounded-lg p-5 space-y-1'>
			<p className='text-xs text-muted-foreground font-medium uppercase tracking-wide'>
				{label}
			</p>
			<p className='font-semibold capitalize text-lg'>{env.type}</p>
			<p className='text-sm text-muted-foreground'>{env.server.name}</p>
			{env.url && <p className='text-xs text-blue-500 truncate'>{env.url}</p>}
		</div>
	);
}

function StatusIcon({ status }: { status: string }) {
	if (status === 'completed')
		return (
			<CheckCircle2 className='h-3.5 w-3.5 text-green-600 dark:text-green-400' />
		);
	if (status === 'failed')
		return <XCircle className='h-3.5 w-3.5 text-destructive' />;
	if (status === 'active')
		return <Loader2 className='h-3.5 w-3.5 text-blue-500 animate-spin' />;
	return <Clock className='h-3.5 w-3.5 text-muted-foreground' />;
}

function durationLabel(
	started?: string | null,
	completed?: string | null,
): string {
	if (!started) return '\u2014';
	const diff =
		(completed ? new Date(completed).getTime() : Date.now()) -
		new Date(started).getTime();
	if (diff < 1000) return `${diff}ms`;
	if (diff < 60_000) return `${(diff / 1000).toFixed(1)}s`;
	const mins = Math.floor(diff / 60_000);
	const secs = Math.floor((diff % 60_000) / 1000);
	return `${mins}m ${secs}s`;
}

function SyncHistoryRow({ row }: { row: JobExecutionRow }) {
	const [expanded, setExpanded] = useState(false);
	const isActive = row.status === 'active' || row.status === 'pending';

	return (
		<>
			<tr className='border-b last:border-0 hover:bg-muted/30 transition-colors'>
				<td className='py-2.5 pl-4 pr-2 whitespace-nowrap'>
					<div className='flex items-center gap-1.5 text-xs font-medium capitalize'>
						<StatusIcon status={row.status} />
						{row.status}
					</div>
				</td>
				<td className='py-2.5 px-2 text-xs text-muted-foreground capitalize'>
					{row.environment?.type ?? '\u2014'}
				</td>
				<td className='py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap'>
					{row.started_at
						? new Date(row.started_at).toLocaleString([], {
								dateStyle: 'short',
								timeStyle: 'short',
							})
						: new Date(row.created_at).toLocaleString([], {
								dateStyle: 'short',
								timeStyle: 'short',
							})}
				</td>
				<td className='py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap'>
					{durationLabel(row.started_at, row.completed_at)}
				</td>
				<td className='py-2.5 px-2 text-xs'>
					{row.status === 'active' && row.progress != null ? (
						<div className='flex items-center gap-2'>
							<div className='w-16 bg-muted rounded-full h-1.5'>
								<div
									className='bg-primary h-1.5 rounded-full'
									style={{ width: `${row.progress}%` }}
								/>
							</div>
							<span className='text-muted-foreground'>{row.progress}%</span>
						</div>
					) : row.status === 'failed' && row.last_error ? (
						<span
							className='text-destructive truncate max-w-[200px] block'
							title={row.last_error}
						>
							{row.last_error}
						</span>
					) : null}
				</td>
				<td className='py-2.5 pr-4 pl-2 text-right whitespace-nowrap'>
					<ExpandLogButton
						expanded={expanded}
						onToggle={() => setExpanded(v => !v)}
					/>
				</td>
			</tr>
			{expanded && (
				<tr className='bg-muted/20 border-b last:border-0'>
					<td colSpan={6} className='px-4 pb-4 pt-2'>
						<ExecutionLogPanel jobExecutionId={row.id} isActive={isActive} />
					</td>
				</tr>
			)}
		</>
	);
}

export function SyncTab({
	projectId,
	environments,
}: {
	projectId: number;
	environments: Environment[];
}) {
	const qc = useQueryClient();
	const [sourceId, setSourceId] = useState<string>('');
	const [targetId, setTargetId] = useState<string>('');
	const [skipSafetyBackup, setSkipSafetyBackup] = useState(false);
	const [jobId, setJobId] = useState<string | null>(null);
	const [jobExecutionId, setJobExecutionId] = useState<number | null>(null);
	const [progress, setProgress] = useState<JobProgress | null>(null);
	const [jobDone, setJobDone] = useState<JobResult | null>(null);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [logExpanded, setLogExpanded] = useState(false);

	const source = environments.find(e => e.id.toString() === sourceId) ?? null;
	const target = environments.find(e => e.id.toString() === targetId) ?? null;

	const envIds = environments.map(e => e.id).join(',');

	const { data: historyData } = useQuery({
		queryKey: ['sync-history', projectId],
		queryFn: () =>
			api.get<SyncHistoryPage>(
				`/job-executions?queue_name=sync&environment_ids=${envIds}&limit=20`,
			),
		enabled: environments.length > 0,
		staleTime: 15_000,
		refetchInterval: 30_000,
	});

	const cloneMutation = useMutation({
		mutationFn: () =>
			api.post<{ jobId: string; jobExecutionId: number }>('/sync/clone', {
				sourceEnvironmentId: Number(sourceId),
				targetEnvironmentId: Number(targetId),
				skipSafetyBackup,
			}),
		onSuccess: res => {
			setJobId(res.jobId);
			setJobExecutionId(res.jobExecutionId);
			setJobDone(null);
			setProgress(null);
			setLogExpanded(false);
			qc.invalidateQueries({ queryKey: ['sync-history', projectId] });
			toast({ title: 'Sync job queued', description: `Job ${res.jobId}` });
		},
		onError: (err: unknown) => {
			const msg = err instanceof Error ? err.message : 'Failed to queue sync';
			toast({
				title: 'Sync failed to queue',
				description: msg,
				variant: 'destructive',
			});
		},
	});

	useWebSocketEvent('job:progress', (raw: unknown) => {
		const p = raw as JobProgress;
		if (p.jobId === jobId) setProgress(p);
	});

	useWebSocketEvent('job:completed', (raw: unknown) => {
		const r = raw as JobResult;
		if (r.jobId === jobId) {
			setJobDone({ ...r, status: 'completed' });
			qc.invalidateQueries({ queryKey: ['sync-history', projectId] });
			toast({ title: 'Sync completed successfully' });
		}
	});

	useWebSocketEvent('job:failed', (raw: unknown) => {
		const r = raw as JobResult;
		if (r.jobId === jobId) {
			setJobDone({ ...r, status: 'failed' });
			qc.invalidateQueries({ queryKey: ['sync-history', projectId] });
			toast({
				title: 'Sync failed',
				description: r.message,
				variant: 'destructive',
			});
		}
	});

	const hasGdrive =
		skipSafetyBackup || !target || !!target.google_drive_folder_id;
	const canSync = sourceId && targetId && sourceId !== targetId && hasGdrive;
	const isBusy = cloneMutation.isPending || (!!jobId && !jobDone);

	const confirmTitle = skipSafetyBackup
		? 'Confirm Sync \u2014 NO backup will be taken'
		: 'Confirm Sync \u2014 This will overwrite data';

	const confirmDescription = skipSafetyBackup
		? `You have opted to skip the safety backup. The ${target?.type ?? ''} environment on ${target?.server.name ?? ''} will be completely overwritten with data from ${source?.type ?? ''} \u2014 with NO prior backup. Any existing data on the target will be permanently lost.`
		: `The ${target?.type ?? ''} environment on ${target?.server.name ?? ''} will be completely overwritten with data from ${source?.type ?? ''}. A backup snapshot will be taken on the target before proceeding.`;

	if (environments.length < 2) {
		return (
			<div className='text-center py-12 text-muted-foreground'>
				<RefreshCw className='h-10 w-10 mx-auto mb-3 opacity-40' />
				<p className='font-medium'>Need at least 2 environments to sync</p>
				<p className='text-sm mt-1'>Add environments in the Environments tab</p>
			</div>
		);
	}

	return (
		<div className='space-y-6 max-w-2xl'>
			<div>
				<h3 className='font-semibold mb-1'>Sync Environments</h3>
				<p className='text-sm text-muted-foreground'>
					Clones the database from source to target (mysqldump + import + URL
					search-replace). A safety backup is uploaded to Google Drive before
					overwriting.
				</p>
			</div>

			<div className='grid grid-cols-[1fr_auto_1fr] gap-4 items-end'>
				<div className='space-y-1.5'>
					<label className='text-sm font-medium'>Source</label>
					<Select value={sourceId} onValueChange={setSourceId}>
						<SelectTrigger>
							<SelectValue placeholder='Select source\u2026' />
						</SelectTrigger>
						<SelectContent>
							{environments.map(e => (
								<SelectItem
									key={e.id}
									value={e.id.toString()}
									disabled={e.id.toString() === targetId}
								>
									<span className='capitalize'>{e.type}</span>
									<span className='text-muted-foreground ml-1.5 text-xs'>
										({e.server.name})
									</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className='pb-2'>
					<ArrowRight className='h-5 w-5 text-muted-foreground' />
				</div>

				<div className='space-y-1.5'>
					<label className='text-sm font-medium'>
						Target (will be overwritten)
					</label>
					<Select value={targetId} onValueChange={setTargetId}>
						<SelectTrigger>
							<SelectValue placeholder='Select target\u2026' />
						</SelectTrigger>
						<SelectContent>
							{environments.map(e => (
								<SelectItem
									key={e.id}
									value={e.id.toString()}
									disabled={e.id.toString() === sourceId}
								>
									<span className='capitalize'>{e.type}</span>
									<span className='text-muted-foreground ml-1.5 text-xs'>
										({e.server.name})
									</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			<div className='flex items-center gap-3'>
				<EnvCard env={source} label='Source' />
				<ArrowRight className='h-6 w-6 text-muted-foreground flex-none' />
				<EnvCard env={target} label='Target' />
			</div>

			{target && !target.google_drive_folder_id && !skipSafetyBackup && (
				<div className='flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40'>
					<AlertTriangle className='h-4 w-4 mt-0.5 flex-none text-amber-500' />
					<div>
						<p className='font-medium text-amber-700 dark:text-amber-400'>
							Google Drive folder required
						</p>
						<p className='text-xs text-muted-foreground mt-0.5'>
							A safety backup is mandatory before overwriting the target. Set a
							Google Drive folder on the <strong>{target.type}</strong>{' '}
							environment, or enable "Skip safety backup" below.
						</p>
					</div>
				</div>
			)}

			<div className='space-y-1.5'>
				<div className='flex items-start gap-2.5'>
					<Switch
						id='skip-backup'
						checked={skipSafetyBackup}
						onCheckedChange={setSkipSafetyBackup}
						className='mt-0.5 shrink-0'
					/>
					<div className='space-y-0.5'>
						<Label
							htmlFor='skip-backup'
							className='flex items-center gap-1.5 cursor-pointer text-sm font-medium'
						>
							<ShieldOff className='h-3.5 w-3.5 text-amber-500' />
							Skip safety backup
						</Label>
						<p className='text-xs text-muted-foreground'>
							Bypasses the mandatory pre-sync backup. Use only if the target has
							no Google Drive folder or if you accept the risk of data loss.
						</p>
					</div>
				</div>

				{skipSafetyBackup && (
					<div className='flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive ml-6'>
						<AlertTriangle className='h-3.5 w-3.5 mt-0.5 flex-none' />
						<span>
							<strong>No backup will be taken.</strong> If the sync fails or
							results are unexpected, there will be no automatic recovery point.
						</span>
					</div>
				)}
			</div>

			<Button
				disabled={!canSync || isBusy}
				variant='destructive'
				onClick={() => setConfirmOpen(true)}
			>
				<RefreshCw
					className={`h-4 w-4 mr-1.5 ${isBusy ? 'animate-spin' : ''}`}
				/>
				{isBusy ? 'Syncing\u2026' : 'Start Sync'}
			</Button>

			<AlertDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				title={confirmTitle}
				description={confirmDescription}
				confirmLabel='Yes, start sync'
				confirmVariant='destructive'
				onConfirm={() => {
					setConfirmOpen(false);
					cloneMutation.mutate();
				}}
			/>

			{(progress || jobDone) && (
				<div className='border rounded-lg p-4 space-y-3'>
					{progress && !jobDone && (
						<>
							<div className='flex justify-between text-sm'>
								<span className='text-muted-foreground'>
									{progress.step ?? progress.message}
								</span>
								<span className='font-medium'>{progress.progress}%</span>
							</div>
							<div className='w-full bg-muted rounded-full h-2'>
								<div
									className='bg-primary h-2 rounded-full transition-all'
									style={{ width: `${progress.progress}%` }}
								/>
							</div>
						</>
					)}
					{jobDone && (
						<div className='flex items-center gap-2'>
							<Badge
								variant={
									jobDone.status === 'completed' ? 'default' : 'destructive'
								}
							>
								{jobDone.status === 'completed'
									? 'Sync completed'
									: 'Sync failed'}
							</Badge>
							{jobDone.message && (
								<span className='text-sm text-muted-foreground'>
									{jobDone.message}
								</span>
							)}
						</div>
					)}

					{jobExecutionId && (
						<div className='pt-2 border-t'>
							<button
								type='button'
								className='flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'
								onClick={() => setLogExpanded(v => !v)}
							>
								{logExpanded ? (
									<ChevronUp className='h-3 w-3' />
								) : (
									<ChevronDown className='h-3 w-3' />
								)}
								{logExpanded ? 'Hide' : 'Show'} execution log
							</button>
							{logExpanded && (
								<div className='mt-2'>
									<ExecutionLogPanel
										jobExecutionId={jobExecutionId}
										isActive={isBusy}
									/>
								</div>
							)}
						</div>
					)}
				</div>
			)}

			<div className='space-y-3'>
				<h4 className='text-sm font-semibold'>Sync History</h4>

				{!historyData || historyData.data.length === 0 ? (
					<div className='border rounded-lg text-center py-8 text-muted-foreground text-sm'>
						No sync jobs yet for this project.
					</div>
				) : (
					<div className='border rounded-lg overflow-hidden'>
						<table className='w-full text-sm'>
							<thead className='border-b bg-muted/40'>
								<tr>
									<th className='text-left px-4 py-2.5 text-xs font-medium text-muted-foreground'>
										Status
									</th>
									<th className='text-left px-2 py-2.5 text-xs font-medium text-muted-foreground'>
										Env
									</th>
									<th className='text-left px-2 py-2.5 text-xs font-medium text-muted-foreground'>
										Started
									</th>
									<th className='text-left px-2 py-2.5 text-xs font-medium text-muted-foreground'>
										Duration
									</th>
									<th className='text-left px-2 py-2.5 text-xs font-medium text-muted-foreground'>
										Details
									</th>
									<th className='py-2.5 pr-4 pl-2 w-16' />
								</tr>
							</thead>
							<tbody>
								{historyData.data.map(row => (
									<SyncHistoryRow key={row.id} row={row} />
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}
