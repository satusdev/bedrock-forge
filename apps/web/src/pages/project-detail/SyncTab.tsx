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
	Database,
	Files,
	Upload,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
	protected_tables?: string[];
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
	job_type?: string | null;
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
	if (diff < 0) return '\u2014';
	if (diff < 1000) return `${diff}ms`;
	if (diff < 60_000) return `${(diff / 1000).toFixed(1)}s`;
	const mins = Math.floor(diff / 60_000);
	const secs = Math.floor((diff % 60_000) / 1000);
	return `${mins}m ${secs}s`;
}

function jobTypeLabel(row: JobExecutionRow): string {
	if (row.job_type === 'sync:push') return 'Push';
	if (row.job_type === 'sync:clone') return 'Clone';
	return row.environment?.type ?? '\u2014';
}

function SyncHistoryRow({
	row,
	onCancel,
	isCancelling,
}: {
	row: JobExecutionRow;
	onCancel?: (id: number) => void;
	isCancelling?: boolean;
}) {
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
				<td className='py-2.5 px-2 text-xs text-muted-foreground'>
					{jobTypeLabel(row)}
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
					<div className='flex items-center gap-1 justify-end'>
						<ExpandLogButton
							expanded={expanded}
							onToggle={() => setExpanded(v => !v)}
						/>
						{row.status === 'active' && (
							<Button
								variant='ghost'
								size='icon'
								disabled={isCancelling}
								onClick={() => onCancel?.(row.id)}
								title='Force stop job'
							>
								<XCircle className='h-4 w-4 text-destructive' />
							</Button>
						)}
					</div>
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

// ── Job progress panel ────────────────────────────────────────────────────────

function JobProgressPanel({
	progress,
	jobDone,
	jobExecutionId,
	isBusy,
	onCancel,
	isCancelling,
}: {
	progress: JobProgress | null;
	jobDone: JobResult | null;
	jobExecutionId: number | null;
	isBusy: boolean;
	onCancel?: () => void;
	isCancelling?: boolean;
}) {
	const [logExpanded, setLogExpanded] = useState(false);

	if (!progress && !jobDone) return null;

	return (
		<div className='border rounded-lg p-4 space-y-3'>
			{progress && !jobDone && (
				<>
					<div className='flex justify-between items-start text-sm gap-2'>
						<span className='text-muted-foreground flex-1'>
							{progress.step ?? progress.message}
						</span>
						<div className='flex items-center gap-2 shrink-0'>
							<span className='font-medium'>{progress.progress}%</span>
							{onCancel && (
								<Button
									variant='outline'
									size='sm'
									className='h-7 text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10'
									disabled={isCancelling}
									onClick={onCancel}
								>
									<XCircle className='h-3.5 w-3.5' />
									{isCancelling ? 'Stopping…' : 'Stop'}
								</Button>
							)}
						</div>
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
						variant={jobDone.status === 'completed' ? 'default' : 'destructive'}
					>
						{jobDone.status === 'completed' ? 'Completed' : 'Failed'}
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
	);
}

// ── Clone panel ───────────────────────────────────────────────────────────────

function ClonePanel({
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

	const source = environments.find(e => e.id.toString() === sourceId) ?? null;
	const target = environments.find(e => e.id.toString() === targetId) ?? null;

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

	const cancelCloneMutation = useMutation({
		mutationFn: (execId: number) =>
			api.post<{ cancelled: boolean }>(`/sync/execution/${execId}/cancel`, {}),
		onSuccess: () => {
			setJobId(null);
			setJobExecutionId(null);
			setProgress(null);
			setJobDone({ jobId: '', status: 'failed', message: 'Cancelled by user' });
			qc.invalidateQueries({ queryKey: ['sync-history', projectId] });
			toast({ title: 'Clone job cancelled' });
		},
		onError: () =>
			toast({ title: 'Could not cancel clone', variant: 'destructive' }),
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
			toast({ title: 'Clone completed successfully' });
		}
	});
	useWebSocketEvent('job:failed', (raw: unknown) => {
		const r = raw as JobResult;
		if (r.jobId === jobId) {
			setJobDone({ ...r, status: 'failed' });
			qc.invalidateQueries({ queryKey: ['sync-history', projectId] });
			toast({
				title: 'Clone failed',
				description: r.message,
				variant: 'destructive',
			});
		}
	});

	const hasGdrive =
		skipSafetyBackup || !target || !!target.google_drive_folder_id;
	const canSync = sourceId && targetId && sourceId !== targetId && hasGdrive;
	const isBusy = cloneMutation.isPending || (!!jobId && !jobDone);

	return (
		<div className='space-y-5'>
			<p className='text-sm text-muted-foreground'>
				Clones the database from source to target (mysqldump + import + URL
				search-replace). A safety backup is uploaded to Google Drive before
				overwriting.
			</p>

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

			{target?.protected_tables && target.protected_tables.length > 0 && (
				<div className='flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950/40'>
					<Database className='h-4 w-4 mt-0.5 flex-none text-blue-500' />
					<div>
						<p className='font-medium text-blue-700 dark:text-blue-400'>Protected tables will be preserved</p>
						<p className='text-xs text-muted-foreground mt-0.5'>
							{target.protected_tables.join(', ')} — these tables on the target will not be overwritten
						</p>
					</div>
				</div>
			)}

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

			<div className='flex items-start gap-2.5'>
				<Switch
					id='clone-skip-backup'
					checked={skipSafetyBackup}
					onCheckedChange={setSkipSafetyBackup}
					className='mt-0.5 shrink-0'
				/>
				<div className='space-y-0.5'>
					<Label
						htmlFor='clone-skip-backup'
						className='flex items-center gap-1.5 cursor-pointer text-sm font-medium'
					>
						<ShieldOff className='h-3.5 w-3.5 text-amber-500' />
						Skip safety backup
					</Label>
					<p className='text-xs text-muted-foreground'>
						Bypasses the mandatory pre-sync backup. Use only if you accept the
						risk of data loss.
					</p>
				</div>
			</div>

			{skipSafetyBackup && (
				<div className='flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive'>
					<AlertTriangle className='h-3.5 w-3.5 mt-0.5 flex-none' />
					<span>
						<strong>No backup will be taken.</strong> If the sync fails there
						will be no automatic recovery point.
					</span>
				</div>
			)}

			<Button
				disabled={!canSync || isBusy}
				variant='destructive'
				onClick={() => setConfirmOpen(true)}
			>
				<RefreshCw
					className={`h-4 w-4 mr-1.5 ${isBusy ? 'animate-spin' : ''}`}
				/>
				{isBusy ? 'Cloning\u2026' : 'Start Clone'}
			</Button>

			<AlertDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				title={
					skipSafetyBackup
						? 'Confirm Clone \u2014 NO backup will be taken'
						: 'Confirm Clone \u2014 This will overwrite data'
				}
				description={
					skipSafetyBackup
						? `You have opted to skip the safety backup. The ${target?.type ?? ''} environment will be completely overwritten \u2014 with NO prior backup.`
						: `The ${target?.type ?? ''} environment on ${target?.server.name ?? ''} will be completely overwritten with data from ${source?.type ?? ''}. A backup snapshot will be taken first.`
				}
				confirmLabel='Yes, start clone'
				confirmVariant='destructive'
				onConfirm={() => {
					setConfirmOpen(false);
					cloneMutation.mutate();
				}}
			/>

			<JobProgressPanel
				progress={progress}
				jobDone={jobDone}
				jobExecutionId={jobExecutionId}
				isBusy={isBusy}
			/>
		</div>
	);
}

// ── Push panel ────────────────────────────────────────────────────────────────

const SCOPE_OPTIONS = [
	{
		value: 'database',
		label: 'Database only',
		icon: Database,
		desc: 'mysqldump + import + URL search-replace (DROP & recreate)',
	},
	{
		value: 'files',
		label: 'Files only',
		icon: Files,
		desc: 'Full site via rsync — excludes .env, wp-config.php, .htaccess',
	},
	{
		value: 'both',
		label: 'Database + Files',
		icon: Upload,
		desc: 'Database first (clean slate), then full site files',
	},
] as const;

type Scope = 'database' | 'files' | 'both';

function PushPanel({
	projectId,
	environments,
}: {
	projectId: number;
	environments: Environment[];
}) {
	const qc = useQueryClient();
	const [sourceId, setSourceId] = useState<string>('');
	const [targetId, setTargetId] = useState<string>('');
	const [scope, setScope] = useState<Scope>('database');
	const [skipSafetyBackup, setSkipSafetyBackup] = useState(false);
	const [jobId, setJobId] = useState<string | null>(null);
	const [jobExecutionId, setJobExecutionId] = useState<number | null>(null);
	const [progress, setProgress] = useState<JobProgress | null>(null);
	const [jobDone, setJobDone] = useState<JobResult | null>(null);
	const [confirmOpen, setConfirmOpen] = useState(false);

	const source = environments.find(e => e.id.toString() === sourceId) ?? null;
	const target = environments.find(e => e.id.toString() === targetId) ?? null;

	const pushMutation = useMutation({
		mutationFn: () =>
			api.post<{ jobId: string; jobExecutionId: number }>('/sync/push', {
				sourceEnvironmentId: Number(sourceId),
				targetEnvironmentId: Number(targetId),
				scope,
				skipSafetyBackup,
			}),
		onSuccess: res => {
			setJobId(res.jobId);
			setJobExecutionId(res.jobExecutionId);
			setJobDone(null);
			setProgress(null);
			qc.invalidateQueries({ queryKey: ['sync-history', projectId] });
			toast({ title: 'Push job queued', description: `Job ${res.jobId}` });
		},
		onError: (err: unknown) => {
			const msg = err instanceof Error ? err.message : 'Failed to queue push';
			toast({
				title: 'Push failed to queue',
				description: msg,
				variant: 'destructive',
			});
		},
	});

	const cancelPushMutation = useMutation({
		mutationFn: (execId: number) =>
			api.post<{ cancelled: boolean }>(`/sync/execution/${execId}/cancel`, {}),
		onSuccess: () => {
			setJobId(null);
			setJobExecutionId(null);
			setProgress(null);
			setJobDone({ jobId: '', status: 'failed', message: 'Cancelled by user' });
			qc.invalidateQueries({ queryKey: ['sync-history', projectId] });
			toast({ title: 'Push job cancelled' });
		},
		onError: () =>
			toast({ title: 'Could not cancel push', variant: 'destructive' }),
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
			toast({ title: 'Push completed successfully' });
		}
	});
	useWebSocketEvent('job:failed', (raw: unknown) => {
		const r = raw as JobResult;
		if (r.jobId === jobId) {
			setJobDone({ ...r, status: 'failed' });
			qc.invalidateQueries({ queryKey: ['sync-history', projectId] });
			toast({
				title: 'Push failed',
				description: r.message,
				variant: 'destructive',
			});
		}
	});

	const needsGdrive = scope !== 'files';
	const hasGdrive =
		!needsGdrive ||
		skipSafetyBackup ||
		!target ||
		!!target.google_drive_folder_id;
	const canPush = sourceId && targetId && sourceId !== targetId && hasGdrive;
	const isBusy = pushMutation.isPending || (!!jobId && !jobDone);

	const ScopeIcon = SCOPE_OPTIONS.find(o => o.value === scope)?.icon ?? Upload;

	return (
		<div className='space-y-5'>
			<p className='text-sm text-muted-foreground'>
				Push data from one environment to another — choose database, files
				(wp-content/), or both. Uses rsync for fast file transfer with a tar
				relay fallback.
			</p>

			{/* Scope selector */}
			<div className='space-y-1.5'>
				<label className='text-sm font-medium'>What to push</label>
				<div className='grid grid-cols-3 gap-2'>
					{SCOPE_OPTIONS.map(({ value, label, icon: Icon, desc }) => (
						<button
							key={value}
							type='button'
							onClick={() => setScope(value as Scope)}
							className={`rounded-lg border p-3 text-left transition-colors space-y-0.5 ${
								scope === value
									? 'border-primary bg-primary/5'
									: 'hover:border-muted-foreground/40'
							}`}
						>
							<div className='flex items-center gap-1.5 text-sm font-medium'>
								<Icon className='h-3.5 w-3.5' />
								{label}
							</div>
							<p className='text-xs text-muted-foreground'>{desc}</p>
						</button>
					))}
				</div>
			</div>

			{/* Source / target selectors */}
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
				<div className='flex flex-col items-center gap-1 flex-none'>
					<ArrowRight className='h-6 w-6 text-muted-foreground' />
					<ScopeIcon className='h-3.5 w-3.5 text-muted-foreground' />
				</div>
				<EnvCard env={target} label='Target' />
			</div>

			{(scope === 'database' || scope === 'both') &&
				target?.protected_tables &&
				target.protected_tables.length > 0 && (
					<div className='flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-800 dark:bg-blue-950/40'>
						<Database className='h-4 w-4 mt-0.5 flex-none text-blue-500' />
						<div>
							<p className='font-medium text-blue-700 dark:text-blue-400'>Protected tables will be preserved</p>
							<p className='text-xs text-muted-foreground mt-0.5'>
								{target.protected_tables.join(', ')} — these tables on the target will not be overwritten
							</p>
						</div>
					</div>
				)}

			{needsGdrive &&
				target &&
				!target.google_drive_folder_id &&
				!skipSafetyBackup && (
					<div className='flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40'>
						<AlertTriangle className='h-4 w-4 mt-0.5 flex-none text-amber-500' />
						<div>
							<p className='font-medium text-amber-700 dark:text-amber-400'>
								Google Drive folder required for safety backup
							</p>
							<p className='text-xs text-muted-foreground mt-0.5'>
								Database operations require a backup before overwriting. Set a
								Google Drive folder on the <strong>{target.type}</strong>{' '}
								environment, or enable "Skip safety backup" below.
							</p>
						</div>
					</div>
				)}

			{needsGdrive && (
				<div className='flex items-start gap-2.5'>
					<Switch
						id='push-skip-backup'
						checked={skipSafetyBackup}
						onCheckedChange={setSkipSafetyBackup}
						className='mt-0.5 shrink-0'
					/>
					<div className='space-y-0.5'>
						<Label
							htmlFor='push-skip-backup'
							className='flex items-center gap-1.5 cursor-pointer text-sm font-medium'
						>
							<ShieldOff className='h-3.5 w-3.5 text-amber-500' />
							Skip safety backup
						</Label>
						<p className='text-xs text-muted-foreground'>
							Push database without a prior snapshot. Use when target has no
							Google Drive folder or you accept data-loss risk.
						</p>
					</div>
				</div>
			)}

			{skipSafetyBackup && needsGdrive && (
				<div className='flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive'>
					<AlertTriangle className='h-3.5 w-3.5 mt-0.5 flex-none' />
					<span>
						<strong>No backup will be taken.</strong> If the push fails there
						will be no automatic recovery point.
					</span>
				</div>
			)}

			<Button
				disabled={!canPush || isBusy}
				variant='destructive'
				onClick={() => setConfirmOpen(true)}
			>
				<Upload className={`h-4 w-4 mr-1.5 ${isBusy ? 'animate-pulse' : ''}`} />
				{isBusy ? 'Pushing\u2026' : 'Start Push'}
			</Button>

			<AlertDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				title='Confirm Push \u2014 This will overwrite data'
				description={`The ${target?.type ?? ''} environment on ${target?.server.name ?? ''} will have its ${scope === 'both' ? 'database and files' : scope === 'database' ? 'database' : 'wp-content files'} overwritten with data from ${source?.type ?? ''}.${skipSafetyBackup && needsGdrive ? ' No backup will be taken.' : ''}`}
				confirmLabel='Yes, start push'
				confirmVariant='destructive'
				onConfirm={() => {
					setConfirmOpen(false);
					pushMutation.mutate();
				}}
			/>

			<JobProgressPanel
				progress={progress}
				jobDone={jobDone}
				jobExecutionId={jobExecutionId}
				isBusy={isBusy}
				onCancel={
					jobExecutionId && !jobDone
						? () => cancelPushMutation.mutate(jobExecutionId)
						: undefined
				}
				isCancelling={cancelPushMutation.isPending}
			/>
		</div>
	);
}

// ── Main SyncTab ──────────────────────────────────────────────────────────────

export function SyncTab({
	projectId,
	environments,
}: {
	projectId: number;
	environments: Environment[];
}) {
	const envIds = environments.map(e => e.id).join(',');

	const qc = useQueryClient();

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

	const cancelHistoryMutation = useMutation({
		mutationFn: (id: number) =>
			api.post<{ cancelled: boolean }>(`/sync/execution/${id}/cancel`, {}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['sync-history', projectId] });
			toast({ title: 'Job stopped' });
		},
		onError: () =>
			toast({ title: 'Could not stop job', variant: 'destructive' }),
	});

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
					Clone copies data from source to target. Push lets you select scope
					(database, files, or both) for more granular control.
				</p>
			</div>

			<Tabs defaultValue='clone'>
				<TabsList className='w-full'>
					<TabsTrigger value='clone' className='flex-1'>
						<Database className='h-3.5 w-3.5 mr-1.5' />
						Clone DB
					</TabsTrigger>
					<TabsTrigger value='push' className='flex-1'>
						<Upload className='h-3.5 w-3.5 mr-1.5' />
						Push
					</TabsTrigger>
				</TabsList>
				<TabsContent value='clone' className='pt-4'>
					<ClonePanel projectId={projectId} environments={environments} />
				</TabsContent>
				<TabsContent value='push' className='pt-4'>
					<PushPanel projectId={projectId} environments={environments} />
				</TabsContent>
			</Tabs>

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
										Type
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
									<SyncHistoryRow
										key={row.id}
										row={row}
										onCancel={cancelHistoryMutation.mutate}
										isCancelling={cancelHistoryMutation.isPending}
									/>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}
