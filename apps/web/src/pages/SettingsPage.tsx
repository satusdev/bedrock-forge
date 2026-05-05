import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { CustomPluginsSettings } from './settings/CustomPluginsSettings';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
	Pencil,
	Trash2,
	Plus,
	Check,
	X,
	Key,
	Shield,
	ShieldCheck,
	Cloud,
	CloudOff,
	Loader2,
	HardDrive,
	Database,
	Puzzle,
	Settings,
	RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/store/auth.store';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

const editSchema = z.object({ value: z.string().min(1, 'Value is required') });
type EditForm = z.infer<typeof editSchema>;

const newSettingSchema = z.object({
	key: z
		.string()
		.min(1, 'Key is required')
		.regex(
			/^[a-z0-9_.-]+$/,
			'Only lowercase letters, digits, underscores, dots, dashes',
		),
	value: z.string().min(1, 'Value is required'),
});
type NewSettingForm = z.infer<typeof newSettingSchema>;

const changePasswordSchema = z
	.object({
		current_password: z.string().min(1, 'Current password is required'),
		new_password: z.string().min(8, 'At least 8 characters'),
		confirm_password: z.string(),
	})
	.refine(d => d.new_password === d.confirm_password, {
		message: 'Passwords do not match',
		path: ['confirm_password'],
	});
type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

interface GdriveStatus {
	configured: boolean;
}

interface SystemBackupItem {
	id: number;
	status: 'pending' | 'running' | 'completed' | 'failed';
	file_path: string | null;
	size_bytes: string | null;
	error_message: string | null;
	created_at: string;
	completed_at: string | null;
	jobExecution?: {
		status: string;
		progress: number;
		last_error: string | null;
	} | null;
}

interface SystemBackupList {
	items: SystemBackupItem[];
	total: number;
	page: number;
	limit: number;
}

interface SystemBackupSchedule {
	id: number;
	frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
	hour: number;
	minute: number;
	day_of_week: number | null;
	day_of_month: number | null;
	enabled: boolean;
	retention_count: number | null;
	retention_days: number | null;
	last_run_at: string | null;
}

const FREQ_LABELS: Record<string, string> = {
	hourly: 'Hourly',
	daily: 'Daily',
	weekly: 'Weekly',
	monthly: 'Monthly',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function SettingsPage() {
	const role = useAuthStore(s => s.user?.roles?.[0]);
	const qc = useQueryClient();
	const [editKey, setEditKey] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [sshKeyValue, setSshKeyValue] = useState('');
	const [deleteSshKeyOpen, setDeleteSshKeyOpen] = useState(false);

	// ── Google Drive state ───────────────────────────────────────────────────
	const [gdriveToken, setGdriveToken] = useState('');
	const [gdriveTestResult, setGdriveTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);
	const [deleteGdriveOpen, setDeleteGdriveOpen] = useState(false);

	// ── System Backup state ──────────────────────────────────────────────────
	const [systemBackupFolderId, setSystemBackupFolderId] = useState('');

	const { data: sshKeyStatus, refetch: refetchSshKey } = useQuery({
		queryKey: ['ssh-key-status'],
		queryFn: () => api.get<{ has_key: boolean }>('/settings/ssh-key'),
	});

	const setSshKey = useMutation({
		mutationFn: (key: string) => api.put('/settings/ssh-key', { key }),
		onSuccess: () => {
			refetchSshKey();
			setSshKeyValue('');
			toast({ title: 'Global SSH key saved' });
		},
		onError: () =>
			toast({ title: 'Failed to save SSH key', variant: 'destructive' }),
	});

	const deleteSshKey = useMutation({
		mutationFn: () => api.delete('/settings/ssh-key'),
		onSuccess: () => {
			refetchSshKey();
			setDeleteSshKeyOpen(false);
			toast({ title: 'Global SSH key removed' });
		},
		onError: () =>
			toast({ title: 'Failed to remove SSH key', variant: 'destructive' }),
	});

	// ── Google Drive mutations ───────────────────────────────────────────────
	const { data: gdriveStatus, refetch: refetchGdrive } = useQuery({
		queryKey: ['gdrive-status'],
		queryFn: () => api.get<GdriveStatus>('/settings/gdrive'),
	});

	const saveGdrive = useMutation({
		mutationFn: (token: string) => api.put('/settings/gdrive', { token }),
		onSuccess: () => {
			refetchGdrive();
			setGdriveToken('');
			setGdriveTestResult(null);
			toast({ title: 'Google Drive token saved' });
		},
		onError: (err: any) =>
			toast({
				title: 'Failed to save token',
				description:
					err?.message ??
					'Paste the JSON token printed by rclone authorize "drive".',
				variant: 'destructive',
			}),
	});

	const testGdrive = useMutation({
		mutationFn: () =>
			api.post<{ success: boolean; message: string }>(
				'/settings/gdrive/test',
				{},
			),
		onSuccess: result => {
			setGdriveTestResult(result);
		},
		onError: (err: any) => {
			setGdriveTestResult({
				success: false,
				message: err?.message ?? 'Connection test failed.',
			});
		},
	});

	const deleteGdrive = useMutation({
		mutationFn: () => api.delete('/settings/gdrive'),
		onSuccess: () => {
			refetchGdrive();
			setDeleteGdriveOpen(false);
			setGdriveTestResult(null);
			toast({ title: 'Google Drive credentials removed' });
		},
		onError: () =>
			toast({ title: 'Failed to remove credentials', variant: 'destructive' }),
	});

	async function handleSaveAndTest() {
		if (!gdriveToken.trim()) return;
		await saveGdrive.mutateAsync(gdriveToken.trim());
		testGdrive.mutate();
	}

	const { data, isLoading } = useQuery({
		queryKey: ['settings'],
		queryFn: () => api.get<Record<string, string>>('/settings'),
	});

	// ── System Backup queries ────────────────────────────────────────────────
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

	// ── System Backup schedule ────────────────────────────────────────────────
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

	const updateMutation = useMutation({
		mutationFn: ({ key, value }: { key: string; value: string }) =>
			api.put(`/settings/${key}`, { value }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['settings'] });
			setEditKey(null);
			toast({ title: 'Setting updated' });
		},
		onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
	});

	const deleteMutation = useMutation({
		mutationFn: (key: string) => api.delete(`/settings/${key}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['settings'] });
			setDeleteTarget(null);
			toast({ title: 'Setting deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	const {
		register: regEdit,
		handleSubmit: handleEdit,
		reset: resetEdit,
		formState: { errors: editErrors },
	} = useForm<EditForm>({ resolver: zodResolver(editSchema) });

	const {
		register: regNew,
		handleSubmit: handleNew,
		reset: resetNew,
		formState: { errors: newErrors, isSubmitting: isCreating },
	} = useForm<NewSettingForm>({ resolver: zodResolver(newSettingSchema) });

	async function onNew(data: NewSettingForm) {
		try {
			await api.put(`/settings/${data.key}`, { value: data.value });
			qc.invalidateQueries({ queryKey: ['settings'] });
			resetNew();
			toast({ title: 'Setting created' });
		} catch {
			toast({ title: 'Create failed', variant: 'destructive' });
		}
	}

	// ── Change Password ──────────────────────────────────────────────────────
	const {
		register: regPwd,
		handleSubmit: handlePwd,
		reset: resetPwd,
		formState: { errors: pwdErrors },
	} = useForm<ChangePasswordForm>({
		resolver: zodResolver(changePasswordSchema),
	});

	const changePasswordMutation = useMutation({
		mutationFn: (d: { current_password: string; new_password: string }) =>
			api.put('/auth/change-password', d),
		onSuccess: () => {
			resetPwd();
			toast({ title: 'Password changed successfully' });
		},
		onError: (e: any) =>
			toast({
				title: 'Failed to change password',
				description: e?.message,
				variant: 'destructive',
			}),
	});

	function onChangePassword(data: ChangePasswordForm) {
		changePasswordMutation.mutate({
			current_password: data.current_password,
			new_password: data.new_password,
		});
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

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
					<Badge className='bg-green-100 text-green-700 border-green-200 hover:bg-green-100'>
						Completed
					</Badge>
				);
			case 'failed':
				return <Badge variant='destructive'>Failed</Badge>;
			case 'running':
				return (
					<Badge className='bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100'>
						<Loader2 className='h-3 w-3 mr-1 animate-spin' />
						Running
					</Badge>
				);
			default:
				return <Badge variant='outline'>Pending</Badge>;
		}
	}

	const changePasswordCard = (
		<div className='border rounded-lg p-4 bg-card space-y-4'>
			<h2 className='font-semibold flex items-center gap-2'>
				<Key className='h-4 w-4' />
				Change Password
			</h2>
			<form onSubmit={handlePwd(onChangePassword)} className='space-y-3'>
				<div className='space-y-1.5'>
					<Label htmlFor='cp-current'>Current Password</Label>
					<Input
						id='cp-current'
						type='password'
						{...regPwd('current_password')}
						autoComplete='current-password'
					/>
					{pwdErrors.current_password && (
						<p className='text-xs text-destructive'>
							{pwdErrors.current_password.message}
						</p>
					)}
				</div>
				<div className='space-y-1.5'>
					<Label htmlFor='cp-new'>New Password</Label>
					<Input
						id='cp-new'
						type='password'
						{...regPwd('new_password')}
						autoComplete='new-password'
					/>
					{pwdErrors.new_password && (
						<p className='text-xs text-destructive'>
							{pwdErrors.new_password.message}
						</p>
					)}
				</div>
				<div className='space-y-1.5'>
					<Label htmlFor='cp-confirm'>Confirm New Password</Label>
					<Input
						id='cp-confirm'
						type='password'
						{...regPwd('confirm_password')}
						autoComplete='new-password'
					/>
					{pwdErrors.confirm_password && (
						<p className='text-xs text-destructive'>
							{pwdErrors.confirm_password.message}
						</p>
					)}
				</div>
				<Button type='submit' disabled={changePasswordMutation.isPending}>
					{changePasswordMutation.isPending
						? 'Saving\u2026'
						: 'Change Password'}
				</Button>
			</form>
		</div>
	);

	if (role !== 'admin') {
		return (
			<div className='space-y-6 max-w-2xl'>
				<h1 className='text-2xl font-bold'>Settings</h1>
				{changePasswordCard}
			</div>
		);
	}

	const entries = data ? Object.entries(data) : [];

	return (
		<div className='space-y-6 max-w-3xl'>
			<h1 className='text-2xl font-bold'>Settings</h1>

			<Tabs defaultValue='account'>
				<TabsList className='grid w-full grid-cols-6'>
					<TabsTrigger value='account' className='flex items-center gap-1.5'>
						<Key className='h-3.5 w-3.5' />
						<span className='hidden sm:inline'>Account</span>
					</TabsTrigger>
					<TabsTrigger
						value='integrations'
						className='flex items-center gap-1.5'
					>
						<Cloud className='h-3.5 w-3.5' />
						<span className='hidden sm:inline'>Integrations</span>
					</TabsTrigger>
					<TabsTrigger value='automation' className='flex items-center gap-1.5'>
						<Shield className='h-3.5 w-3.5' />
						<span className='hidden sm:inline'>Automation</span>
					</TabsTrigger>
					<TabsTrigger value='plugins' className='flex items-center gap-1.5'>
						<Puzzle className='h-3.5 w-3.5' />
						<span className='hidden sm:inline'>Plugins</span>
					</TabsTrigger>
					<TabsTrigger
						value='system-backup'
						className='flex items-center gap-1.5'
					>
						<Database className='h-3.5 w-3.5' />
						<span className='hidden sm:inline'>Backup</span>
					</TabsTrigger>
					<TabsTrigger value='advanced' className='flex items-center gap-1.5'>
						<Settings className='h-3.5 w-3.5' />
						<span className='hidden sm:inline'>Advanced</span>
					</TabsTrigger>
				</TabsList>

				{/* Account tab */}
				<TabsContent value='account' className='space-y-4 mt-4'>
					{changePasswordCard}

					<div className='border rounded-lg p-4 bg-card space-y-4'>
						<div className='flex items-center justify-between'>
							<h2 className='font-semibold flex items-center gap-2'>
								<Key className='h-4 w-4' />
								Global SSH Key
							</h2>
							{sshKeyStatus?.has_key && (
								<span className='flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400'>
									<ShieldCheck className='h-4 w-4' />
									Key configured
								</span>
							)}
						</div>
						<p className='text-sm text-muted-foreground'>
							Used as a fallback when no per-server SSH key is set. The key is
							stored encrypted and never returned in API responses.
						</p>
						<div className='space-y-2'>
							<Label htmlFor='global-ssh-key'>
								{sshKeyStatus?.has_key
									? 'Replace key (paste new key to overwrite):'
									: 'Paste private key:'}
							</Label>
							<Textarea
								id='global-ssh-key'
								rows={6}
								className='font-mono resize-y'
								placeholder='-----BEGIN OPENSSH PRIVATE KEY-----'
								value={sshKeyValue}
								onChange={e => setSshKeyValue(e.target.value)}
							/>
						</div>
						<div className='flex gap-2'>
							<Button
								onClick={() => setSshKey.mutate(sshKeyValue)}
								disabled={setSshKey.isPending || sshKeyValue.trim().length < 20}
							>
								{setSshKey.isPending ? 'Saving\u2026' : 'Save Key'}
							</Button>
							{sshKeyStatus?.has_key && (
								<Button
									variant='outline'
									className='text-destructive hover:text-destructive'
									onClick={() => setDeleteSshKeyOpen(true)}
								>
									Remove Key
								</Button>
							)}
						</div>
					</div>
				</TabsContent>

				{/* Integrations tab */}
				<TabsContent value='integrations' className='space-y-4 mt-4'>
					<div className='border rounded-lg p-4 bg-card space-y-4'>
						<div className='flex items-center justify-between'>
							<h2 className='font-semibold flex items-center gap-2'>
								<Cloud className='h-4 w-4' />
								Google Drive Backups
							</h2>
							{gdriveStatus?.configured ? (
								<span className='flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400'>
									<ShieldCheck className='h-4 w-4' />
									Connected
								</span>
							) : (
								<span className='flex items-center gap-1.5 text-sm text-muted-foreground'>
									<CloudOff className='h-4 w-4' />
									Not configured
								</span>
							)}
						</div>

						<p className='text-sm text-muted-foreground'>
							Backups are uploaded to Google Drive using rclone OAuth. Run one
							command to authorize, then paste the token below.
						</p>

						<details className='group border rounded-md'>
							<summary className='cursor-pointer select-none px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2 list-none'>
								<span className='inline-block transition-transform group-open:rotate-90'>
									&#9658;
								</span>
								Setup instructions
							</summary>
							<ol className='px-4 pb-3 pt-1 space-y-3 text-sm text-muted-foreground list-decimal list-inside marker:font-semibold'>
								<li>
									Install{' '}
									<a
										href='https://rclone.org/install/'
										target='_blank'
										rel='noreferrer'
										className='underline hover:text-foreground'
									>
										rclone
									</a>{' '}
									locally, <strong>or</strong> run the authorize command inside
									the Docker container (no local install needed):
									<pre className='mt-1.5 text-xs bg-muted rounded px-2 py-1.5 font-mono overflow-x-auto'>
										docker exec -it bedrock-forge-forge-1 rclone authorize
										&quot;drive&quot;
									</pre>
								</li>
								<li>
									A browser window will open \u2014 sign in with your Google
									account and click <strong>Allow</strong>.
								</li>
								<li>
									rclone will print a token JSON in the terminal. Copy{' '}
									<strong>only the JSON part</strong> (starts with{' '}
									<code className='text-xs bg-muted px-1 py-0.5 rounded'>
										&#123;&quot;access_token&quot;:
									</code>
									) and paste it into the field below.
								</li>
							</ol>
						</details>

						{gdriveStatus?.configured && (
							<div className='flex gap-2'>
								<Button
									variant='outline'
									size='sm'
									onClick={() => {
										setGdriveTestResult(null);
										testGdrive.mutate();
									}}
									disabled={testGdrive.isPending}
								>
									{testGdrive.isPending ? (
										<>
											<Loader2 className='h-3.5 w-3.5 mr-1.5 animate-spin' />
											Testing\u2026
										</>
									) : (
										'Test Connection'
									)}
								</Button>
								<Button
									variant='outline'
									size='sm'
									className='text-destructive hover:text-destructive'
									onClick={() => setDeleteGdriveOpen(true)}
								>
									Remove Credentials
								</Button>
							</div>
						)}

						{gdriveTestResult && (
							<div
								className={`text-sm px-3 py-2 rounded-md ${
									gdriveTestResult.success
										? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
										: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
								}`}
							>
								{gdriveTestResult.success ? '\u2713 ' : '\u2717 '}
								{gdriveTestResult.message}
							</div>
						)}

						<div className='space-y-2'>
							<Label htmlFor='gdrive-token'>
								{gdriveStatus?.configured
									? 'Replace rclone token (paste new token to overwrite):'
									: 'Paste rclone token:'}
							</Label>
							<Textarea
								id='gdrive-token'
								rows={4}
								className='font-mono text-xs resize-y'
								placeholder='{"access_token":"ya29.xxx","token_type":"Bearer","refresh_token":"1//xxx","expiry":"2026-01-01T00:00:00.000Z"}'
								value={gdriveToken}
								onChange={e => {
									setGdriveToken(e.target.value);
									setGdriveTestResult(null);
								}}
							/>
						</div>

						<div className='flex gap-2'>
							<Button
								onClick={handleSaveAndTest}
								disabled={
									saveGdrive.isPending ||
									testGdrive.isPending ||
									gdriveToken.trim().length < 20
								}
							>
								{saveGdrive.isPending ? (
									<>
										<Loader2 className='h-3.5 w-3.5 mr-1.5 animate-spin' />
										Saving\u2026
									</>
								) : (
									'Save & Test'
								)}
							</Button>
						</div>
					</div>
				</TabsContent>

				{/* Automation tab */}
				<TabsContent value='automation' className='space-y-4 mt-4'>
					<div className='border rounded-lg p-4 bg-card space-y-4'>
						<h2 className='font-semibold flex items-center gap-2'>
							<Shield className='h-4 w-4' />
							Safety &amp; Automation
						</h2>
						<div className='flex items-center justify-between gap-4'>
							<div className='space-y-1'>
								<Label
									htmlFor='safety-backup-toggle'
									className='text-sm font-medium'
								>
									Backup before sync
								</Label>
								<p className='text-xs text-muted-foreground'>
									Automatically create a full backup of the target environment
									before every sync operation.
								</p>
							</div>
							<Switch
								id='safety-backup-toggle'
								checked={data?.safety_backup_before_sync === 'true'}
								onCheckedChange={checked =>
									updateMutation.mutate({
										key: 'safety_backup_before_sync',
										value: String(checked),
									})
								}
								disabled={isLoading || updateMutation.isPending}
							/>
						</div>
					</div>
				</TabsContent>

				{/* Plugins tab */}
				<TabsContent value='plugins' className='space-y-4 mt-4'>
					<div className='border rounded-lg p-4 bg-card'>
						<CustomPluginsSettings />
					</div>
				</TabsContent>

				{/* System Backup tab */}
				<TabsContent value='system-backup' className='space-y-4 mt-4'>
					<div className='border rounded-lg p-4 bg-card space-y-4'>
						<h2 className='font-semibold flex items-center gap-2'>
							<Database className='h-4 w-4' />
							Forge System Backup
						</h2>
						<p className='text-sm text-muted-foreground'>
							Dumps the Forge PostgreSQL database using{' '}
							<code className='text-xs bg-muted px-1 py-0.5 rounded'>
								pg_dump
							</code>{' '}
							and uploads the compressed file to a Google Drive folder you
							specify. Google Drive must be configured in the Integrations tab
							first.
						</p>

						{!gdriveStatus?.configured && (
							<div className='text-sm px-3 py-2 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'>
								\u26a0 Google Drive is not configured. Go to the Integrations
								tab to set it up before running system backups.
							</div>
						)}

						<div className='space-y-2'>
							<Label htmlFor='backup-folder-id'>Google Drive Folder ID</Label>
							<p className='text-xs text-muted-foreground'>
								Open the destination folder in Google Drive. The folder ID is
								the last part of the URL:{' '}
								<code className='bg-muted px-1 py-0.5 rounded'>
									drive.google.com/drive/folders/
									<strong>FOLDER_ID</strong>
								</code>
							</p>
							<div className='flex gap-2'>
								<Input
									id='backup-folder-id'
									placeholder='1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2ucxE'
									value={systemBackupFolderId}
									onChange={e => setSystemBackupFolderId(e.target.value)}
									className='font-mono text-sm'
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

					{/* ── Schedule card ─────────────────────────────────── */}
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
										onChange={e =>
											setScheduleDayOfMonth(Number(e.target.value))
										}
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
								Last run:{' '}
								{new Date(existingSchedule.last_run_at).toLocaleString()}
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
								onClick={() =>
									qc.invalidateQueries({ queryKey: ['system-backups'] })
								}
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
								No backups yet. Click &quot;Backup Now&quot; to create your
								first system backup.
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
								<div className='text-xs text-muted-foreground shrink-0 text-right'>
									{formatBytes(b.size_bytes)}
								</div>
							</div>
						))}
					</div>
				</TabsContent>

				{/* Advanced tab */}
				<TabsContent value='advanced' className='space-y-4 mt-4'>
					<div className='border rounded-lg p-4 bg-card space-y-4'>
						<h2 className='font-semibold flex items-center gap-2'>
							<Plus className='h-4 w-4' />
							New Setting
						</h2>
						<form
							onSubmit={handleNew(onNew)}
							className='grid grid-cols-2 gap-3'
						>
							<div className='space-y-1'>
								<Label htmlFor='new-key'>Key</Label>
								<Input
									id='new-key'
									{...regNew('key')}
									placeholder='my_setting_key'
									className='font-mono'
								/>
								{newErrors.key && (
									<p className='text-xs text-destructive'>
										{newErrors.key.message}
									</p>
								)}
							</div>
							<div className='space-y-1'>
								<Label htmlFor='new-val'>Value</Label>
								<Input
									id='new-val'
									{...regNew('value')}
									placeholder='setting value'
								/>
								{newErrors.value && (
									<p className='text-xs text-destructive'>
										{newErrors.value.message}
									</p>
								)}
							</div>
							<div className='col-span-2'>
								<Button type='submit' size='sm' disabled={isCreating}>
									{isCreating ? 'Saving\u2026' : 'Add Setting'}
								</Button>
							</div>
						</form>
					</div>

					{isLoading && <p className='text-muted-foreground'>Loading\u2026</p>}

					<div className='divide-y border rounded-lg'>
						{entries.map(([key, value]) => (
							<div
								key={key}
								className='flex items-center justify-between px-4 py-3 gap-4'
							>
								<span className='font-mono text-sm text-muted-foreground min-w-[180px] shrink-0'>
									{key}
								</span>
								{editKey === key ? (
									<form
										onSubmit={handleEdit(fd =>
											updateMutation.mutate({ key, value: fd.value }),
										)}
										className='flex items-center gap-2 flex-1'
									>
										<Input
											{...regEdit('value')}
											defaultValue={value}
											className='flex-1 h-8 text-sm'
											autoFocus
										/>
										{editErrors.value && (
											<span className='text-destructive text-xs'>
												{editErrors.value.message}
											</span>
										)}
										<Button
											type='submit'
											size='icon'
											className='h-7 w-7'
											disabled={updateMutation.isPending}
										>
											<Check className='h-3.5 w-3.5' />
										</Button>
										<Button
											type='button'
											variant='ghost'
											size='icon'
											className='h-7 w-7'
											onClick={() => setEditKey(null)}
										>
											<X className='h-3.5 w-3.5' />
										</Button>
									</form>
								) : (
									<>
										<span className='text-sm flex-1 truncate'>{value}</span>
										<div className='flex items-center gap-1 shrink-0'>
											<Button
												variant='ghost'
												size='icon'
												className='h-7 w-7'
												onClick={() => {
													resetEdit({ value });
													setEditKey(key);
												}}
											>
												<Pencil className='h-3.5 w-3.5' />
											</Button>
											<Button
												variant='ghost'
												size='icon'
												className='h-7 w-7 text-destructive hover:text-destructive'
												onClick={() => setDeleteTarget(key)}
											>
												<Trash2 className='h-3.5 w-3.5' />
											</Button>
										</div>
									</>
								)}
							</div>
						))}
						{entries.length === 0 && !isLoading && (
							<p className='px-4 py-3 text-sm text-muted-foreground'>
								No settings configured.
							</p>
						)}
					</div>
				</TabsContent>
			</Tabs>

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title='Delete Setting'
				description={`Setting key "${deleteTarget}" will be permanently deleted.`}
				confirmLabel='Delete'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
				isPending={deleteMutation.isPending}
			/>

			<AlertDialog
				open={deleteSshKeyOpen}
				onOpenChange={setDeleteSshKeyOpen}
				title='Remove Global SSH Key'
				description='The global SSH key will be permanently removed. Servers without a per-server key will no longer be connectable.'
				confirmLabel='Remove'
				confirmVariant='destructive'
				onConfirm={() => deleteSshKey.mutate()}
				isPending={deleteSshKey.isPending}
			/>

			<AlertDialog
				open={deleteGdriveOpen}
				onOpenChange={setDeleteGdriveOpen}
				title='Remove Google Drive Credentials'
				description='Google Drive credentials will be permanently removed. Future backups will be stored locally only and existing GDrive backups will not be deleted.'
				confirmLabel='Remove'
				confirmVariant='destructive'
				onConfirm={() => deleteGdrive.mutate()}
				isPending={deleteGdrive.isPending}
			/>
		</div>
	);
}
