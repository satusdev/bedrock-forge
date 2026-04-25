import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
					{changePasswordMutation.isPending ? 'Saving…' : 'Change Password'}
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
		<div className='space-y-6 max-w-2xl'>
			<h1 className='text-2xl font-bold'>Settings</h1>

			{changePasswordCard}

			{/* Global SSH Key */}
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
						{setSshKey.isPending ? 'Saving…' : 'Save Key'}
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

			{/* Google Drive Backups */}
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
							▶
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
							locally, <strong>or</strong> run the authorize command inside the
							Docker container (no local install needed):
							<pre className='mt-1.5 text-xs bg-muted rounded px-2 py-1.5 font-mono overflow-x-auto'>
								docker exec -it bedrock-forge-forge-1 rclone authorize "drive"
							</pre>
						</li>
						<li>
							A browser window will open — sign in with your Google account and
							click <strong>Allow</strong>.
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
									Testing…
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
						{gdriveTestResult.success ? '✓ ' : '✗ '}
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
								Saving…
							</>
						) : (
							'Save & Test'
						)}
					</Button>
				</div>
			</div>

			{/* Safety & Automation */}
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

			{/* Custom GitHub Plugins */}
			<div className='border rounded-lg p-4 bg-card'>
				<CustomPluginsSettings />
			</div>

			{/* New setting form */}
			<div className='border rounded-lg p-4 bg-card space-y-4'>
				<h2 className='font-semibold flex items-center gap-2'>
					<Plus className='h-4 w-4' />
					New Setting
				</h2>
				<form onSubmit={handleNew(onNew)} className='grid grid-cols-2 gap-3'>
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
							{isCreating ? 'Saving…' : 'Add Setting'}
						</Button>
					</div>
				</form>
			</div>

			{isLoading && <p className='text-muted-foreground'>Loading…</p>}

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
