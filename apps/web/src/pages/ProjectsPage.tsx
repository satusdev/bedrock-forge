import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
	Pencil,
	Trash2,
	MoreHorizontal,
	Server as ServerIcon,
	Globe,
	Layers,
	ExternalLink,
	History,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { PageHeader, SearchBar, Pagination } from '@/components/crud';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImportFromServerDialog } from './projects/ImportFromServerDialog';
import { CreateBedrockDialog } from './projects/CreateBedrockDialog';
import {
	ExecutionLogPanel,
	ExpandLogButton,
} from '@/components/ui/execution-log-panel';
import { useWebSocketEvent } from '@/lib/websocket';

interface Client {
	id: number;
	name: string;
}

interface Package {
	id: number;
	name: string;
}

interface ProjectEnvironment {
	id: number;
	url: string;
	type: string;
	server: { id: number; name: string; ip_address: string };
}

interface Project {
	id: number;
	name: string;
	status: 'active' | 'inactive' | 'archived';
	client: { id: number; name: string };
	hosting_package: { name: string } | null;
	support_package: { name: string } | null;
	_count: { environments: number };
	environments: ProjectEnvironment[];
}

const projectSchema = z.object({
	name: z.string().min(1, 'Name is required').max(150),
	status: z.enum(['active', 'inactive', 'archived'], {
		required_error: 'Status is required',
	}),
	client_id: z.coerce
		.number({ invalid_type_error: 'Client is required' })
		.positive('Client is required'),
	hosting_package_id: z.coerce.number().optional(),
	support_package_id: z.coerce.number().optional(),
});
type ProjectForm = z.infer<typeof projectSchema>;

const STATUS_OPTIONS = ['active', 'inactive', 'archived'] as const;

export function ProjectFormDialog({
	open,
	onOpenChange,
	initial,
	clients,
	hostingPackages,
	supportPackages,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	initial?: Project;
	clients: Client[];
	hostingPackages: Package[];
	supportPackages: Package[];
	onSuccess: () => void;
}) {
	const {
		register,
		handleSubmit,
		setValue,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<ProjectForm>({
		resolver: zodResolver(projectSchema),
		defaultValues: {
			name: initial?.name ?? '',
			status: initial?.status ?? 'active',
			client_id: initial?.client.id ?? undefined,
			hosting_package_id: undefined,
			support_package_id: undefined,
		},
	});

	async function onSubmit(data: ProjectForm) {
		try {
			const payload = {
				name: data.name,
				status: data.status,
				client_id: data.client_id,
				hosting_package_id: data.hosting_package_id || undefined,
				support_package_id: data.support_package_id || undefined,
			};
			if (initial) {
				await api.put(`/projects/${initial.id}`, payload);
				toast({ title: 'Project updated' });
			} else {
				await api.post('/projects', payload);
				toast({ title: 'Project created' });
			}
			reset();
			onSuccess();
			onOpenChange(false);
		} catch {
			toast({ title: 'Save failed', variant: 'destructive' });
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-lg'>
				<DialogHeader>
					<DialogTitle>{initial ? 'Edit Project' : 'New Project'}</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
					<div className='space-y-1'>
						<Label htmlFor='p-name'>Name *</Label>
						<Input id='p-name' {...register('name')} placeholder='My Website' />
						{errors.name && (
							<p className='text-xs text-destructive'>{errors.name.message}</p>
						)}
					</div>

					<div className='grid grid-cols-2 gap-3'>
						<div className='space-y-1'>
							<Label>Client *</Label>
							<Select
								defaultValue={initial?.client.id?.toString()}
								onValueChange={v => setValue('client_id', Number(v))}
							>
								<SelectTrigger>
									<SelectValue placeholder='Select client…' />
								</SelectTrigger>
								<SelectContent>
									{clients.map(c => (
										<SelectItem key={c.id} value={c.id.toString()}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{errors.client_id && (
								<p className='text-xs text-destructive'>
									{errors.client_id.message}
								</p>
							)}
						</div>
						<div className='space-y-1'>
							<Label>Status</Label>
							<Select
								defaultValue={initial?.status ?? 'active'}
								onValueChange={v =>
									setValue('status', v as 'active' | 'inactive' | 'archived')
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{STATUS_OPTIONS.map(s => (
										<SelectItem key={s} value={s}>
											{s}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					{hostingPackages.length > 0 && (
						<div className='space-y-1'>
							<Label>Hosting Package</Label>
							<Select
								onValueChange={v =>
									setValue('hosting_package_id', v ? Number(v) : undefined)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder='None' />
								</SelectTrigger>
								<SelectContent>
									{hostingPackages.map(p => (
										<SelectItem key={p.id} value={p.id.toString()}>
											{p.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					{supportPackages.length > 0 && (
						<div className='space-y-1'>
							<Label>Support Package</Label>
							<Select
								onValueChange={v =>
									setValue('support_package_id', v ? Number(v) : undefined)
								}
							>
								<SelectTrigger>
									<SelectValue placeholder='None' />
								</SelectTrigger>
								<SelectContent>
									{supportPackages.map(p => (
										<SelectItem key={p.id} value={p.id.toString()}>
											{p.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}

					<DialogFooter>
						<Button
							type='button'
							variant='outline'
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type='submit' disabled={isSubmitting}>
							{isSubmitting ? 'Saving…' : initial ? 'Update' : 'Create'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

const STATUS_VARIANT: Record<
	string,
	'success' | 'destructive' | 'secondary' | 'warning'
> = {
	active: 'success',
	inactive: 'secondary',
	archived: 'secondary',
	pending: 'warning',
	suspended: 'destructive',
	cancelled: 'destructive',
};

function ProjectCard({
	project,
	onEdit,
	onDelete,
	onClick,
}: {
	project: Project;
	onEdit: () => void;
	onDelete: () => void;
	onClick: () => void;
}) {
	const primaryEnv = project.environments[0];
	const servers = [
		...new Map(project.environments.map(e => [e.server.id, e.server])).values(),
	];

	return (
		<Card
			className='group cursor-pointer hover:border-primary/50 transition-colors'
			onClick={onClick}
		>
			<CardHeader className='pb-3'>
				<div className='flex items-start justify-between gap-2'>
					<div className='min-w-0 flex-1'>
						<h3 className='font-semibold text-sm truncate leading-tight'>
							{project.name}
						</h3>
						<p className='text-xs text-muted-foreground mt-0.5 truncate'>
							{project.client.name}
						</p>
					</div>
					<div className='flex items-center gap-1.5 shrink-0'>
						<Badge
							variant={STATUS_VARIANT[project.status] ?? 'secondary'}
							className='text-xs'
						>
							{project.status}
						</Badge>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant='ghost'
									size='icon'
									className='h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity'
									onClick={e => e.stopPropagation()}
								>
									<MoreHorizontal className='h-3.5 w-3.5' />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align='end'>
								<DropdownMenuItem
									onClick={e => {
										e.stopPropagation();
										onEdit();
									}}
								>
									<Pencil className='h-4 w-4 mr-2' />
									Edit
								</DropdownMenuItem>
								<DropdownMenuItem
									className='text-destructive focus:text-destructive'
									onClick={e => {
										e.stopPropagation();
										onDelete();
									}}
								>
									<Trash2 className='h-4 w-4 mr-2' />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
			</CardHeader>

			<CardContent className='pt-0 space-y-2'>
				{project.environments.map(env => (
					<div key={env.id} className='flex items-center gap-1.5 min-w-0'>
						<Globe className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
						<a
							href={env.url}
							target='_blank'
							rel='noreferrer'
							className='text-xs text-primary hover:underline truncate flex items-center gap-1'
							onClick={e => e.stopPropagation()}
						>
							{env.url.replace(/^https?:\/\//, '')}
							<ExternalLink className='h-2.5 w-2.5 shrink-0' />
						</a>
						<Badge variant='outline' className='text-[10px] px-1.5 py-0 shrink-0'>
							{env.type}
						</Badge>
					</div>
				))}
				{servers.length > 0 && (
					<div className='flex items-center gap-1.5 min-w-0'>
						<ServerIcon className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
						<span className='text-xs text-muted-foreground truncate'>
							{servers.map(s => s.name).join(', ')}
						</span>
					</div>
				)}
				<div className='flex items-center gap-1.5'>
					<Layers className='h-3.5 w-3.5 text-muted-foreground' />
					<span className='text-xs text-muted-foreground'>
						{project._count.environments}{' '}
						{project._count.environments === 1
							? 'environment'
							: 'environments'}
					</span>
				</div>
			</CardContent>
		</Card>
	);
}

// ─── Bedrock Jobs Dialog ─────────────────────────────────────────────────────

interface BedrockJobRow {
	id: number;
	status: string;
	progress: number | null;
	last_error: string | null;
	started_at: string | null;
	completed_at: string | null;
	created_at: string;
	environment: {
		id: number;
		type: string;
		url: string | null;
		project: { id: number; name: string; client: { id: number; name: string } };
	} | null;
}

const BEDROCK_JOB_STATUS_VARIANT: Record<
	string,
	'success' | 'destructive' | 'info' | 'secondary'
> = {
	completed: 'success',
	failed: 'destructive',
	active: 'info',
	pending: 'secondary',
};

function bedrockDuration(
	started?: string | null,
	completed?: string | null,
): string {
	if (!started) return '—';
	const diff =
		(completed ? new Date(completed).getTime() : Date.now()) -
		new Date(started).getTime();
	if (diff < 1000) return `${diff}ms`;
	if (diff < 60_000) return `${(diff / 1000).toFixed(1)}s`;
	return `${Math.floor(diff / 60_000)}m ${Math.floor((diff % 60_000) / 1000)}s`;
}

function BedrockJobsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
}) {
	const qc = useQueryClient();
	const [expandedId, setExpandedId] = useState<number | null>(null);

	const { data, isLoading } = useQuery({
		queryKey: ['bedrock-jobs'],
		queryFn: () =>
			api.get<{ data: BedrockJobRow[]; total: number }>(
				'/job-executions?queue_name=projects&limit=10',
			),
		enabled: open,
		staleTime: 10_000,
		refetchInterval: open ? 10_000 : false,
	});

	useWebSocketEvent('job:completed', () => {
		qc.invalidateQueries({ queryKey: ['bedrock-jobs'] });
	});
	useWebSocketEvent('job:failed', () => {
		qc.invalidateQueries({ queryKey: ['bedrock-jobs'] });
	});

	const rows = data?.data ?? [];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='max-w-2xl'>
				<DialogHeader>
					<DialogTitle>Bedrock Provisioning Jobs</DialogTitle>
				</DialogHeader>

				<div className='mt-2 max-h-[60vh] overflow-y-auto'>
					{isLoading ? (
						<div className='py-8 text-center text-sm text-muted-foreground'>
							Loading…
						</div>
					) : rows.length === 0 ? (
						<div className='py-8 text-center text-sm text-muted-foreground'>
							No Bedrock provisioning jobs found.
						</div>
					) : (
						<div className='divide-y rounded-md border'>
							{rows.map(row => {
								const isActive =
									row.status === 'active' || row.status === 'pending';
								const isExpanded = expandedId === row.id;
								return (
									<div key={row.id}>
										<div className='flex items-center gap-3 px-4 py-3'>
											<Badge
												variant={
													BEDROCK_JOB_STATUS_VARIANT[row.status] ?? 'secondary'
												}
												className='shrink-0 capitalize'
											>
												{row.status}
											</Badge>
											<div className='min-w-0 flex-1'>
												{row.environment ? (
													<p className='text-sm font-medium truncate'>
														{row.environment.project.name}
													</p>
												) : (
													<p className='text-sm text-muted-foreground'>—</p>
												)}
												{row.environment?.url && (
													<p className='text-xs text-muted-foreground truncate'>
														{row.environment.url}
													</p>
												)}
												{row.last_error && (
													<p
														className='text-xs text-destructive truncate'
														title={row.last_error}
													>
														{row.last_error}
													</p>
												)}
											</div>
											<div className='shrink-0 text-right text-xs text-muted-foreground space-y-0.5'>
												<p>
													{new Date(
														row.started_at ?? row.created_at,
													).toLocaleString([], {
														dateStyle: 'short',
														timeStyle: 'short',
													})}
												</p>
												<p>
													{bedrockDuration(row.started_at, row.completed_at)}
												</p>
											</div>
											<ExpandLogButton
												expanded={isExpanded}
												onToggle={() =>
													setExpandedId(isExpanded ? null : row.id)
												}
											/>
										</div>
										{isExpanded && (
											<div className='px-4 pb-4 bg-muted/20'>
												<ExecutionLogPanel
													jobExecutionId={row.id}
													isActive={isActive}
												/>
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant='outline' onClick={() => onOpenChange(false)}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ProjectCardSkeleton() {
	return (
		<Card className='animate-pulse'>
			<CardHeader className='pb-3'>
				<div className='flex items-start justify-between gap-2'>
					<div className='space-y-1.5 flex-1'>
						<div className='h-4 bg-muted rounded w-3/4' />
						<div className='h-3 bg-muted rounded w-1/2' />
					</div>
					<div className='h-5 bg-muted rounded w-14' />
				</div>
			</CardHeader>
			<CardContent className='pt-0 space-y-2'>
				<div className='h-3 bg-muted rounded w-full' />
				<div className='h-3 bg-muted rounded w-2/3' />
				<div className='h-3 bg-muted rounded w-1/3' />
			</CardContent>
		</Card>
	);
}

export function ProjectsPage() {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState('');
	const [searchInput, setSearchInput] = useState('');
	const [clientFilter, setClientFilter] = useState('');
	const [createOpen, setCreateOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [bedrockOpen, setBedrockOpen] = useState(false);
	const [bedrockJobsOpen, setBedrockJobsOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Project | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

	const { data, isLoading } = useQuery({
		queryKey: ['projects', page, search, clientFilter],
		queryFn: () => {
			const qs = new URLSearchParams({ page: String(page), limit: '20' });
			if (search) qs.set('search', search);
			if (clientFilter) qs.set('client_id', clientFilter);
			return api.get<{ items: Project[]; total: number }>(`/projects?${qs}`);
		},
	});

	const { data: clients = [] } = useQuery({
		queryKey: ['clients-list'],
		queryFn: () =>
			api.get<{ items: Client[] }>('/clients?limit=100').then(r => r.items),
	});

	const { data: hostingPkgs = [] } = useQuery({
		queryKey: ['packages-hosting'],
		queryFn: () => api.get<Package[]>('/packages/hosting'),
	});

	const { data: supportPkgs = [] } = useQuery({
		queryKey: ['packages-support'],
		queryFn: () => api.get<Package[]>('/packages/support'),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/projects/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['projects'] });
			setDeleteTarget(null);
			toast({ title: 'Project deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	const totalPages = data ? Math.ceil(data.total / 20) : 1;

	function invalidate() {
		qc.invalidateQueries({ queryKey: ['projects'] });
	}

	const projects = data?.items ?? [];

	return (
		<div className='space-y-4'>
			<PageHeader
				title='Projects'
				onCreate={() => setCreateOpen(true)}
				createLabel='New Project'
			>
				<Button variant='outline' size='sm' onClick={() => setImportOpen(true)}>
					<ServerIcon className='h-4 w-4 mr-1.5' />
					Import from Server
				</Button>
				<Button
					variant='outline'
					size='sm'
					onClick={() => setBedrockJobsOpen(true)}
				>
					<History className='h-4 w-4 mr-1.5' />
					Bedrock Jobs
				</Button>
				<Button
					variant='default'
					size='sm'
					onClick={() => setBedrockOpen(true)}
				>
					<Layers className='h-4 w-4 mr-1.5' />
					Create Bedrock
				</Button>
			</PageHeader>

			<SearchBar
				value={searchInput}
				onChange={setSearchInput}
				onSearch={() => {
					setSearch(searchInput);
					setPage(1);
				}}
				onClear={() => {
					setSearch('');
					setSearchInput('');
					setPage(1);
				}}
				placeholder='Search projects…'
				totalCount={data?.total ?? 0}
				totalLabel='total projects'
			/>

			{/* Client filter */}
			<div className='flex gap-3 flex-wrap items-center'>
				<Select
					value={clientFilter || 'all'}
					onValueChange={v => {
						setClientFilter(v === 'all' ? '' : v);
						setPage(1);
					}}
				>
					<SelectTrigger className='w-44'>
						<SelectValue placeholder='All Clients' />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value='all'>All Clients</SelectItem>
						{clients.map(c => (
							<SelectItem key={c.id} value={String(c.id)}>
								{c.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{clientFilter && (
					<Button
						variant='ghost'
						size='sm'
						onClick={() => {
							setClientFilter('');
							setPage(1);
						}}
					>
						Clear filter
					</Button>
				)}
			</div>

			{isLoading ? (
				<div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'>
					{Array.from({ length: 6 }).map((_, i) => (
						<ProjectCardSkeleton key={i} />
					))}
				</div>
			) : projects.length === 0 ? (
				<div className='flex flex-col items-center justify-center py-16 text-center'>
					<ServerIcon className='h-10 w-10 text-muted-foreground/40 mb-3' />
					<p className='text-muted-foreground text-sm'>
						{search ? 'No results for that search.' : 'No projects yet.'}
					</p>
					{!search && (
						<Button
							variant='outline'
							size='sm'
							className='mt-4'
							onClick={() => setCreateOpen(true)}
						>
							Create your first project
						</Button>
					)}
				</div>
			) : (
				<div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'>
					{projects.map(project => (
						<ProjectCard
							key={project.id}
							project={project}
							onClick={() => navigate(`/projects/${project.id}`)}
							onEdit={() => setEditTarget(project)}
							onDelete={() => setDeleteTarget(project)}
						/>
					))}
				</div>
			)}

			<Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

			<ProjectFormDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				clients={clients}
				hostingPackages={hostingPkgs}
				supportPackages={supportPkgs}
				onSuccess={invalidate}
			/>

			{editTarget && (
				<ProjectFormDialog
					key={editTarget.id}
					open
					onOpenChange={o => !o && setEditTarget(null)}
					initial={editTarget}
					clients={clients}
					hostingPackages={hostingPkgs}
					supportPackages={supportPkgs}
					onSuccess={invalidate}
				/>
			)}

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title='Delete Project'
				description={`"${deleteTarget?.name}" and all associated environments, backups, and domains will be permanently deleted.`}
				confirmLabel='Delete'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
				isPending={deleteMutation.isPending}
			/>

			<ImportFromServerDialog
				open={importOpen}
				onOpenChange={setImportOpen}
				clients={clients}
				onSuccess={invalidate}
			/>
			<CreateBedrockDialog
				open={bedrockOpen}
				onOpenChange={setBedrockOpen}
				onSuccess={invalidate}
			/>
			<BedrockJobsDialog
				open={bedrockJobsOpen}
				onOpenChange={setBedrockJobsOpen}
			/>
		</div>
	);
}
