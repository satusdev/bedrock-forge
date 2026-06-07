import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
	Cloud,
	CloudOff,
	ShieldCheck,
	Loader2,
	Trash2,
	Check,
	RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { GdriveStatus } from './types';

interface CloudflareStatus {
	configured: boolean;
	zone_id: string | null;
	zone_name: string | null;
}

interface CloudflareDnsRecord {
	id: string;
	type: string;
	name: string;
	content: string;
	proxied?: boolean;
	ttl?: number;
}

export function IntegrationsTab() {
	const [gdriveToken, setGdriveToken] = useState('');
	const [gdriveTestResult, setGdriveTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);
	const [deleteGdriveOpen, setDeleteGdriveOpen] = useState(false);
	const [cloudflareToken, setCloudflareToken] = useState('');
	const [cloudflareZoneId, setCloudflareZoneId] = useState('');
	const [cloudflareZoneName, setCloudflareZoneName] = useState('');
	const [cloudflareTestResult, setCloudflareTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);

	const { data: gdriveStatus, refetch: refetchGdrive } = useQuery({
		queryKey: ['gdrive-status'],
		queryFn: () => api.get<GdriveStatus>('/settings/gdrive'),
	});

	const { data: cloudflareStatus, refetch: refetchCloudflare } = useQuery({
		queryKey: ['cloudflare-status'],
		queryFn: () => api.get<CloudflareStatus>('/settings/cloudflare'),
	});

	const { data: dnsRecords = [], refetch: refetchDns } = useQuery({
		queryKey: ['cloudflare-dns-records'],
		queryFn: () =>
			api.get<CloudflareDnsRecord[]>('/settings/cloudflare/dns-records'),
		enabled: !!cloudflareStatus?.configured,
		retry: false,
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

	const saveCloudflare = useMutation({
		mutationFn: () =>
			api.put('/settings/cloudflare', {
				api_token: cloudflareToken,
				zone_id: cloudflareZoneId,
				zone_name: cloudflareZoneName,
			}),
		onSuccess: () => {
			setCloudflareToken('');
			setCloudflareTestResult(null);
			refetchCloudflare();
			toast({ title: 'Cloudflare saved' });
		},
		onError: (err: Error) =>
			toast({
				title: 'Failed to save Cloudflare',
				description: err.message,
				variant: 'destructive',
			}),
	});

	const testCloudflare = useMutation({
		mutationFn: () =>
			api.post<{ success: boolean; message: string }>(
				'/settings/cloudflare/test',
				{},
			),
		onSuccess: result => {
			setCloudflareTestResult(result);
			refetchDns();
		},
		onError: (err: Error) =>
			setCloudflareTestResult({
				success: false,
				message: err.message,
			}),
	});

	const purgeCloudflare = useMutation({
		mutationFn: () => api.post('/settings/cloudflare/cache/purge', {}),
		onSuccess: () => toast({ title: 'Cloudflare cache purge requested' }),
		onError: (err: Error) =>
			toast({
				title: 'Failed to purge cache',
				description: err.message,
				variant: 'destructive',
			}),
	});

	const toggleDevelopmentMode = useMutation({
		mutationFn: (enabled: boolean) =>
			api.put('/settings/cloudflare/development-mode', { enabled }),
		onSuccess: () => toast({ title: 'Development mode updated' }),
		onError: (err: Error) =>
			toast({
				title: 'Failed to update development mode',
				description: err.message,
				variant: 'destructive',
			}),
	});

	const toggleDnsProxy = useMutation({
		mutationFn: (record: CloudflareDnsRecord) =>
			api.put(`/settings/cloudflare/dns-records/${record.id}`, {
				proxied: !record.proxied,
			}),
		onSuccess: () => refetchDns(),
		onError: (err: Error) =>
			toast({
				title: 'Failed to update DNS record',
				description: err.message,
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
			<Tabs defaultValue='messaging'>
				<TabsList className='mb-4'>
					<TabsTrigger value='messaging'>Messaging</TabsTrigger>
					<TabsTrigger value='storage'>Storage</TabsTrigger>
					<TabsTrigger value='cloudflare'>Cloudflare</TabsTrigger>
				</TabsList>

				<TabsContent value='messaging'>
					<NotificationsPage />
				</TabsContent>

				<TabsContent value='storage'>
			<Card className='overflow-hidden'>
				<CardHeader className='bg-muted/40 pb-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-info/10 rounded-lg'>
							<Cloud className='h-5 w-5 text-info' />
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
								className='font-mono text-[11px] resize-none bg-background shadow-inner'
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
								className='transition-all shadow-md shadow-primary/15 active:scale-95'
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
										? 'bg-success/10 border-success/20 text-success'
										: 'bg-destructive/10 border-destructive/20 text-destructive'
								}`}
							>
								<div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
									gdriveTestResult.success
										? 'bg-success/10 text-success'
										: 'bg-destructive/10 text-destructive'
								}`}>
									{gdriveTestResult.success ? <Check className='h-4 w-4' /> : <CloudOff className='h-4 w-4' />}
								</div>
								<span className='font-medium'>{gdriveTestResult.message}</span>
							</div>
						)}
					</div>
				</CardContent>
			</Card>
				</TabsContent>

				<TabsContent value='cloudflare'>
					<Card>
						<CardHeader className='bg-muted/40 pb-4'>
							<div className='flex items-center gap-3'>
								<div className='p-2 bg-info/10 rounded-lg'>
									<Cloud className='h-5 w-5 text-info' />
								</div>
								<div>
									<CardTitle className='text-lg'>Cloudflare</CardTitle>
									<CardDescription>DNS, cache, and zone controls.</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className='pt-6 space-y-6'>
							<div className='flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4'>
								<div>
									<p className='text-sm font-semibold'>
										{cloudflareStatus?.zone_name || cloudflareStatus?.zone_id || 'No zone linked'}
									</p>
									<p className='text-xs text-muted-foreground'>
										{cloudflareStatus?.configured ? 'Token stored encrypted' : 'Add an API token and zone ID'}
									</p>
								</div>
								<Badge variant={cloudflareStatus?.configured ? 'success' : 'outline'}>
									{cloudflareStatus?.configured ? 'Connected' : 'Not Configured'}
								</Badge>
							</div>

							<div className='grid gap-3 sm:grid-cols-2'>
								<div className='space-y-1.5 sm:col-span-2'>
									<Label className='text-xs font-semibold text-muted-foreground'>API Token</Label>
									<Input
										type='password'
										value={cloudflareToken}
										onChange={event => setCloudflareToken(event.target.value)}
										placeholder='Cloudflare API token'
									/>
								</div>
								<div className='space-y-1.5'>
									<Label className='text-xs font-semibold text-muted-foreground'>Zone ID</Label>
									<Input
										value={cloudflareZoneId}
										onChange={event => setCloudflareZoneId(event.target.value)}
										placeholder={cloudflareStatus?.zone_id ?? 'zone id'}
									/>
								</div>
								<div className='space-y-1.5'>
									<Label className='text-xs font-semibold text-muted-foreground'>Zone Name</Label>
									<Input
										value={cloudflareZoneName}
										onChange={event => setCloudflareZoneName(event.target.value)}
										placeholder={cloudflareStatus?.zone_name ?? 'example.com'}
									/>
								</div>
							</div>

							<div className='flex flex-wrap gap-2'>
								<Button
									size='sm'
									onClick={() => saveCloudflare.mutate()}
									disabled={saveCloudflare.isPending || cloudflareToken.length < 20 || cloudflareZoneId.length < 3}
								>
									{saveCloudflare.isPending ? <Loader2 className='h-4 w-4 mr-1.5 animate-spin' /> : null}
									Save
								</Button>
								<Button
									size='sm'
									variant='outline'
									onClick={() => testCloudflare.mutate()}
									disabled={!cloudflareStatus?.configured || testCloudflare.isPending}
								>
									{testCloudflare.isPending ? <Loader2 className='h-4 w-4 mr-1.5 animate-spin' /> : <RefreshCw className='h-4 w-4 mr-1.5' />}
									Test
								</Button>
								<Button
									size='sm'
									variant='outline'
									onClick={() => purgeCloudflare.mutate()}
									disabled={!cloudflareStatus?.configured || purgeCloudflare.isPending}
								>
									Purge Cache
								</Button>
								<Button
									size='sm'
									variant='outline'
									onClick={() => toggleDevelopmentMode.mutate(true)}
									disabled={!cloudflareStatus?.configured || toggleDevelopmentMode.isPending}
								>
									Dev Mode On
								</Button>
								<Button
									size='sm'
									variant='outline'
									onClick={() => toggleDevelopmentMode.mutate(false)}
									disabled={!cloudflareStatus?.configured || toggleDevelopmentMode.isPending}
								>
									Dev Mode Off
								</Button>
							</div>

							{cloudflareTestResult && (
								<div className={`rounded-lg border px-4 py-3 text-sm ${cloudflareTestResult.success ? 'border-success/30 bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
									{cloudflareTestResult.message}
								</div>
							)}

							<div className='rounded-lg border overflow-hidden'>
								<div className='flex items-center justify-between border-b px-4 py-3'>
									<p className='text-sm font-semibold'>DNS Records</p>
									<Button size='sm' variant='ghost' onClick={() => refetchDns()}>
										<RefreshCw className='h-4 w-4' />
									</Button>
								</div>
								<div className='divide-y max-h-96 overflow-auto'>
									{dnsRecords.map(record => (
										<div key={record.id} className='grid gap-2 px-4 py-3 text-sm md:grid-cols-[70px_1fr_1fr_auto] md:items-center'>
											<Badge variant='outline'>{record.type}</Badge>
											<span className='truncate font-medium'>{record.name}</span>
											<span className='truncate text-muted-foreground'>{record.content}</span>
											<Button size='sm' variant='outline' onClick={() => toggleDnsProxy.mutate(record)} disabled={toggleDnsProxy.isPending}>
												{record.proxied ? 'Proxied' : 'DNS Only'}
											</Button>
										</div>
									))}
									{dnsRecords.length === 0 && (
										<div className='p-6 text-center text-sm text-muted-foreground'>
											No DNS records loaded.
										</div>
									)}
								</div>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

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
