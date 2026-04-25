import { useState, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Loader2, Github, Package } from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import { AlertDialog } from '@/components/ui/alert-dialog';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

export interface CustomPlugin {
	id: number;
	name: string;
	slug: string;
	description: string | null;
	repo_url: string;
	repo_path: string;
	type: string;
	created_at: string;
	_count: { environment_plugins: number };
}

interface PluginFormData {
	name: string;
	slug: string;
	description: string;
	repo_url: string;
	repo_path: string;
	type: string;
}

const EMPTY_FORM: PluginFormData = {
	name: '',
	slug: '',
	description: '',
	repo_url: '',
	repo_path: '.',
	type: 'plugin',
};

function PluginFormDialog({
	initial,
	onClose,
	onSave,
	isPending,
}: {
	initial: PluginFormData;
	onClose: () => void;
	onSave: (data: PluginFormData) => void;
	isPending: boolean;
}) {
	const [form, setForm] = useState<PluginFormData>(initial);
	const isEdit = !!initial.name;

	function set(field: keyof PluginFormData, value: string) {
		setForm(prev => ({ ...prev, [field]: value }));
	}

	// Auto-slug from name when creating
	function handleNameChange(value: string) {
		set('name', value);
		if (!isEdit) {
			set(
				'slug',
				value
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-|-$/g, ''),
			);
		}
	}

	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!form.name.trim() || !form.slug.trim() || !form.repo_url.trim()) return;
		onSave(form);
	}

	return (
		<Dialog open onOpenChange={v => !v && onClose()}>
			<DialogContent className='sm:max-w-lg'>
				<DialogHeader>
					<DialogTitle>
						{isEdit ? 'Edit Custom Plugin' : 'Register Custom Plugin'}
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className='space-y-4 py-2'>
					<div className='grid grid-cols-2 gap-3'>
						<div className='space-y-1.5 col-span-2'>
							<label className='text-sm font-medium'>Display Name</label>
							<Input
								value={form.name}
								onChange={e => handleNameChange(e.target.value)}
								placeholder='WP Secure Guard'
								disabled={isPending}
								autoFocus
							/>
						</div>
						<div className='space-y-1.5'>
							<label className='text-sm font-medium'>Slug</label>
							<Input
								value={form.slug}
								onChange={e => set('slug', e.target.value.toLowerCase())}
								placeholder='wp-secure-guard'
								disabled={isPending}
								className='font-mono text-sm'
							/>
							<p className='text-xs text-muted-foreground'>
								Lowercase letters, numbers, hyphens
							</p>
						</div>
						<div className='space-y-1.5'>
							<label className='text-sm font-medium'>Type</label>
							<Select value={form.type} onValueChange={v => set('type', v)}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value='plugin'>Plugin</SelectItem>
									<SelectItem value='theme'>Theme</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className='space-y-1.5'>
						<label className='text-sm font-medium'>Repository URL</label>
						<Input
							value={form.repo_url}
							onChange={e => set('repo_url', e.target.value.trim())}
							placeholder='git@github.com:satusdev/wp-secure-guard.git'
							disabled={isPending}
							className='font-mono text-sm'
						/>
						<p className='text-xs text-muted-foreground'>
							SSH (<code>git@github.com:org/repo.git</code>) or HTTPS URL
						</p>
					</div>
					<div className='space-y-1.5'>
						<label className='text-sm font-medium'>
							Repository Path{' '}
							<span className='text-muted-foreground font-normal'>
								(optional)
							</span>
						</label>
						<Input
							value={form.repo_path}
							onChange={e => set('repo_path', e.target.value)}
							placeholder='.'
							disabled={isPending}
							className='font-mono text-sm'
						/>
						<p className='text-xs text-muted-foreground'>
							<code>.</code> for single-plugin repos; subdirectory path for
							monorepos (e.g. <code>wp-plugins/plugins</code>)
						</p>
					</div>
					<div className='space-y-1.5'>
						<label className='text-sm font-medium'>
							Description{' '}
							<span className='text-muted-foreground font-normal'>
								(optional)
							</span>
						</label>
						<Input
							value={form.description}
							onChange={e => set('description', e.target.value)}
							placeholder='Short description…'
							disabled={isPending}
						/>
					</div>
					<DialogFooter>
						<Button
							type='button'
							variant='outline'
							onClick={onClose}
							disabled={isPending}
						>
							Cancel
						</Button>
						<Button
							type='submit'
							disabled={
								!form.name.trim() ||
								!form.slug.trim() ||
								!form.repo_url.trim() ||
								isPending
							}
						>
							{isPending ? (
								<Loader2 className='h-4 w-4 mr-1.5 animate-spin' />
							) : null}
							{isEdit ? 'Save changes' : 'Register plugin'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function CustomPluginsSettings() {
	const qc = useQueryClient();
	const [dialogForm, setDialogForm] = useState<PluginFormData | null>(null);
	const [editTarget, setEditTarget] = useState<CustomPlugin | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<CustomPlugin | null>(null);

	const { data: plugins = [], isLoading } = useQuery<CustomPlugin[]>({
		queryKey: ['custom-plugins'],
		queryFn: () => api.get<CustomPlugin[]>('/custom-plugins'),
	});

	const createMutation = useMutation({
		mutationFn: (data: PluginFormData) =>
			api.post<CustomPlugin>('/custom-plugins', data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['custom-plugins'] });
			setDialogForm(null);
			toast({ title: 'Plugin registered' });
		},
		onError: (err: any) =>
			toast({
				title: 'Failed to register plugin',
				description: err?.message,
				variant: 'destructive',
			}),
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, data }: { id: number; data: PluginFormData }) =>
			api.put<CustomPlugin>(`/custom-plugins/${id}`, data),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['custom-plugins'] });
			setEditTarget(null);
			toast({ title: 'Plugin updated' });
		},
		onError: (err: any) =>
			toast({
				title: 'Update failed',
				description: err?.message,
				variant: 'destructive',
			}),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/custom-plugins/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['custom-plugins'] });
			setDeleteTarget(null);
			toast({ title: 'Plugin removed from catalog' });
		},
		onError: (err: any) =>
			toast({
				title: 'Delete failed',
				description: err?.message,
				variant: 'destructive',
			}),
	});

	return (
		<div className='space-y-4'>
			<div className='flex items-center justify-between'>
				<div>
					<h2 className='text-base font-semibold flex items-center gap-2'>
						<Github className='h-4 w-4' />
						Custom GitHub Plugins
					</h2>
					<p className='text-xs text-muted-foreground mt-0.5'>
						Register GitHub-hosted plugins once, then install them on any
						Bedrock environment via{' '}
						<code className='bg-muted px-1 rounded'>monorepo-fetcher</code>.
					</p>
				</div>
				<Button size='sm' onClick={() => setDialogForm(EMPTY_FORM)}>
					<Plus className='h-4 w-4 mr-1.5' />
					Register Plugin
				</Button>
			</div>

			{isLoading ? (
				<div className='space-y-2'>
					{[1, 2, 3].map(i => (
						<div key={i} className='h-14 bg-muted animate-pulse rounded-lg' />
					))}
				</div>
			) : plugins.length === 0 ? (
				<div className='border rounded-lg p-8 text-center text-muted-foreground'>
					<Package className='h-8 w-8 mx-auto mb-2 opacity-40' />
					<p className='font-medium text-sm'>
						No custom plugins registered yet
					</p>
					<p className='text-xs mt-1'>
						Register your GitHub-hosted plugins to install them on managed
						sites.
					</p>
				</div>
			) : (
				<div className='border rounded-lg overflow-hidden'>
					<table className='w-full text-sm'>
						<thead className='border-b bg-muted/40'>
							<tr>
								<th className='text-left px-4 py-2.5 font-medium'>Name</th>
								<th className='text-left px-4 py-2.5 font-medium'>
									Repository
								</th>
								<th className='text-left px-4 py-2.5 font-medium'>Path</th>
								<th className='text-left px-4 py-2.5 font-medium'>Sites</th>
								<th className='w-20 px-4 py-2.5' />
							</tr>
						</thead>
						<tbody className='divide-y'>
							{plugins.map(p => (
								<tr key={p.id} className='hover:bg-muted/20'>
									<td className='px-4 py-3'>
										<div className='flex items-center gap-2'>
											<span className='font-medium'>{p.name}</span>
											<Badge variant='outline' className='text-xs capitalize'>
												{p.type}
											</Badge>
										</div>
										<p className='text-xs text-muted-foreground font-mono mt-0.5'>
											{p.slug}
										</p>
										{p.description && (
											<p className='text-xs text-muted-foreground mt-0.5'>
												{p.description}
											</p>
										)}
									</td>
									<td className='px-4 py-3 font-mono text-xs text-muted-foreground max-w-xs truncate'>
										{p.repo_url}
									</td>
									<td className='px-4 py-3 font-mono text-xs text-muted-foreground'>
										{p.repo_path}
									</td>
									<td className='px-4 py-3 text-xs text-muted-foreground'>
										{p._count.environment_plugins}
									</td>
									<td className='px-4 py-3'>
										<div className='flex items-center gap-1'>
											<Button
												size='sm'
												variant='ghost'
												className='h-7 w-7 p-0'
												onClick={() => {
													setEditTarget(p);
												}}
											>
												<Pencil className='h-3.5 w-3.5' />
											</Button>
											<Button
												size='sm'
												variant='ghost'
												className='h-7 w-7 p-0 text-destructive hover:text-destructive'
												onClick={() => setDeleteTarget(p)}
												disabled={p._count.environment_plugins > 0}
												title={
													p._count.environment_plugins > 0
														? 'Uninstall from all environments first'
														: 'Delete'
												}
											>
												<Trash2 className='h-3.5 w-3.5' />
											</Button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{/* Create dialog */}
			{dialogForm && (
				<PluginFormDialog
					initial={dialogForm}
					onClose={() => setDialogForm(null)}
					onSave={data => createMutation.mutate(data)}
					isPending={createMutation.isPending}
				/>
			)}

			{/* Edit dialog */}
			{editTarget && (
				<PluginFormDialog
					initial={{
						name: editTarget.name,
						slug: editTarget.slug,
						description: editTarget.description ?? '',
						repo_url: editTarget.repo_url,
						repo_path: editTarget.repo_path,
						type: editTarget.type,
					}}
					onClose={() => setEditTarget(null)}
					onSave={data => updateMutation.mutate({ id: editTarget.id, data })}
					isPending={updateMutation.isPending}
				/>
			)}

			{/* Delete confirmation */}
			{deleteTarget && (
				<AlertDialog
					open
					onOpenChange={v => !v && setDeleteTarget(null)}
					title={`Remove ${deleteTarget.name}?`}
					description='This removes the plugin from the catalog. It will not uninstall it from environments where it is already deployed.'
					confirmLabel='Remove'
					confirmVariant='destructive'
					onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
					isPending={deleteMutation.isPending}
				/>
			)}
		</div>
	);
}
