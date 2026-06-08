import React, { useState } from 'react';
import { Fingerprint, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useSshKeyStatus, useSetSshKeyMutation, useDeleteSshKeyMutation } from '../hooks';

export function GlobalSshKeyForm() {
	const [sshKeyValue, setSshKeyValue] = useState('');
	const [deleteSshKeyOpen, setDeleteSshKeyOpen] = useState(false);

	const { data: sshKeyStatus } = useSshKeyStatus();

	const setSshKey = useSetSshKeyMutation(() => {
		setSshKeyValue('');
	});

	const deleteSshKey = useDeleteSshKeyMutation(() => {
		setDeleteSshKeyOpen(false);
	});

	return (
		<>
			<Card className='overflow-hidden'>
				<CardHeader className='bg-muted/40 pb-4'>
					<div className='flex items-center justify-between'>
						<div className='flex items-center gap-3'>
							<div className='p-2 bg-muted rounded-lg'>
								<Fingerprint className='h-5 w-5 text-muted-foreground' />
							</div>
							<div>
								<CardTitle className='text-lg'>Global SSH Key</CardTitle>
								<CardDescription>Authentication fallback for server connections.</CardDescription>
							</div>
						</div>
						{sshKeyStatus?.has_key && (
							<Badge variant='success' className='gap-1.5 px-3 py-1'>
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
							className='font-mono text-xs resize-y bg-muted/20'
							placeholder='-----BEGIN OPENSSH PRIVATE KEY-----'
							value={sshKeyValue}
							onChange={e => setSshKeyValue(e.target.value)}
						/>
					</div>
					
					<div className='flex gap-3 pt-2'>
						<Button
							onClick={() => setSshKey.mutate(sshKeyValue)}
							disabled={setSshKey.isPending || sshKeyValue.trim().length < 20}
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
		</>
	);
}
