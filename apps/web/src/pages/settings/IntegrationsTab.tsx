import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	Cloud,
	CloudOff,
	ShieldCheck,
	Loader2,
	MessageSquare,
	Bell,
	Trash2,
	Check,
	Activity,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GdriveStatus } from './types';

export function IntegrationsTab() {
	const qc = useQueryClient();
	const [gdriveToken, setGdriveToken] = useState('');
	const [gdriveTestResult, setGdriveTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);
	const [deleteGdriveOpen, setDeleteGdriveOpen] = useState(false);

	const { data: gdriveStatus, refetch: refetchGdrive } = useQuery({
		queryKey: ['gdrive-status'],
		queryFn: () => api.get<GdriveStatus>('/settings/gdrive'),
	});

	const { data: settings } = useQuery({
		queryKey: ['settings'],
		queryFn: () => api.get<Record<string, string>>('/settings'),
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

	const saveSetting = useMutation({
		mutationFn: ({ key, value }: { key: string; value: string }) =>
			api.put(`/settings/${key}`, { value }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['settings'] });
			toast({ title: 'Setting saved' });
		},
		onError: () => toast({ title: 'Save failed', variant: 'destructive' }),
	});

	const testWebhook = useMutation({
		mutationFn: ({ type, url }: { type: 'slack' | 'discord'; url: string }) =>
			api.post('/settings/test-webhook', { type, url }),
		onSuccess: () => toast({ title: 'Test notification sent' }),
		onError: (err: any) =>
			toast({
				title: 'Test failed',
				description: err?.message ?? 'Could not send test notification.',
				variant: 'destructive',
			}),
	});

	async function handleSaveAndTest() {
		if (!gdriveToken.trim()) return;
		await saveGdrive.mutateAsync(gdriveToken.trim());
		testGdrive.mutate();
	}

	return (
		<div className='space-y-6 max-w-4xl'>
			{/* Storage Integrations */}
			<Card className='overflow-hidden border-blue-100 dark:border-blue-900/30'>
				<CardHeader className='bg-blue-50/50 dark:bg-blue-950/20 pb-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg'>
							<Cloud className='h-5 w-5 text-blue-600 dark:text-blue-400' />
						</div>
						<div>
							<CardTitle className='text-lg'>Storage Providers</CardTitle>
							<CardDescription>Configure external storage for your backups and files.</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className='pt-6 space-y-6'>
					<div className='border rounded-xl p-5 bg-muted/20 space-y-5'>
						<div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
							<div className='flex items-center gap-4'>
								<div className='h-12 w-12 rounded-xl bg-background flex items-center justify-center border shadow-sm shrink-0'>
									<svg viewBox='0 0 24 24' className='h-7 w-7' fill='none' xmlns='http://www.w3.org/2000/svg'>
										<path d='M17.5 17.5L12.5 9H21.5L17.5 17.5Z' fill='#FFC107' />
										<path d='M6.5 17.5H17.5L12.5 9H6.5L17.5 17.5Z' fill='#FFC107' />
										<path d='M6.5 17.5L2.5 10.5L7.5 2H16.5L12.5 9L6.5 17.5Z' fill='#2196F3' />
										<path d='M7.5 2L12.5 9H21.5L16.5 2H7.5Z' fill='#4CAF50' />
									</svg>
								</div>
								<div>
									<p className='text-sm font-bold'>Google Drive</p>
									<p className='text-xs text-muted-foreground'>
										Cloud storage for system and project backups
									</p>
								</div>
							</div>
							{gdriveStatus?.configured ? (
								<Badge variant='success' className='gap-1.5 px-3 py-1'>
									<Check className='h-3.5 w-3.5' />
									Connected
								</Badge>
							) : (
								<Badge variant='outline' className='text-muted-foreground px-3 py-1'>
									Not Configured
								</Badge>
							)}
						</div>

						<div className='bg-background/50 border rounded-lg overflow-hidden'>
							<details className='group'>
								<summary className='cursor-pointer select-none px-4 py-3 text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center justify-between list-none'>
									<div className='flex items-center gap-2'>
										<ShieldCheck className='h-3.5 w-3.5' />
										Configuration Guide
									</div>
									<span className='transition-transform group-open:rotate-180'>
										&#9662;
									</span>
								</summary>
								<div className='px-4 pb-4 space-y-3 text-xs text-muted-foreground border-t'>
									<p>
										Run this command in your terminal to authorize Bedrock Forge to access your Google Drive:
									</p>
									<div className='relative group/code'>
										<pre className='bg-muted/50 rounded-lg px-4 py-3 font-mono text-[11px] overflow-x-auto border'>
											docker exec -it bedrock-forge-forge-1 rclone authorize &quot;drive&quot;
										</pre>
										<Button 
											variant='ghost' 
											size='icon' 
											className='absolute top-2 right-2 h-7 w-7 opacity-0 group-hover/code:opacity-100 transition-opacity'
											onClick={() => navigator.clipboard.writeText('docker exec -it bedrock-forge-forge-1 rclone authorize "drive"')}
										>
											<svg viewBox='0 0 24 24' width='14' height='14' stroke='currentColor' strokeWidth='2' fill='none' strokeLinecap='round' strokeLinejoin='round'><rect x='9' y='9' width='13' height='13' rx='2' ry='2'></rect><path d='M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'></path></svg>
										</Button>
									</div>
									<p>
										Follow the browser prompts, then copy/paste the resulting JSON token below.
									</p>
								</div>
							</details>
						</div>

						<div className='space-y-2.5'>
							<Label htmlFor='gdrive-token' className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
								{gdriveStatus?.configured
									? 'Update rclone JSON token'
									: 'Paste rclone JSON token'}
							</Label>
							<Textarea
								id='gdrive-token'
								rows={4}
								className='font-mono text-[11px] resize-none bg-background shadow-inner focus-visible:ring-blue-500/30'
								placeholder='{"access_token":"ya29.xxx", ...}'
								value={gdriveToken}
								onChange={e => {
									setGdriveToken(e.target.value);
									setGdriveTestResult(null);
								}}
							/>
						</div>

						<div className='flex flex-wrap items-center gap-3 pt-2'>
							<Button
								size='sm'
								className='bg-blue-600 hover:bg-blue-700 text-white transition-all shadow-md active:scale-95'
								onClick={handleSaveAndTest}
								disabled={
									saveGdrive.isPending ||
									testGdrive.isPending ||
									gdriveToken.trim().length < 20
								}
							>
								{saveGdrive.isPending ? (
									<>
										<Loader2 className='h-4 w-4 mr-2 animate-spin' />
										Saving...
									</>
								) : (
									'Save & Test Connection'
								)}
							</Button>

							{gdriveStatus?.configured && (
								<>
									<Button
										variant='outline'
										size='sm'
										className='transition-all active:scale-95'
										onClick={() => {
											setGdriveTestResult(null);
											testGdrive.mutate();
										}}
										disabled={testGdrive.isPending}
									>
										{testGdrive.isPending ? (
											<Loader2 className='h-4 w-4 animate-spin' />
										) : (
											'Refresh Connection'
										)}
									</Button>
									<Button
										variant='ghost'
										size='sm'
										className='text-destructive hover:bg-destructive/10 transition-colors'
										onClick={() => setDeleteGdriveOpen(true)}
									>
										<Trash2 className='h-4 w-4 mr-2' />
										Disconnect
									</Button>
								</>
							)}
						</div>

						{gdriveTestResult && (
							<div
								className={`text-xs px-4 py-3 rounded-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300 ${
									gdriveTestResult.success
										? 'bg-green-50/50 border-green-200 text-green-700 dark:bg-green-950/20 dark:border-green-900/50 dark:text-green-400'
										: 'bg-red-50/50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900/50 dark:text-red-400'
								}`}
							>
								<div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
									gdriveTestResult.success ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
								}`}>
									{gdriveTestResult.success ? <Check className='h-4 w-4' /> : <CloudOff className='h-4 w-4' />}
								</div>
								<span className='font-medium'>{gdriveTestResult.message}</span>
							</div>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Notification Integrations */}
			<Card className='overflow-hidden border-purple-100 dark:border-purple-900/30'>
				<CardHeader className='bg-purple-50/50 dark:bg-purple-950/20 pb-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg'>
							<Bell className='h-5 w-5 text-purple-600 dark:purple-400' />
						</div>
						<div>
							<CardTitle className='text-lg'>Notification Channels</CardTitle>
							<CardDescription>Stay updated with real-time alerts via your favorite apps.</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className='pt-6 space-y-8'>
					{/* Slack */}
					<div className='space-y-4'>
						<div className='flex items-center gap-4'>
							<div className='h-12 w-12 rounded-xl bg-[#4A154B] flex items-center justify-center border shadow-sm shrink-0'>
								<svg viewBox='0 0 100 100' className='h-6 w-6'>
									<path d='M20 55a10 10 0 1 1-10-10h10v10zm5 0a10 10 0 1 1 10 10H25V55zm0-25a10 10 0 1 1 10-10v10H25zm20 5a10 10 0 1 1 10 10H45V35zm0-25a10 10 0 1 1 10-10v10H45zm25 0a10 10 0 1 1 10 10H70V10zm0 25a10 10 0 1 1 10 10V35H70zm-20 45a10 10 0 1 1-10-10h10v10zm-5-25a10 10 0 1 1-10-10v10h10zm25 5a10 10 0 1 1-10 10V60h10z' fill='white'/>
								</svg>
							</div>
							<div className='flex-1'>
								<p className='text-sm font-bold'>Slack Webhook</p>
								<p className='text-xs text-muted-foreground'>
									Send uptime alerts and system notifications to a Slack channel.
								</p>
							</div>
						</div>
						<div className='flex gap-3 pl-16'>
							<div className='flex-1 relative group'>
								<Input
									placeholder='https://hooks.slack.com/services/...'
									className='font-mono text-xs pr-10 bg-muted/20 focus:bg-background transition-all'
									defaultValue={settings?.slack_webhook_url}
									onBlur={e => {
										const val = e.target.value.trim();
										if (val !== settings?.slack_webhook_url) {
											saveSetting.mutate({ key: 'slack_webhook_url', value: val });
										}
									}}
								/>
								<div className='absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity'>
									<MessageSquare className='h-3.5 w-3.5 text-muted-foreground' />
								</div>
							</div>
							<Button 
								variant='outline' 
								size='sm' 
								className='px-4 transition-all active:scale-95'
								disabled={!settings?.slack_webhook_url || testWebhook.isPending}
								onClick={() => testWebhook.mutate({ type: 'slack', url: settings?.slack_webhook_url || '' })}
							>
								{testWebhook.isPending && testWebhook.variables?.type === 'slack' ? (
									<Loader2 className='h-4 w-4 animate-spin' />
								) : (
									'Test'
								)}
							</Button>
						</div>
					</div>

					{/* Discord */}
					<div className='space-y-4 pt-6 border-t'>
						<div className='flex items-center gap-4'>
							<div className='h-12 w-12 rounded-xl bg-[#5865F2] flex items-center justify-center border shadow-sm shrink-0'>
								<Activity className='h-6 w-6 text-white' />
							</div>
							<div className='flex-1'>
								<p className='text-sm font-bold'>Discord Webhook</p>
								<p className='text-xs text-muted-foreground'>
									Send alerts to a Discord channel via webhooks.
								</p>
							</div>
						</div>
						<div className='flex gap-3 pl-16'>
							<div className='flex-1 relative group'>
								<Input
									placeholder='https://discord.com/api/webhooks/...'
									className='font-mono text-xs pr-10 bg-muted/20 focus:bg-background transition-all'
									defaultValue={settings?.discord_webhook_url}
									onBlur={e => {
										const val = e.target.value.trim();
										if (val !== settings?.discord_webhook_url) {
											saveSetting.mutate({
												key: 'discord_webhook_url',
												value: val,
											});
										}
									}}
								/>
								<div className='absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity'>
									<Bell className='h-3.5 w-3.5 text-muted-foreground' />
								</div>
							</div>
							<Button 
								variant='outline' 
								size='sm' 
								className='px-4 transition-all active:scale-95'
								disabled={!settings?.discord_webhook_url || testWebhook.isPending}
								onClick={() => testWebhook.mutate({ type: 'discord', url: settings?.discord_webhook_url || '' })}
							>
								{testWebhook.isPending && testWebhook.variables?.type === 'discord' ? (
									<Loader2 className='h-4 w-4 animate-spin' />
								) : (
									'Test'
								)}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			<AlertDialog
				open={deleteGdriveOpen}
				onOpenChange={setDeleteGdriveOpen}
				title='Remove Google Drive Credentials'
				description='Google Drive credentials will be permanently removed. Future backups will be stored locally only. Are you sure?'
				confirmLabel='Yes, Remove Credentials'
				confirmVariant='destructive'
				onConfirm={() => deleteGdrive.mutate()}
				isPending={deleteGdrive.isPending}
			/>
		</div>
	);
}
