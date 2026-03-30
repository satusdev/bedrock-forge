import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, HardDrive, CheckCircle2, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useWebSocketEvent, useSubscribeEnvironment } from '@/lib/websocket';
import { ExecutionLogPanel } from '@/components/ui/execution-log-panel';

interface Environment {
	id: number;
	type: string;
	url?: string;
	server: { name: string };
}

interface Backup {
	id: number;
	type: 'full' | 'db_only' | 'files_only';
	status: 'pending' | 'running' | 'completed' | 'failed';
	size_bytes: number | null;
	created_at: string;
	completed_at: string | null;
}

const BACKUP_TYPE_LABELS: Record<string, string> = {
	full: 'Full',
	db_only: 'Database',
	files_only: 'Files',
};

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
	return `${(bytes / 1073741824).toFixed(2)} GB`;
}

export function RestoreTab({
	environments,
}: {
	projectId: number;
	environments: Environment[];
}) {
	const qc = useQueryClient();
	const [selectedEnvId, setSelectedEnvId] = useState<number | null>(
		environments[0]?.id ?? null,
	);
	const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
	const [jobProgress, setJobProgress] = useState<number | null>(null);
	const [jobExecutionId, setJobExecutionId] = useState<number | null>(null);
	const restoreJobIdRef = useRef<string | null>(null);
	const restoreEnvIdRef = useRef<number | null>(null);

	useSubscribeEnvironment(selectedEnvId);

	const { data, isLoading } = useQuery({
		queryKey: ['backups', selectedEnvId],
		enabled: !!selectedEnvId,
		queryFn: () =>
			api.get<{ items: Backup[]; total: number }>(
				`/backups/environment/${selectedEnvId}?page=1&limit=50`,
			),
	});

	const completedBackups =
		data?.items.filter(b => b.status === 'completed') ?? [];

	// WebSocket: track restore job progress
	useWebSocketEvent('job:progress', (raw: unknown) => {
		const event = raw as {
			queueName: string;
			jobId: string;
			progress: number;
			environmentId?: number;
		};
		const isOurs =
			event.queueName === 'backups' &&
			(event.environmentId === restoreEnvIdRef.current ||
				(event.jobId != null && event.jobId === restoreJobIdRef.current));
		if (isOurs) setJobProgress(event.progress);
	});

	useWebSocketEvent('job:completed', (raw: unknown) => {
		const event = raw as {
			queueName: string;
			jobId?: string;
			environmentId?: number;
		};
		const isOurs =
			event.queueName === 'backups' &&
			(event.environmentId === restoreEnvIdRef.current ||
				(event.jobId != null && event.jobId === restoreJobIdRef.current));
		if (!isOurs) return;
		restoreJobIdRef.current = null;
		restoreEnvIdRef.current = null;
		setJobProgress(null);
		qc.invalidateQueries({ queryKey: ['backups', selectedEnvId] });
		toast({ title: 'Restore completed successfully' });
	});

	useWebSocketEvent('job:failed', (raw: unknown) => {
		const event = raw as {
			queueName: string;
			jobId?: string;
			environmentId?: number;
			error?: string;
		};
		const isOurs =
			event.queueName === 'backups' &&
			(event.environmentId === restoreEnvIdRef.current ||
				(event.jobId != null && event.jobId === restoreJobIdRef.current));
		if (!isOurs) return;
		restoreJobIdRef.current = null;
		restoreEnvIdRef.current = null;
		setJobProgress(null);
		qc.invalidateQueries({ queryKey: ['backups', selectedEnvId] });
		toast({
			title: 'Restore failed',
			description: event.error ?? 'An unexpected error occurred',
			variant: 'destructive',
		});
	});

	const restoreMutation = useMutation({
		mutationFn: (backupId: number) =>
			api.post<{ jobExecutionId: number; bullJobId: string }>(
				'/backups/restore',
				{ backupId },
			),
		onSuccess: (result, backupId) => {
			restoreJobIdRef.current = result?.bullJobId ?? null;
			restoreEnvIdRef.current = selectedEnvId;
			setJobProgress(0);
			setJobExecutionId(result?.jobExecutionId ?? null);
			setRestoreTarget(null);
			toast({
				title: 'Restore queued',
				description: `Backup #${backupId} restore job is running`,
			});
		},
		onError: () =>
			toast({ title: 'Restore failed to start', variant: 'destructive' }),
	});

	if (environments.length === 0) {
		return (
			<div className='text-center py-12 text-muted-foreground'>
				<HardDrive className='h-10 w-10 mx-auto mb-3 opacity-40' />
				<p className='font-medium'>No environments configured</p>
				<p className='text-sm mt-1'>
					Add an environment first to restore backups
				</p>
			</div>
		);
	}

	const selectedEnv = environments.find(e => e.id === selectedEnvId);
	const isRestoring = jobProgress !== null;

	return (
		<div className='space-y-5'>
			{/* Environment selector */}
			<div className='flex flex-wrap items-center gap-3'>
				<Select
					value={selectedEnvId?.toString()}
					onValueChange={v => {
						setSelectedEnvId(Number(v));
						setJobProgress(null);
						setJobExecutionId(null);
						restoreJobIdRef.current = null;
						restoreEnvIdRef.current = null;
					}}
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
			</div>

			{/* Active restore progress + live log */}
			{isRestoring && (
				<div className='border rounded-lg p-4 space-y-2 bg-card'>
					<div className='flex items-center gap-2 text-sm font-medium'>
						<RotateCcw className='h-4 w-4 animate-spin text-primary' />
						Restore in progress…
					</div>
					<div className='h-2 rounded-full bg-muted overflow-hidden'>
						<div
							className='h-2 bg-primary rounded-full transition-all duration-300'
							style={{ width: `${jobProgress ?? 0}%` }}
						/>
					</div>
					<p className='text-xs text-muted-foreground text-right'>
						{jobProgress ?? 0}%
					</p>
					{jobExecutionId && (
						<div className='mt-3 border-t pt-3'>
							<ExecutionLogPanel
								jobExecutionId={jobExecutionId}
								isActive={isRestoring}
							/>
						</div>
					)}
				</div>
			)}

			{/* Backups list */}
			{!selectedEnvId && (
				<p className='text-sm text-muted-foreground'>
					Select an environment to see restorable backups.
				</p>
			)}

			{selectedEnvId && isLoading && (
				<div className='space-y-2'>
					{[1, 2, 3].map(i => (
						<Skeleton key={i} className='h-16 rounded-lg' />
					))}
				</div>
			)}

			{selectedEnvId && !isLoading && completedBackups.length === 0 && (
				<div className='text-center py-16 border rounded-xl text-muted-foreground'>
					<CheckCircle2 className='h-10 w-10 mx-auto mb-3 opacity-40' />
					<p className='font-medium'>No completed backups</p>
					<p className='text-sm mt-1'>
						Create a backup first from the{' '}
						<span className='font-medium'>Backups</span> tab
					</p>
				</div>
			)}

			{selectedEnvId && !isLoading && completedBackups.length > 0 && (
				<>
					<p className='text-sm text-muted-foreground'>
						{completedBackups.length} restorable backup
						{completedBackups.length !== 1 ? 's' : ''} for{' '}
						<span className='font-medium capitalize'>
							{selectedEnv?.type ?? `env #${selectedEnvId}`}
						</span>{' '}
						— restoring will overwrite the current site
					</p>

					<div className='border rounded-lg overflow-hidden'>
						<table className='w-full text-sm'>
							<thead className='border-b bg-muted/40'>
								<tr>
									<th className='text-left px-4 py-3 font-medium'>Type</th>
									<th className='text-left px-4 py-3 font-medium'>Size</th>
									<th className='text-left px-4 py-3 font-medium'>Created</th>
									<th className='text-left px-4 py-3 font-medium'>Completed</th>
									<th className='w-24' />
								</tr>
							</thead>
							<tbody className='divide-y'>
								{completedBackups.map(b => (
									<tr
										key={b.id}
										className='hover:bg-muted/20 transition-colors'
									>
										<td className='px-4 py-3'>
											<Badge variant='outline' className='text-xs'>
												{BACKUP_TYPE_LABELS[b.type]}
											</Badge>
										</td>
										<td className='px-4 py-3 text-muted-foreground font-mono text-xs'>
											{b.size_bytes ? formatBytes(b.size_bytes) : '—'}
										</td>
										<td className='px-4 py-3 text-muted-foreground text-xs'>
											{new Date(b.created_at).toLocaleString()}
										</td>
										<td className='px-4 py-3 text-muted-foreground text-xs'>
											{b.completed_at
												? new Date(b.completed_at).toLocaleString()
												: '—'}
										</td>
										<td className='px-3 py-3'>
											<Button
												variant='outline'
												size='sm'
												className='h-7 text-xs gap-1.5'
												disabled={isRestoring || restoreMutation.isPending}
												onClick={() => setRestoreTarget(b)}
											>
												<RotateCcw className='h-3 w-3' />
												Restore
											</Button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			)}

			<AlertDialog
				open={!!restoreTarget}
				onOpenChange={o => !o && setRestoreTarget(null)}
				title='Restore Backup'
				description={`This will overwrite all current site files and/or database on "${selectedEnv?.type ?? ''}" with the ${restoreTarget ? BACKUP_TYPE_LABELS[restoreTarget.type] : ''} backup from ${restoreTarget ? new Date(restoreTarget.created_at).toLocaleString() : ''}. This cannot be undone.`}
				confirmLabel='Restore'
				confirmVariant='destructive'
				onConfirm={() =>
					restoreTarget && restoreMutation.mutate(restoreTarget.id)
				}
				isPending={restoreMutation.isPending}
			/>
		</div>
	);
}
