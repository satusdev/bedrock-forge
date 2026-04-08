import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
	Globe,
	Pencil,
	Trash2,
	RefreshCw,
	MoreHorizontal,
	AlertTriangle,
	Clock,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertDialog } from '@/components/ui/alert-dialog';
import {
	PageHeader,
	SearchBar,
	DataTable,
	type Column,
	Pagination,
} from '@/components/crud';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

interface Project {
	id: number;
	name: string;
}

interface Domain {
	id: number;
	name: string;
	project_id: number;
	project: Project;
	expires_at: string | null;
	last_checked_at: string | null;
	whois_json: Record<string, unknown> | null;
}

interface PaginatedDomains {
	items: Domain[];
	total: number;
	page: number;
	limit: number;
}

const domainSchema = z.object({
	name: z
		.string()
		.min(1, 'Domain name is required')
		.max(253)
		.regex(/^[a-zA-Z0-9.-]+$/, 'Invalid domain name format'),
	project_id: z.coerce.number().int().positive('Project is required'),
});
type DomainForm = z.infer<typeof domainSchema>;

function daysUntilExpiry(expiresAt: string | null): number | null {
	if (!expiresAt) return null;
	const diff = new Date(expiresAt).getTime() - Date.now();
	return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
	const days = daysUntilExpiry(expiresAt);

	if (days === null) {
		return <span className='text-muted-foreground text-sm'>—</span>;
	}

	if (days < 0) {
		return (
			<Badge variant='destructive' className='gap-1'>
				<AlertTriangle className='h-3 w-3' />
				Expired
			</Badge>
		);
	}

	if (days <= 30) {
		return (
			<Badge variant='destructive' className='gap-1'>
				<Clock className='h-3 w-3' />
				{days}d left
			</Badge>
		);
	}

	if (days <= 90) {
		return (
			<Badge variant='warning' className='gap-1'>
				<Clock className='h-3 w-3' />
				{days}d left
			</Badge>
		);
	}

	return (
		<span className='text-sm text-muted-foreground'>
			{new Date(expiresAt!).toLocaleDateString()}
		</span>
	);
}

export function DomainsPage() {
	const qc = useQueryClient();
	const role = useAuthStore(s => s.user?.roles?.[0]);
	const isAdmin = role === 'admin';

	const [page, setPage] = useState(1);
	const [search, setSearch] = useState('');
	const [searchInput, setSearchInput] = useState('');
	const [projectFilter, setProjectFilter] = useState('');

	const [dialogOpen, setDialogOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Domain | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Domain | null>(null);
	const [refreshingId, setRefreshingId] = useState<number | null>(null);
	const [whoisTarget, setWhoisTarget] = useState<Domain | null>(null);

	const limit = 20;

	const { data, isLoading } = useQuery<PaginatedDomains>({
		queryKey: ['domains', page, search, projectFilter],
		queryFn: () => {
			const params = new URLSearchParams({
				page: String(page),
				limit: String(limit),
				...(search && { search }),
				...(projectFilter && { projectId: projectFilter }),
			});
			return api.get(`/domains?${params}`);
		},
	});

	const { data: projects } = useQuery<{ items: Project[] }>({
		queryKey: ['projects-list-domains'],
		queryFn: () => api.get('/projects?limit=200'),
	});

	const {
		register,
		handleSubmit,
		setValue,
		watch,
		reset,
		formState: { errors },
	} = useForm<DomainForm>({ resolver: zodResolver(domainSchema) });

	const selectedProjectId = watch('project_id');

	const invalidate = () => qc.invalidateQueries({ queryKey: ['domains'] });

	const createMutation = useMutation({
		mutationFn: (body: DomainForm) => api.post('/domains', body),
		onSuccess: () => {
			invalidate();
			setDialogOpen(false);
			reset();
			toast({ title: 'Domain added — WHOIS lookup started' });
		},
		onError: (e: { message?: string }) =>
			toast({ title: 'Error', description: e.message, variant: 'destructive' }),
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, body }: { id: number; body: Partial<DomainForm> }) =>
			api.put(`/domains/${id}`, body),
		onSuccess: () => {
			invalidate();
			setEditTarget(null);
			setDialogOpen(false);
			reset();
			toast({ title: 'Domain updated' });
		},
		onError: (e: { message?: string }) =>
			toast({ title: 'Error', description: e.message, variant: 'destructive' }),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/domains/${id}`),
		onSuccess: () => {
			invalidate();
			setDeleteTarget(null);
			toast({ title: 'Domain deleted' });
		},
		onError: (e: { message?: string }) =>
			toast({ title: 'Error', description: e.message, variant: 'destructive' }),
	});

	async function handleWhoisRefresh(domain: Domain) {
		setRefreshingId(domain.id);
		try {
			await api.post(`/domains/${domain.id}/whois-refresh`, {});
			toast({ title: `WHOIS refresh queued for ${domain.name}` });
		} catch (e: unknown) {
			const msg =
				e && typeof e === 'object' && 'message' in e
					? String((e as { message: unknown }).message)
					: 'Failed';
			toast({ title: 'Error', description: msg, variant: 'destructive' });
		} finally {
			setRefreshingId(null);
		}
	}

	function openCreate() {
		setEditTarget(null);
		reset({ name: '', project_id: undefined as unknown as number });
		setDialogOpen(true);
	}

	function openEdit(d: Domain) {
		setEditTarget(d);
		reset({ name: d.name, project_id: d.project_id });
		setValue('project_id', d.project_id);
		setDialogOpen(true);
	}

	function onSubmit(values: DomainForm) {
		if (editTarget) {
			updateMutation.mutate({ id: editTarget.id, body: values });
		} else {
			createMutation.mutate(values);
		}
	}

	const isPending = createMutation.isPending || updateMutation.isPending;
	const totalPages = data ? Math.ceil(data.total / limit) : 1;

	const columns: Column<Domain>[] = [
		{
			header: 'Domain',
			render: d => (
				<a
					href={`https://${d.name}`}
					target='_blank'
					rel='noopener noreferrer'
					className='font-mono text-sm text-primary hover:underline flex items-center gap-1.5'
				>
					<Globe className='h-3.5 w-3.5 shrink-0' />
					{d.name}
				</a>
			),
		},
		{
			header: 'Project',
			render: d => <span className='text-sm'>{d.project?.name ?? '—'}</span>,
		},
		{
			header: 'Expires',
			render: d => <ExpiryBadge expiresAt={d.expires_at} />,
		},
		{
			header: 'Last Checked',
			render: d =>
				d.last_checked_at
					? new Date(d.last_checked_at).toLocaleDateString()
					: '—',
		},
	];

	return (
		<div className='space-y-6 p-6'>
			<PageHeader
				title='Domains'
				onCreate={openCreate}
				createLabel='Add Domain'
			/>

			<div className='flex gap-3 flex-wrap'>
				<SearchBar
					value={searchInput}
					onChange={setSearchInput}
					onSearch={() => {
						setSearch(searchInput);
						setPage(1);
					}}
					onClear={() => {
						setSearchInput('');
						setSearch('');
						setPage(1);
					}}
					placeholder='Search domains…'
				/>
				<Select
					value={projectFilter}
					onValueChange={v => {
						setProjectFilter(v === 'all' ? '' : v);
						setPage(1);
					}}
				>
					<SelectTrigger className='w-48'>
						<SelectValue placeholder='All projects' />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value='all'>All projects</SelectItem>
						{projects?.items.map(p => (
							<SelectItem key={p.id} value={String(p.id)}>
								{p.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<DataTable
				data={data?.items ?? []}
				columns={columns}
				isLoading={isLoading}
				rowKey={d => d.id}
				renderActions={d => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='ghost' size='icon'>
								<MoreHorizontal className='h-4 w-4' />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end'>
							<DropdownMenuItem
								onClick={() => handleWhoisRefresh(d)}
								disabled={refreshingId === d.id}
							>
								<RefreshCw
									className={`h-4 w-4 mr-2 ${refreshingId === d.id ? 'animate-spin' : ''}`}
								/>
								Refresh WHOIS
							</DropdownMenuItem>
							{d.whois_json && (
								<DropdownMenuItem onClick={() => setWhoisTarget(d)}>
									<Globe className='h-4 w-4 mr-2' />
									View WHOIS
								</DropdownMenuItem>
							)}
							<DropdownMenuItem onClick={() => openEdit(d)}>
								<Pencil className='h-4 w-4 mr-2' />
								Edit
							</DropdownMenuItem>
							{isAdmin && (
								<DropdownMenuItem
									className='text-destructive'
									onClick={() => setDeleteTarget(d)}
								>
									<Trash2 className='h-4 w-4 mr-2' />
									Delete
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			/>

			{totalPages > 1 && (
				<Pagination
					page={page}
					totalPages={totalPages}
					onPageChange={setPage}
				/>
			)}

			{/* Create / Edit dialog */}
			<Dialog
				open={dialogOpen}
				onOpenChange={open => {
					if (!open) {
						setDialogOpen(false);
						setEditTarget(null);
						reset();
					}
				}}
			>
				<DialogContent className='max-w-md'>
					<DialogHeader>
						<DialogTitle>
							{editTarget ? 'Edit Domain' : 'Add Domain'}
						</DialogTitle>
					</DialogHeader>
					<form onSubmit={handleSubmit(onSubmit)} className='space-y-4 py-2'>
						<div className='space-y-1.5'>
							<Label htmlFor='d-name'>
								Domain Name <span className='text-destructive'>*</span>
							</Label>
							<Input
								id='d-name'
								{...register('name')}
								placeholder='example.com'
								autoFocus
							/>
							{errors.name && (
								<p className='text-xs text-destructive'>
									{errors.name.message}
								</p>
							)}
						</div>

						<div className='space-y-1.5'>
							<Label>
								Project <span className='text-destructive'>*</span>
							</Label>
							<Select
								value={selectedProjectId ? String(selectedProjectId) : ''}
								onValueChange={v => setValue('project_id', Number(v))}
							>
								<SelectTrigger>
									<SelectValue placeholder='Select project…' />
								</SelectTrigger>
								<SelectContent>
									{projects?.items.map(p => (
										<SelectItem key={p.id} value={String(p.id)}>
											{p.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{errors.project_id && (
								<p className='text-xs text-destructive'>
									{errors.project_id.message}
								</p>
							)}
						</div>

						<DialogFooter>
							<Button
								type='button'
								variant='outline'
								onClick={() => {
									setDialogOpen(false);
									setEditTarget(null);
									reset();
								}}
								disabled={isPending}
							>
								Cancel
							</Button>
							<Button type='submit' disabled={isPending}>
								{editTarget ? 'Save Changes' : 'Add Domain'}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* WHOIS viewer */}
			<Dialog
				open={!!whoisTarget}
				onOpenChange={open => {
					if (!open) setWhoisTarget(null);
				}}
			>
				<DialogContent className='max-w-lg'>
					<DialogHeader>
						<DialogTitle>WHOIS — {whoisTarget?.name}</DialogTitle>
					</DialogHeader>
					<pre className='text-xs bg-muted rounded p-3 overflow-auto max-h-96 whitespace-pre-wrap break-all'>
						{whoisTarget?.whois_json
							? JSON.stringify(whoisTarget.whois_json, null, 2)
							: 'No WHOIS data yet. Refresh to fetch.'}
					</pre>
				</DialogContent>
			</Dialog>

			{/* Delete confirmation */}
			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title={`Delete ${deleteTarget?.name ?? 'domain'}?`}
				description='This will permanently remove the domain and its WHOIS data.'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
				confirmLabel='Delete'
				confirmVariant='destructive'
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}
