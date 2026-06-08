import React from 'react';
import { Clock } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface RetentionSettingsProps {
	data?: Record<string, string>;
	isLoading: boolean;
	isPending: boolean;
	onUpdate: (key: string, value: string) => void;
}

export function RetentionSettings({ data, isLoading, isPending, onUpdate }: RetentionSettingsProps) {
	return (
		<Card className='overflow-hidden'>
			<CardHeader className='bg-muted/40 pb-4'>
				<div className='flex items-center gap-3'>
					<div className='p-2 bg-info/10 rounded-lg'>
						<Clock className='h-5 w-5 text-info' />
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
											onUpdate('monitor_log_retention_days', val);
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
							onUpdate('auto_cleanup_enabled', String(checked))
						}
						disabled={isLoading || isPending}
					/>
				</div>
			</CardContent>
		</Card>
	);
}
