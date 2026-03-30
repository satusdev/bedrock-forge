import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
	ArrowRight,
	RefreshCw,
	AlertTriangle,
	ChevronDown,
	ChevronUp,
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
import { ExecutionLogPanel } from '@/components/ui/execution-log-panel';
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
}

interface JobResult {
	jobId: string;
	status: string;
	message?: string;
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

export function SyncTab({
	projectId,
	environments,
}: {
	projectId: number;
	environments: Environment[];
}) {
	const [sourceId, setSourceId] = useState<string>('');
	const [targetId, setTargetId] = useState<string>('');
	const [jobId, setJobId] = useState<string | null>(null);
	const [jobExecutionId, setJobExecutionId] = useState<number | null>(null);
	const [progress, setProgress] = useState<JobProgress | null>(null);
	const [jobDone, setJobDone] = useState<JobResult | null>(null);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [logExpanded, setLogExpanded] = useState(false);

	const source = environments.find(e => e.id.toString() === sourceId) ?? null;
	const target = environments.find(e => e.id.toString() === targetId) ?? null;

	const cloneMutation = useMutation({
		mutationFn: () =>
			api.post<{ jobId: string; jobExecutionId: number }>('/sync/clone', {
				sourceEnvironmentId: Number(sourceId),
				targetEnvironmentId: Number(targetId),
			}),
		onSuccess: res => {
			setJobId(res.jobId);
			setJobExecutionId(res.jobExecutionId);
			setJobDone(null);
			setProgress(null);
			setLogExpanded(false);
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
			toast({ title: 'Sync completed successfully' });
		}
	});

	useWebSocketEvent('job:failed', (raw: unknown) => {
		const r = raw as JobResult;
		if (r.jobId === jobId) {
			setJobDone({ ...r, status: 'failed' });
			toast({
				title: 'Sync failed',
				description: r.message,
				variant: 'destructive',
			});
		}
	});

	const hasGdrive = !target || !!target.google_drive_folder_id;
	const canSync = sourceId && targetId && sourceId !== targetId && hasGdrive;
	const isBusy = cloneMutation.isPending || (!!jobId && !jobDone);

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

			{/* Source / Target selectors */}
			<div className='grid grid-cols-[1fr_auto_1fr] gap-4 items-end'>
				<div className='space-y-1.5'>
					<label className='text-sm font-medium'>Source</label>
					<Select value={sourceId} onValueChange={setSourceId}>
						<SelectTrigger>
							<SelectValue placeholder='Select source…' />
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
							<SelectValue placeholder='Select target…' />
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

			{/* Preview cards */}
			<div className='flex items-center gap-3'>
				<EnvCard env={source} label='Source' />
				<ArrowRight className='h-6 w-6 text-muted-foreground flex-none' />
				<EnvCard env={target} label='Target' />
			</div>

			{/* GDrive warning */}
			{target && !target.google_drive_folder_id && (
				<div className='flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm text-warning-foreground'>
					<AlertTriangle className='h-4 w-4 mt-0.5 flex-none text-amber-500' />
					<div>
						<p className='font-medium text-amber-700 dark:text-amber-400'>
							Google Drive folder required
						</p>
						<p className='text-xs text-muted-foreground mt-0.5'>
							A safety backup is mandatory before overwriting the target. Set a
							Google Drive folder on the <strong>{target.type}</strong>{' '}
							environment to enable sync.
						</p>
					</div>
				</div>
			)}

			{/* Sync button */}
			<Button
				disabled={!canSync || isBusy}
				variant='destructive'
				title={
					!hasGdrive
						? 'Configure a Google Drive folder on the target environment first'
						: undefined
				}
				onClick={() => setConfirmOpen(true)}
			>
				<RefreshCw
					className={`h-4 w-4 mr-1.5 ${isBusy ? 'animate-spin' : ''}`}
				/>
				{isBusy ? 'Syncing…' : 'Start Sync'}
			</Button>

			<AlertDialog
				open={confirmOpen}
				onOpenChange={setConfirmOpen}
				title='Confirm Sync — This will overwrite data'
				description={`The ${target?.type ?? ''} environment on ${target?.server.name ?? ''} will be completely overwritten with data from ${source?.type ?? ''}. A backup snapshot will be taken on the target before proceeding.`}
				confirmLabel='Yes, start sync'
				confirmVariant='destructive'
				onConfirm={() => {
					setConfirmOpen(false);
					cloneMutation.mutate();
				}}
			/>

			{/* Progress */}
			{(progress || jobDone) && (
				<div className='border rounded-lg p-4 space-y-3'>
					{progress && !jobDone && (
						<>
							<div className='flex justify-between text-sm'>
								<span className='text-muted-foreground'>
									{progress.message}
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

					{/* Execution Log */}
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
		</div>
	);
}
