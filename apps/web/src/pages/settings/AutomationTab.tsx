import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Clock, Trash2, Zap, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function AutomationTab() {
	const qc = useQueryClient();
	const { data, isLoading } = useQuery({
		queryKey: ['settings'],
		queryFn: () => api.get<Record<string, string>>('/settings'),
	});

	const updateMutation = useMutation({
		mutationFn: ({ key, value }: { key: string; value: string }) =>
			api.put(`/settings/${key}`, { value }),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['settings'] });
			toast({ title: 'Setting updated' });
		},
		onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
	});

	return (
		<div className='space-y-6 max-w-4xl'>
			{/* Safety Settings */}
			<Card className='overflow-hidden border-green-100 dark:border-green-900/30'>
				<CardHeader className='bg-green-50/50 dark:bg-green-950/20 pb-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-green-100 dark:bg-green-900/30 rounded-lg'>
							<Shield className='h-5 w-5 text-green-600 dark:text-green-400' />
						</div>
						<div>
							<CardTitle className='text-lg'>Safety & Safeguards</CardTitle>
							<CardDescription>Prevention mechanisms to ensure data integrity during operations.</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className='pt-6 space-y-4'>
					<div className='flex items-center justify-between gap-6 border rounded-xl p-5 bg-muted/20'>
						<div className='space-y-1'>
							<Label
								htmlFor='safety-backup-toggle'
								className='text-sm font-bold'
							>
								Snapshot before sync
							</Label>
							<p className='text-xs text-muted-foreground leading-relaxed max-w-md'>
								Recommended. Automatically create a full backup of the target environment
								immediately before every sync operation.
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
							className='data-[state=checked]:bg-green-600'
						/>
					</div>
				</CardContent>
			</Card>

			{/* Retention Settings */}
			<Card className='overflow-hidden border-blue-100 dark:border-blue-900/30'>
				<CardHeader className='bg-blue-50/50 dark:bg-blue-950/20 pb-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg'>
							<Clock className='h-5 w-5 text-blue-600 dark:text-blue-400' />
						</div>
						<div>
							<CardTitle className='text-lg'>Retention & Cleanup</CardTitle>
							<CardDescription>Automated housekeeping to keep your storage and logs clean.</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className='pt-6 space-y-6'>
					<div className='space-y-3'>
						<div className='flex items-center justify-between gap-6 border rounded-xl p-5 bg-muted/20'>
							<div className='space-y-1'>
								<Label className='text-sm font-bold'>
									Monitor Log Retention
								</Label>
								<p className='text-xs text-muted-foreground leading-relaxed max-w-md'>
									How long to keep historical uptime check results, incident
									logs, and status change history.
								</p>
							</div>
							<div className='flex items-center gap-3 shrink-0'>
								<div className='relative'>
									<Input
										type='number'
										min={1}
										max={365}
										defaultValue={data?.monitor_log_retention_days || '30'}
										onBlur={e => {
											const val = e.target.value.trim();
											if (val !== data?.monitor_log_retention_days) {
												updateMutation.mutate({
													key: 'monitor_log_retention_days',
													value: val,
												});
											}
										}}
										className='w-24 h-9 pr-12 text-right font-mono text-xs'
									/>
									<span className='absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none'>
										DAYS
									</span>
								</div>
							</div>
						</div>
					</div>

					<div className='flex items-center justify-between gap-6 border rounded-xl p-5 bg-muted/20'>
						<div className='space-y-1'>
							<Label className='text-sm font-bold'>
								Auto-cleanup temporary files
							</Label>
							<p className='text-xs text-muted-foreground leading-relaxed max-w-md'>
								Automatically delete temporary sync files and intermediate database dumps
								older than 24 hours to save disk space.
							</p>
						</div>
						<Switch
							checked={data?.auto_cleanup_enabled === 'true'}
							onCheckedChange={checked =>
								updateMutation.mutate({
									key: 'auto_cleanup_enabled',
									value: String(checked),
								})
							}
							disabled={isLoading || updateMutation.isPending}
							className='data-[state=checked]:bg-blue-600'
						/>
					</div>
				</CardContent>
			</Card>

			{/* Advanced Automation */}
			<Card className='overflow-hidden border-amber-100 dark:border-amber-900/30'>
				<CardHeader className='bg-amber-50/50 dark:bg-amber-950/20 pb-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg'>
							<Zap className='h-5 w-5 text-amber-600 dark:text-amber-400' />
						</div>
						<div>
							<CardTitle className='text-lg'>Advanced Automation</CardTitle>
							<CardDescription>Intelligent background tasks to keep your systems updated.</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className='pt-6 space-y-4'>
					<div className='flex items-center justify-between gap-6 border rounded-xl p-5 bg-muted/20'>
						<div className='space-y-1'>
							<Label className='text-sm font-bold'>
								Auto-update security plugins
							</Label>
							<p className='text-xs text-muted-foreground leading-relaxed max-w-md'>
								Attempt to automatically update core Bedrock Forge security
								plugins (WP Secure Guard, etc.) on managed servers.
							</p>
						</div>
						<Switch
							checked={data?.auto_update_plugins === 'true'}
							onCheckedChange={checked =>
								updateMutation.mutate({
									key: 'auto_update_plugins',
									value: String(checked),
								})
							}
							disabled={isLoading || updateMutation.isPending}
							className='data-[state=checked]:bg-amber-600'
						/>
					</div>

					<div className='mt-2 flex items-start gap-3 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/10 border border-amber-200/50'>
						<AlertCircle className='h-4 w-4 text-amber-600 mt-0.5' />
						<p className='text-[11px] text-amber-800 dark:text-amber-400'>
							<strong>Note:</strong> Auto-updates are only attempted for plugins maintained by Bedrock Forge to ensure stability.
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
