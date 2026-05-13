import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Key, ShieldCheck, Lock, ShieldAlert, Fingerprint } from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

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

export function AccountTab() {
	const [sshKeyValue, setSshKeyValue] = useState('');
	const [deleteSshKeyOpen, setDeleteSshKeyOpen] = useState(false);

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

	return (
		<div className='space-y-6 max-w-4xl'>
			<Card className='overflow-hidden border-indigo-100 dark:border-indigo-900/30'>
				<CardHeader className='bg-indigo-50/50 dark:bg-indigo-950/20 pb-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg'>
							<Lock className='h-5 w-5 text-indigo-600 dark:text-indigo-400' />
						</div>
						<div>
							<CardTitle className='text-lg'>Security Credentials</CardTitle>
							<CardDescription>Update your password to keep your account secure.</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className='pt-6'>
					<form onSubmit={handlePwd(onChangePassword)} className='space-y-4 max-w-md'>
						<div className='space-y-1.5'>
							<Label htmlFor='cp-current'>Current Password</Label>
							<Input
								id='cp-current'
								type='password'
								{...regPwd('current_password')}
								autoComplete='current-password'
								className='bg-muted/20'
							/>
							{pwdErrors.current_password && (
								<p className='text-[10px] font-bold text-destructive uppercase tracking-wider'>
									{pwdErrors.current_password.message}
								</p>
							)}
						</div>
						<div className='grid grid-cols-2 gap-4'>
							<div className='space-y-1.5'>
								<Label htmlFor='cp-new'>New Password</Label>
								<Input
									id='cp-new'
									type='password'
									{...regPwd('new_password')}
									autoComplete='new-password'
									className='bg-muted/20'
								/>
								{pwdErrors.new_password && (
									<p className='text-[10px] font-bold text-destructive uppercase tracking-wider'>
										{pwdErrors.new_password.message}
									</p>
								)}
							</div>
							<div className='space-y-1.5'>
								<Label htmlFor='cp-confirm'>Confirm Password</Label>
								<Input
									id='cp-confirm'
									type='password'
									{...regPwd('confirm_password')}
									autoComplete='new-password'
									className='bg-muted/20'
								/>
								{pwdErrors.confirm_password && (
									<p className='text-[10px] font-bold text-destructive uppercase tracking-wider'>
										{pwdErrors.confirm_password.message}
									</p>
								)}
							</div>
						</div>
						<Button 
							type='submit' 
							disabled={changePasswordMutation.isPending}
							className='bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 dark:shadow-none'
						>
							{changePasswordMutation.isPending
								? 'Saving\u2026'
								: 'Update Password'}
						</Button>
					</form>
				</CardContent>
			</Card>

			<Card className='overflow-hidden border-slate-200 dark:border-slate-800'>
				<CardHeader className='bg-slate-50/50 dark:bg-slate-900/50 pb-4'>
					<div className='flex items-center justify-between'>
						<div className='flex items-center gap-3'>
							<div className='p-2 bg-slate-100 dark:bg-slate-800 rounded-lg'>
								<Fingerprint className='h-5 w-5 text-slate-600 dark:text-slate-400' />
							</div>
							<div>
								<CardTitle className='text-lg'>Global SSH Key</CardTitle>
								<CardDescription>Authentication fallback for server connections.</CardDescription>
							</div>
						</div>
						{sshKeyStatus?.has_key && (
							<Badge className='bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800 gap-1.5 px-3 py-1'>
								<ShieldCheck className='h-3.5 w-3.5' />
								Configured
							</Badge>
						)}
					</div>
				</CardHeader>
				<CardContent className='pt-6 space-y-4'>
					<div className='p-4 rounded-xl bg-muted/30 border border-dashed border-muted-foreground/20'>
						<p className='text-sm text-muted-foreground leading-relaxed'>
							Used as a fallback when no per-server SSH key is explicitly set. The key is stored
							using AES-256 encryption and is never exposed via API responses.
						</p>
					</div>

					<div className='space-y-2'>
						<Label htmlFor='global-ssh-key' className='font-bold text-xs uppercase tracking-wider text-muted-foreground'>
							{sshKeyStatus?.has_key
								? 'Replace Key (paste new key to overwrite)'
								: 'Paste Private Key'}
						</Label>
						<Textarea
							id='global-ssh-key'
							rows={6}
							className='font-mono text-xs resize-y bg-muted/20 focus-visible:ring-slate-400'
							placeholder='-----BEGIN OPENSSH PRIVATE KEY-----'
							value={sshKeyValue}
							onChange={e => setSshKeyValue(e.target.value)}
						/>
					</div>
					
					<div className='flex gap-3 pt-2'>
						<Button
							onClick={() => setSshKey.mutate(sshKeyValue)}
							disabled={setSshKey.isPending || sshKeyValue.trim().length < 20}
							className='bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600'
						>
							{setSshKey.isPending ? 'Saving\u2026' : 'Save SSH Key'}
						</Button>
						{sshKeyStatus?.has_key && (
							<Button
								variant='outline'
								className='text-destructive hover:bg-destructive/5 hover:text-destructive border-destructive/20'
								onClick={() => setDeleteSshKeyOpen(true)}
							>
								Remove Key
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			<AlertDialog
				open={deleteSshKeyOpen}
				onOpenChange={setDeleteSshKeyOpen}
				title='Remove Global SSH Key'
				description='This action cannot be undone. Servers without a specific SSH key configured will lose connectivity until a new key is provided.'
				confirmLabel='Permanently Remove'
				confirmVariant='destructive'
				onConfirm={() => deleteSshKey.mutate()}
				isPending={deleteSshKey.isPending}
			/>
		</div>
	);
}
