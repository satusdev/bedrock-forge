import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	Database,
	HardDrive,
	Loader2,
	RefreshCw,
	Download,
	ExternalLink,
	Settings,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
	GdriveStatus,
	SystemBackupList,
	SystemBackupItem,
	SystemBackupSchedule,
} from './types';

const FREQ_LABELS: Record<string, string> = {
	hourly: 'Hourly',
	daily: 'Daily',
	weekly: 'Weekly',
	monthly: 'Monthly',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function BackupTab() {
	const qc = useQueryClient();
	const [systemBackupFolderId, setSystemBackupFolderId] = useState('');

	// ── Schedule state ────────────────────────────────────────────────────────
	const [scheduleFreq, setScheduleFreq] = useState<
		'hourly' | 'daily' | 'weekly' | 'monthly'
	>('daily');
	const [scheduleHour, setScheduleHour] = useState(3);
	const [scheduleMinute, setScheduleMinute] = useState(0);
	const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(0);
	const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1);
	const [scheduleEnabled, setScheduleEnabled] = useState(true);
	const [scheduleRetentionCount, setScheduleRetentionCount] = useState('');
	const [scheduleRetentionDays, setScheduleRetentionDays] = useState('');

	const { data: gdriveStatus } = useQuery({
		queryKey: ['gdrive-status'],
		queryFn: () => api.get<GdriveStatus>('/settings/gdrive'),
	});

	const { data: systemBackupFolder, refetch: refetchFolder } = useQuery({
		queryKey: ['system-backup-folder'],
		queryFn: () =>
			api.get<{ folder_id: string | null }>('/settings/system-backup-folder'),
	});

	useEffect(() => {
		if (systemBackupFolder?.folder_id) {
			setSystemBackupFolderId(systemBackupFolder.folder_id);
		}
	}, [systemBackupFolder?.folder_id]);

	const saveBackupFolder = useMutation({
		mutationFn: (value: string) =>
			api.put('/settings/system-backup-folder', { value }),
		onSuccess: () => {
			refetchFolder();
			toast({ title: 'Backup folder ID saved' });
		},
		onError: () =>
			toast({ title: 'Failed to save folder ID', variant: 'destructive' }),
	});

	const { data: systemBackups, isLoading: backupsLoading } = useQuery({
		queryKey: ['system-backups'],
		queryFn: () => api.get<SystemBackupList>('/system-backups'),
		refetchInterval: query => {
			const d = query.state.data;
			if (!d) return 10_000;
			const hasActive = d.items.some(
				b => b.status === 'pending' || b.status === 'running',
			);
			return hasActive ? 5_000 : 30_000;
		},
	});

	const triggerBackup = useMutation({
		mutationFn: () =>
			api.post<{ systemBackupId: number }>('/system-backups', {}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['system-backups'] });
			toast({ title: 'System backup started' });
		},
		onError: (err: any) =>
			toast({
				title: 'Failed to start backup',
				description: err?.message,
				variant: 'destructive',
			}),
	});

	const { data: existingSchedule, refetch: refetchSchedule } = useQuery({
		queryKey: ['system-backup-schedule'],
		queryFn: () =>
			api.get<SystemBackupSchedule | null>('/system-backups/schedule'),
	});

	useEffect(() => {
		if (!existingSchedule) return;
		setScheduleFreq(existingSchedule.frequency);
		setScheduleHour(existingSchedule.hour);
		setScheduleMinute(existingSchedule.minute);
		setScheduleDayOfWeek(existingSchedule.day_of_week ?? 0);
		setScheduleDayOfMonth(existingSchedule.day_of_month ?? 1);
		setScheduleEnabled(existingSchedule.enabled);
		setScheduleRetentionCount(
			existingSchedule.retention_count != null
				? String(existingSchedule.retention_count)
				: '',
		);
		setScheduleRetentionDays(
			existingSchedule.retention_days != null
				? String(existingSchedule.retention_days)
				: '',
		);
	}, [existingSchedule]);

	const saveSchedule = useMutation({
		mutationFn: () =>
			api.put<SystemBackupSchedule>('/system-backups/schedule', {
				frequency: scheduleFreq,
				hour: scheduleHour,
				minute: scheduleMinute,
				...(scheduleFreq === 'weekly'
					? { day_of_week: scheduleDayOfWeek }
					: {}),
				...(scheduleFreq === 'monthly'
					? { day_of_month: scheduleDayOfMonth }
					: {}),
				enabled: scheduleEnabled,
				retention_count: scheduleRetentionCount
					? Number(scheduleRetentionCount)
					: null,
				retention_days: scheduleRetentionDays
					? Number(scheduleRetentionDays)
					: null,
			}),
		onSuccess: () => {
			refetchSchedule();
			toast({ title: 'Backup schedule saved' });
		},
		onError: (err: any) =>
			toast({
				title: 'Failed to save schedule',
				description: err?.message,
				variant: 'destructive',
			}),
	});

	const deleteSchedule = useMutation({
		mutationFn: () => api.delete('/system-backups/schedule'),
		onSuccess: () => {
			refetchSchedule();
			toast({ title: 'Backup schedule removed' });
		},
		onError: () =>
			toast({ title: 'Failed to remove schedule', variant: 'destructive' }),
	});

	function formatBytes(bytes: string | null): string {
		if (!bytes) return '\u2014';
		const n = Number(bytes);
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
		return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	}

	function statusBadge(status: SystemBackupItem['status']) {
		switch (status) {
			case 'completed':
				return (
					<Badge variant='success'>
						Completed
					</Badge>
				);
			case 'failed':
				return <Badge variant='destructive'>Failed</Badge>;
			case 'running':
				return (
					<Badge variant='info'>
						<Loader2 className='h-3 w-3 mr-1 animate-spin' />
						Running
					</Badge>
				);
			default:
				return <Badge variant='outline'>Pending</Badge>;
		}
	}

	return (
		<div className='space-y-4'>
			<div className='border rounded-lg p-4 bg-card space-y-4'>
				<h2 className='font-semibold flex items-center gap-2'>
					<Database className='h-4 w-4' />
					Forge System Backup
				</h2>
				<p className='text-sm text-muted-foreground'>
					Dumps the Forge PostgreSQL database using{' '}
					<code className='text-xs bg-muted px-1 py-0.5 rounded'>pg_dump</code>{' '}
					and uploads the compressed file to a Google Drive folder you specify.
					Google Drive must be configured in the Integrations tab first.
				</p>

				{!gdriveStatus?.configured && (
					<div className='text-sm px-3 py-2 rounded-md bg-warning/10 text-warning'>
						\u26a0 Google Drive is not configured. Go to the Integrations tab to
						set it up before running system backups.
					</div>
				)}

				<div className='space-y-2'>
					<Label htmlFor='backup-folder-id'>Google Drive Folder ID</Label>
					<p className='text-xs text-muted-foreground'>
						Open the destination folder in Google Drive. The folder ID is the
						last part of the URL:{' '}
						<code className='bg-muted px-1 py-0.5 rounded'>
							drive.google.com/drive/folders/
							<strong>FOLDER_ID</strong>
						</code>
					</p>
					<div className='flex gap-2'>
						<input
							id='backup-folder-id'
							placeholder='1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2ucxE'
							value={systemBackupFolderId}
							onChange={e => setSystemBackupFolderId(e.target.value)}
							className='flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono'
						/>
						<Button
							onClick={() =>
								saveBackupFolder.mutate(systemBackupFolderId.trim())
							}
							disabled={
								saveBackupFolder.isPending || !systemBackupFolderId.trim()
							}
						>
							{saveBackupFolder.isPending ? 'Saving\u2026' : 'Save'}
						</Button>
					</div>
					{systemBackupFolder?.folder_id && (
						<p className='text-xs text-muted-foreground'>
							Current:{' '}
							<code className='bg-muted px-1 py-0.5 rounded'>
								{systemBackupFolder.folder_id}
							</code>
						</p>
					)}
				</div>

				<div className='flex items-center justify-between pt-2 border-t'>
					<div>
						<p className='text-sm font-medium'>Manual Backup</p>
						<p className='text-xs text-muted-foreground'>
							Trigger an immediate pg_dump \u2192 Google Drive upload.
						</p>
					</div>
					<Button
						onClick={() => triggerBackup.mutate()}
						disabled={
							triggerBackup.isPending ||
							!gdriveStatus?.configured ||
							!systemBackupFolder?.folder_id
						}
					>
						{triggerBackup.isPending ? (
							<>
								<Loader2 className='h-3.5 w-3.5 mr-1.5 animate-spin' />
								Starting\u2026
							</>
						) : (
							<>
								<HardDrive className='h-3.5 w-3.5 mr-1.5' />
								Backup Now
							</>
						)}
					</Button>
				</div>
			</div>

			<div className='border rounded-lg p-4 bg-card space-y-4'>
				<div className='flex items-center justify-between'>
					<h3 className='font-semibold text-sm flex items-center gap-2'>
						<Settings className='h-4 w-4' />
						Backup Schedule
					</h3>
					<Switch
						checked={scheduleEnabled}
						onCheckedChange={setScheduleEnabled}
						aria-label='Enable backup schedule'
					/>
				</div>

				<div className='grid grid-cols-2 gap-3'>
					<div className='space-y-1'>
						<Label>Frequency</Label>
						<select
							className='w-full border rounded-md px-3 py-1.5 text-sm bg-background'
							value={scheduleFreq}
							onChange={e =>
								setScheduleFreq(e.target.value as typeof scheduleFreq)
							}
						>
							{Object.entries(FREQ_LABELS).map(([v, l]) => (
								<option key={v} value={v}>
									{l}
								</option>
							))}
						</select>
					</div>

					{scheduleFreq !== 'hourly' && (
						<div className='space-y-1'>
							<Label>Time (UTC)</Label>
							<div className='flex gap-1 items-center'>
								<Input
									type='number'
									min={0}
									max={23}
									value={scheduleHour}
									onChange={e => setScheduleHour(Number(e.target.value))}
									className='w-16 text-center'
									placeholder='HH'
								/>
								<span className='text-muted-foreground'>:</span>
								<Input
									type='number'
									min={0}
									max={59}
									value={scheduleMinute}
									onChange={e => setScheduleMinute(Number(e.target.value))}
									className='w-16 text-center'
									placeholder='MM'
								/>
							</div>
						</div>
					)}

					{scheduleFreq === 'hourly' && (
						<div className='space-y-1'>
							<Label>Minute</Label>
							<Input
								type='number'
								min={0}
								max={59}
								value={scheduleMinute}
								onChange={e => setScheduleMinute(Number(e.target.value))}
								className='w-20'
							/>
						</div>
					)}

					{scheduleFreq === 'weekly' && (
						<div className='space-y-1 col-span-2'>
							<Label>Day of week</Label>
							<div className='flex gap-1 flex-wrap'>
								{DAY_LABELS.map((d, i) => (
									<button
										key={i}
										type='button'
										onClick={() => setScheduleDayOfWeek(i)}
										className={`px-2.5 py-1 rounded text-xs border transition-colors ${
											scheduleDayOfWeek === i
												? 'bg-primary text-primary-foreground border-primary'
												: 'bg-background border-border hover:bg-muted'
										}`}
									>
										{d}
									</button>
								))}
							</div>
						</div>
					)}

					{scheduleFreq === 'monthly' && (
						<div className='space-y-1'>
							<Label>Day of month</Label>
							<Input
								type='number'
								min={1}
								max={28}
								value={scheduleDayOfMonth}
								onChange={e => setScheduleDayOfMonth(Number(e.target.value))}
								className='w-20'
							/>
						</div>
					)}
				</div>

				<div className='grid grid-cols-2 gap-3 pt-2 border-t'>
					<div className='space-y-1'>
						<Label>Keep last N backups</Label>
						<Input
							type='number'
							min={1}
							max={100}
							value={scheduleRetentionCount}
							onChange={e => setScheduleRetentionCount(e.target.value)}
							placeholder='unlimited'
							className='w-28'
						/>
					</div>
					<div className='space-y-1'>
						<Label>Delete after N days</Label>
						<Input
							type='number'
							min={1}
							max={365}
							value={scheduleRetentionDays}
							onChange={e => setScheduleRetentionDays(e.target.value)}
							placeholder='never'
							className='w-28'
						/>
					</div>
				</div>

				{existingSchedule?.last_run_at && (
					<p className='text-xs text-muted-foreground'>
						Last run: {new Date(existingSchedule.last_run_at).toLocaleString()}
					</p>
				)}

				<div className='flex items-center gap-2 pt-1'>
					<Button
						size='sm'
						onClick={() => saveSchedule.mutate()}
						disabled={saveSchedule.isPending}
					>
						{saveSchedule.isPending ? 'Saving…' : 'Save Schedule'}
					</Button>
					{existingSchedule && (
						<Button
							size='sm'
							variant='ghost'
							className='text-destructive hover:text-destructive'
							onClick={() => deleteSchedule.mutate()}
							disabled={deleteSchedule.isPending}
						>
							Remove
						</Button>
					)}
				</div>
			</div>

			<div className='border rounded-lg bg-card'>
				<div className='flex items-center justify-between px-4 py-3 border-b'>
					<h3 className='font-medium text-sm'>Backup History</h3>
					<Button
						variant='ghost'
						size='sm'
						className='h-7'
						onClick={() => qc.invalidateQueries({ queryKey: ['system-backups'] })}
					>
						<RefreshCw className='h-3.5 w-3.5' />
					</Button>
				</div>

				{backupsLoading && (
					<p className='px-4 py-3 text-sm text-muted-foreground'>
						Loading\u2026
					</p>
				)}

				{!backupsLoading && !systemBackups?.items?.length && (
					<p className='px-4 py-3 text-sm text-muted-foreground'>
						No backups yet. Click &quot;Backup Now&quot; to create your first
						system backup.
					</p>
				)}

				{(systemBackups?.items ?? []).map(b => (
					<div
						key={b.id}
						className='flex items-start justify-between px-4 py-3 gap-4 border-b last:border-0'
					>
						<div className='space-y-0.5 min-w-0'>
							<div className='flex items-center gap-2'>
								{statusBadge(b.status)}
								<span className='text-xs text-muted-foreground'>
									{new Date(b.created_at).toLocaleString()}
								</span>
							</div>
							{b.file_path && (
								<p className='text-xs text-muted-foreground font-mono truncate max-w-xs'>
									{b.file_path.split('/').pop()}
								</p>
							)}
							{b.error_message && (
								<p className='text-xs text-destructive truncate max-w-sm'>
									{b.error_message}
								</p>
							)}
						</div>
						<div className='flex items-center gap-2 shrink-0'>
							{b.status === 'completed' && (
								<>
									<Button
										variant='ghost'
										size='icon'
										className='h-7 w-7'
										title='Download backup (stream from Drive)'
										onClick={() =>
											window.open(`/api/system-backups/${b.id}/download`, '_blank')
										}
									>
										<Download className='h-3.5 w-3.5' />
									</Button>
									{systemBackupFolder?.folder_id && (
										<Button
											variant='ghost'
											size='icon'
											className='h-7 w-7 text-muted-foreground hover:text-primary'
											title='Open Google Drive folder'
											onClick={() =>
												window.open(
													`https://drive.google.com/drive/folders/${systemBackupFolder.folder_id}`,
													'_blank',
													'noopener',
												)
											}
										>
											<ExternalLink className='h-3.5 w-3.5' />
										</Button>
									)}
								</>
							)}
							<div className='text-xs text-muted-foreground tabular-nums text-right'>
								{formatBytes(b.size_bytes)}
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
