import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Pencil, Plus, Trash2, X, Settings2, Info } from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

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

export function AdvancedTab() {
	const qc = useQueryClient();
	const [editKey, setEditKey] = useState<string | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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
		setError: setNewError,
		formState: { errors: newErrors, isSubmitting: isCreating },
	} = useForm<NewSettingForm>({ resolver: zodResolver(newSettingSchema) });

	async function onNew(data: NewSettingForm) {
		try {
			await api.put(`/settings/${data.key}`, { value: data.value });
			qc.invalidateQueries({ queryKey: ['settings'] });
			resetNew();
			toast({ title: 'Setting created' });
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'Create failed. Please try again.';
			setNewError('root', { message });
		}
	}

	const entries = data ? Object.entries(data) : [];

	return (
		<div className='space-y-6 max-w-4xl'>
			<Card className='overflow-hidden shadow-sm'>
				<CardHeader className='bg-muted/40 pb-4'>
					<div className='flex items-center gap-3'>
						<div className='p-2 bg-muted rounded-lg'>
							<Plus className='h-5 w-5 text-muted-foreground' />
						</div>
						<div>
							<CardTitle className='text-lg'>Quick Register</CardTitle>
							<CardDescription>Add a new low-level configuration key.</CardDescription>
						</div>
					</div>
				</CardHeader>
				<CardContent className='pt-6'>
					<form onSubmit={handleNew(onNew)} className='grid grid-cols-1 md:grid-cols-5 gap-4 items-end'>
						<div className='md:col-span-2 space-y-1.5'>
							<Label htmlFor='new-key' className='font-bold text-[10px] uppercase tracking-wider text-muted-foreground'>Key Name</Label>
							<Input
								id='new-key'
								{...regNew('key')}
								placeholder='app.feature_flag'
								className='font-mono text-xs bg-muted/20'
							/>
							{newErrors.key && (
								<p className='text-[10px] text-destructive font-bold uppercase'>{newErrors.key.message}</p>
							)}
						</div>
						<div className='md:col-span-2 space-y-1.5'>
							<Label htmlFor='new-val' className='font-bold text-[10px] uppercase tracking-wider text-muted-foreground'>Value</Label>
							<Input
								id='new-val'
								{...regNew('value')}
								placeholder='enabled'
								className='bg-muted/20'
							/>
							{newErrors.value && (
								<p className='text-[10px] text-destructive font-bold uppercase'>{newErrors.value.message}</p>
							)}
						</div>
						<div className='flex flex-col gap-1.5'>
							<Button type='submit' size='sm' disabled={isCreating} className='w-full'>
								{isCreating ? 'Saving\u2026' : 'Add Key'}
							</Button>
						</div>
						{newErrors.root && (
							<div className='md:col-span-5 p-2 bg-destructive/10 rounded-lg border border-destructive/20'>
								<p className='text-xs text-destructive text-center'>
									{newErrors.root.message}
								</p>
							</div>
						)}
					</form>
				</CardContent>
			</Card>

			<Card className='overflow-hidden'>
				<CardHeader className='pb-2'>
					<div className='flex items-center justify-between'>
						<div className='flex items-center gap-2'>
							<Settings2 className='h-4 w-4 text-primary/70' />
							<CardTitle className='text-base font-bold'>Configuration Keys</CardTitle>
						</div>
						<div className='flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-muted-foreground'>
							<Info className='h-3 w-3' />
							<span className='text-[10px] font-bold uppercase tracking-tight'>Read-Write</span>
						</div>
					</div>
				</CardHeader>
				<CardContent className='px-0'>
					<div className='divide-y border-t'>
						{isLoading ? (
							<div className='p-8 text-center text-muted-foreground'>
								<p className='text-sm animate-pulse'>Fetching configuration catalog\u2026</p>
							</div>
						) : entries.length === 0 ? (
							<div className='p-12 text-center text-muted-foreground'>
								<Settings2 className='h-8 w-8 mx-auto mb-2 opacity-20' />
								<p className='text-sm font-medium'>No custom settings found</p>
							</div>
						) : (
							entries.map(([key, value]) => (
								<div
									key={key}
									className='flex items-center justify-between px-6 py-4 hover:bg-muted/20 transition-colors'
								>
									<div className='flex-1 min-w-0 pr-4'>
										<p className='font-mono text-xs font-bold text-muted-foreground'>
											{key}
										</p>
										{editKey === key ? (
											<form
												onSubmit={handleEdit(fd =>
													updateMutation.mutate({ key, value: fd.value }),
												)}
												className='flex items-center gap-2 mt-2'
											>
												<Input
													{...regEdit('value')}
													defaultValue={value}
													className='flex-1 h-9 text-sm bg-background border-primary/30 focus-visible:ring-primary/20'
													autoFocus
												/>
												<Button
													type='submit'
													size='icon'
													className='h-9 w-9 shrink-0'
													disabled={updateMutation.isPending}
												>
													<Check className='h-4 w-4' />
												</Button>
												<Button
													type='button'
													variant='ghost'
													size='icon'
													className='h-9 w-9 shrink-0'
													onClick={() => setEditKey(null)}
												>
													<X className='h-4 w-4' />
												</Button>
											</form>
										) : (
											<p className='text-sm text-foreground mt-1 truncate max-w-md opacity-80'>
												{value}
											</p>
										)}
									</div>
									{editKey !== key && (
										<div className='flex items-center gap-1 shrink-0'>
											<Button
												variant='ghost'
												size='icon'
												className='h-8 w-8 hover:bg-muted'
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
												className='h-8 w-8 text-destructive hover:bg-destructive/5 hover:text-destructive'
												onClick={() => setDeleteTarget(key)}
											>
												<Trash2 className='h-3.5 w-3.5' />
											</Button>
										</div>
									)}
								</div>
							))
						)}
					</div>
				</CardContent>
			</Card>

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title='Confirm Deletion'
				description={`The configuration key "${deleteTarget}" will be permanently removed. This might affect system behavior if the key is in use.`}
				confirmLabel='Delete Permanently'
				confirmVariant='destructive'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}
