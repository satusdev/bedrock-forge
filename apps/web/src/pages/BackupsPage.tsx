import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, Fragment } from 'react';
import { Trash2, Download, RotateCcw, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';
import { useWebSocketEvent, useSubscribeEnvironment } from '@/lib/websocket';
import { WS_EVENTS } from '@bedrock-forge/shared';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Pagination } from '@/components/crud';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
	ExecutionLogPanel,
	ExpandLogButton,
} from '@/components/ui/execution-log-panel';

interface Environment {
	id: number;
	type: string;
	url: string;
	google_drive_folder_id: string | null;
	project: { id: number; name: string };
	server: { name: string };
}

interface Backup {
	id: number;
	type: string;
	status: string;
	size_bytes: number | null;
	error_message: string | null;
	created_at: string;
	jobExecution: {
		id: number;
		status: string;
		progress: number;
		last_error: string | null;
		execution_log: unknown[] | null;
	} | null;
}

interface PaginatedBackups {
	items: Backup[];
	total: number;
}

function fmt(bytes: number | null) {
	if (!bytes) return '—';
	if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
	return `${(bytes / 1048576).toFixed(1)} MB`;
}

const BACKUP_TYPES = [
	{ value: 'full', label: 'Full (files + DB)' },
	{ value: 'db_only', label: 'Database only' },
	{ value: 'files_only', label: 'Files only' },
];

export function BackupsPage() {
	const qc = useQueryClient();
	const [envId, setEnvId] = useState<number | null>(null);
	const [backupType, setBackupType] = useState<string>('full');
	const [page, setPage] = useState(1);
	const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);
	const isAdmin = useAuthStore(s => s.user?.roles?.includes('admin') ?? false);
	const [jobProgress, setJobProgress] = useState<Record<string, number>>({});

	// GET /environments — flat endpoint added by our backend fix
	const { data: envs } = useQuery({
		queryKey: ['environments-all'],
		queryFn: () => api.get<Environment[]>('/environments'),
	});

	// GET /backups/environment/:envId — correct nested route
	const { data: backupsData, isLoading } = useQuery({
		queryKey: ['backups', envId, page],
		queryFn: () =>
			api.get<PaginatedBackups>(
				`/backups/environment/${envId}?page=${page}&limit=20`,
			),
		enabled: !!envId,
		// Polling fallback: recover if a WS event was missed or the socket dropped
		refetchInterval: 15_000,
	});

	const createBackup = useMutation({
		mutationFn: () =>
			api.post('/backups/create', {
				environmentId: envId,
				type: backupType,
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['backups', envId] });
			toast({ title: 'Backup started' });
		},
		onError: () =>
			toast({ title: 'Backup failed to start', variant: 'destructive' }),
	});

	const restoreBackup = useMutation({
		mutationFn: (backupId: number) =>
			api.post('/backups/restore', { backupId }),
		onSuccess: () => {
			setRestoreTarget(null);
			toast({ title: 'Restore job queued' });
		},
		onError: () => toast({ title: 'Restore failed', variant: 'destructive' }),
	});

	const deleteBackup = useMutation({
		mutationFn: (id: number) => api.delete(`/backups/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['backups', envId] });
			setDeleteTarget(null);
			toast({ title: 'Backup deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	// Subscribe to environment WS room so targeted events are received
	useSubscribeEnvironment(envId);

	useWebSocketEvent(WS_EVENTS.JOB_PROGRESS, data => {
		const d = data as { queueName: string; jobId: string; progress: number };
		if (d.queueName !== 'backups') return;
		setJobProgress(p => ({ ...p, [d.jobId]: d.progress }));
	});

	useWebSocketEvent(WS_EVENTS.JOB_COMPLETED, data => {
		const d = data as { queueName: string };
		if (d.queueName !== 'backups') return;
		qc.invalidateQueries({ queryKey: ['backups', envId] });
		setJobProgress({});
	});

	useWebSocketEvent(WS_EVENTS.JOB_FAILED, data => {
		const d = data as { jobId: string; error?: string; queueName: string };
		if (d.queueName !== 'backups') return;
		setJobProgress(p => {
			const next = { ...p };
			delete next[d.jobId];
			return next;
		});
		qc.invalidateQueries({ queryKey: ['backups', envId] });
		toast({
			title: 'Backup failed',
			description: d.error ?? 'An unexpected error occurred',
			variant: 'destructive',
		});
	});

	const selectedEnv = envs?.find(e => e.id === envId);
	const missingFolderId = !!selectedEnv && !selectedEnv.google_drive_folder_id;
	const totalPages = backupsData ? Math.ceil(backupsData.total / 20) : 1;
	const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

	return (
		<div className='space-y-4'>
			<h1 className='text-2xl font-bold'>Backups</h1>

			{/* Environment + type selector */}
			<div className='flex flex-wrap items-end gap-4 bg-card border rounded-lg p-4'>
				<div className='space-y-1'>
					<Label>Environment</Label>
					<Select
						value={envId?.toString() ?? ''}
						onValueChange={v => {
							setEnvId(v ? Number(v) : null);
							setPage(1);
						}}
					>
						<SelectTrigger className='w-64'>
							<SelectValue placeholder='Select environment…' />
						</SelectTrigger>
						<SelectContent>
							{envs?.map(e => (
								<SelectItem key={e.id} value={e.id.toString()}>
									{e.project.name} — {e.type} ({e.server.name})
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className='space-y-1'>
					<Label>Backup type</Label>
					<Select value={backupType} onValueChange={setBackupType}>
						<SelectTrigger className='w-44'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{BACKUP_TYPES.map(t => (
								<SelectItem key={t.value} value={t.value}>
									{t.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<Button
					onClick={() => createBackup.mutate()}
					disabled={!envId || createBackup.isPending || missingFolderId}
				>
					{createBackup.isPending ? 'Starting…' : 'Create Backup'}
				</Button>
			</div>

			{missingFolderId && (
				<div className='flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'>
					<AlertCircle className='h-4 w-4 mt-0.5 shrink-0' />
					<div>
						<p className='font-medium'>No Google Drive folder configured</p>
						<p className='text-xs mt-0.5 opacity-80'>
							This environment has no Google Drive Folder ID set. Go to the
							project’s{' '}
							<a
								href={`/projects/${selectedEnv.project.id}`}
								className='underline font-medium'
							>
								Environments tab
							</a>{' '}
							to add it.
						</p>
					</div>
				</div>
			)}

			{/* Active job progress */}
			{Object.keys(jobProgress).length > 0 && (
				<div className='space-y-2 bg-card border rounded-lg p-4'>
					<p className='text-sm font-medium'>Active jobs</p>
					{Object.entries(jobProgress).map(([jobId, progress]) => (
						<div key={jobId}>
							<div className='flex justify-between text-xs mb-1'>
								<span className='font-mono text-muted-foreground'>{jobId}</span>
								<span>{progress}%</span>
							</div>
							<div className='h-1.5 bg-muted rounded-full'>
								<div
									className='h-1.5 bg-primary rounded-full transition-all'
									style={{ width: `${progress}%` }}
								/>
							</div>
						</div>
					))}
				</div>
			)}

			{!envId && (
				<p className='text-muted-foreground text-sm'>
					Select an environment to view and create backups.
				</p>
			)}

			{envId && (
				<>
					{backupsData && (
						<p className='text-sm text-muted-foreground'>
							{backupsData.total} backups for{' '}
							<span className='font-medium'>
								{selectedEnv?.project.name ?? `env #${envId}`}
							</span>
						</p>
					)}

					<div className='border rounded-lg overflow-hidden'>
						<table className='w-full text-sm'>
							<thead className='border-b bg-muted/40'>
								<tr>
									<th className='text-left px-4 py-3 font-medium'>Type</th>
									<th className='text-left px-4 py-3 font-medium'>Size</th>
									<th className='text-left px-4 py-3 font-medium'>Status</th>
									<th className='text-left px-4 py-3 font-medium'>Created</th>
									<th className='w-44' />
								</tr>
							</thead>
							<tbody className='divide-y'>
								{isLoading &&
									[1, 2, 3].map(i => (
										<tr key={i}>
											<td colSpan={5} className='px-4 py-3'>
												<Skeleton className='h-5 w-full' />
											</td>
										</tr>
									))}
								{!isLoading &&
									backupsData?.items.map(b => (
										<Fragment key={b.id}>
											<tr>
												<td className='px-4 py-3 capitalize'>{b.type}</td>
												<td className='px-4 py-3 font-mono text-muted-foreground'>
													{fmt(b.size_bytes)}
												</td>
												<td className='px-4 py-3'>
													<Badge
														variant={
															b.status === 'completed'
																? 'success'
																: b.status === 'failed'
																	? 'destructive'
																	: 'warning'
														}
													>
														{b.status}
													</Badge>
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
														)}
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
																variant='outline'
																size='sm'
																className='h-7 text-xs'
																onClick={() => setRestoreTarget(b)}
																disabled={restoreBackup.isPending}
															>
																<RotateCcw className='h-3 w-3 mr-1' />
																Restore
															</Button>
														)}
														{b.status === 'completed' && (
															<Button
																variant='ghost'
																size='icon'
																className='h-7 w-7 text-muted-foreground hover:text-foreground'
																title='Download backup'
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
														{isAdmin && (
															<Button
																variant='ghost'
																size='icon'
																className='h-7 w-7 text-muted-foreground hover:text-destructive'
																onClick={() => setDeleteTarget(b)}
																disabled={deleteBackup.isPending}
																title='Delete backup'
															>
																<Trash2 className='h-3.5 w-3.5' />
															</Button>
														)}
													</div>
												</td>
											</tr>
											{expandedLogId === b.jobExecution?.id && (
												<tr>
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
						{!isLoading && !backupsData?.items.length && (
							<p className='text-center text-muted-foreground py-10 text-sm'>
								No backups yet for this environment.
							</p>
						)}
					</div>

					<Pagination
						page={page}
						totalPages={totalPages}
						onPageChange={setPage}
					/>
				</>
			)}

			<AlertDialog
				open={!!restoreTarget}
				onOpenChange={o => !o && setRestoreTarget(null)}
				title='Restore Backup'
				description={`Restore the ${restoreTarget?.type} backup from ${restoreTarget ? new Date(restoreTarget.created_at).toLocaleString() : ''}? This will overwrite the current site files/database.`}
				confirmLabel='Restore'
				confirmVariant='destructive'
				onConfirm={() =>
					restoreTarget && restoreBackup.mutate(restoreTarget.id)
				}
				isPending={restoreBackup.isPending}
			/>

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title='Delete Backup'
				description={`Permanently delete this ${deleteTarget?.type} backup from ${deleteTarget ? new Date(deleteTarget.created_at).toLocaleString() : ''}? This cannot be undone.`}
				confirmLabel='Delete'
				confirmVariant='destructive'
				onConfirm={() => deleteTarget && deleteBackup.mutate(deleteTarget.id)}
				isPending={deleteBackup.isPending}
			/>
		</div>
	);
}
