import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { HardDrive, Plus, AlertCircle, XCircle } from 'lucide-react';
import { useWebSocketEvent, useSubscribeEnvironment } from '@/lib/websocket';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { AlertDialog } from '@/components/ui/alert-dialog';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Environment, Backup } from './types';
import { backupsApi } from './api';
import { useBackupsQuery, useCancelBackupMutation, useDeleteBackupMutation } from './hooks';
import { BackupsList } from './components/BackupsList';
import { BackupScheduleSection } from './components/BackupScheduleSection';

export function BackupsTab({
	projectId,
	environments,
}: {
	projectId: number;
	environments: Environment[];
}) {
	const qc = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const envParam = searchParams.get('env');
	const initialEnvId = envParam ? Number(envParam) : null;
	const validInitialEnv = environments.find(e => e.id === initialEnvId)
		? initialEnvId
		: (environments[0]?.id ?? null);

	const [selectedEnvId, setSelectedEnvId] = useState<number | null>(validInitialEnv);

	useEffect(() => {
		if (selectedEnvId) {
			setSearchParams(prev => {
				const next = new URLSearchParams(prev);
				if (next.get('env') !== String(selectedEnvId)) {
					next.set('env', String(selectedEnvId));
				}
				return next;
			}, { replace: true });
		}
	}, [selectedEnvId, setSearchParams]);

	const [backupType, setBackupType] = useState<
		'full' | 'db_only' | 'files_only'
	>('full');
	const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null);
	const [runningJobs, setRunningJobs] = useState<
		Record<string, { progress: number; step?: string }>
	>({});
	const [activeJobExecutionId, setActiveJobExecutionId] = useState<
		number | null
	>(null);
	const backupJobIdRef = useRef<string | null>(null);
	const backupEnvIdRef = useRef<number | null>(null);

	useEffect(() => {
		if (!selectedEnvId && environments.length > 0) {
			setSelectedEnvId(environments[0].id);
		}
	}, [environments, selectedEnvId]);

	useSubscribeEnvironment(selectedEnvId);

	const { data, isLoading } = useBackupsQuery(selectedEnvId);

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
			backupsApi.createBackup({
				environmentId: selectedEnvId!,
				type: backupType,
			}),
		onSuccess: res => {
			backupJobIdRef.current = res?.bullJobId ?? null;
			backupEnvIdRef.current = selectedEnvId;
			setActiveJobExecutionId(res?.jobExecutionId ?? null);
			toast({ title: 'Backup queued' });
			qc.invalidateQueries({ queryKey: ['backups', selectedEnvId] });
		},
		onError: () =>
			toast({ title: 'Failed to start backup', variant: 'destructive' }),
	});

	const restoreMutation = useMutation({
		mutationFn: (backupId: number) =>
			backupsApi.restoreBackup({ backupId }),
		onSuccess: res => {
			backupJobIdRef.current = res?.bullJobId ?? null;
			backupEnvIdRef.current = selectedEnvId;
			setActiveJobExecutionId(res?.jobExecutionId ?? null);
			toast({ title: 'Restore queued' });
			setRestoreTarget(null);
		},
		onError: () => toast({ title: 'Restore failed', variant: 'destructive' }),
	});

	const cancelBackupMutation = useCancelBackupMutation(selectedEnvId);
	const deleteMutation = useDeleteBackupMutation(selectedEnvId);

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

			<BackupsList
				data={data}
				isLoading={isLoading}
				selectedEnv={selectedEnv}
				onRestoreClick={setRestoreTarget}
				onDeleteClick={setDeleteTarget}
				cancelBackupMutation={cancelBackupMutation}
			/>

			{/* Backup Schedule */}
			<BackupScheduleSection selectedEnvId={selectedEnvId} />

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
export default BackupsTab;
