import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
	Pencil,
	Trash2,
	MoreHorizontal,
	Plug,
	ExternalLink,
	ChevronDown,
	ChevronUp,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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

interface Server {
	id: number;
	name: string;
	ip_address: string;
	ssh_port: number;
	ssh_user: string;
	provider: string | null;
	status: 'online' | 'offline' | 'unknown';
}

const serverSchema = z.object({
	name: z.string().min(1, 'Name is required').max(100),
	ip_address: z.string().min(1, 'IP/hostname is required'),
	ssh_port: z.coerce.number().int().min(1).max(65535).default(22),
	ssh_user: z.string().min(1, 'SSH user is required').default('root'),
	ssh_private_key: z.string().optional(),
	provider: z.string().optional().or(z.literal('')),
	// Panel credentials (CyberPanel / control panel)
	panel_url: z.string().optional().or(z.literal('')),
	panel_username: z.string().optional().or(z.literal('')),
	panel_password: z.string().optional(),
});
type ServerForm = z.infer<typeof serverSchema>;

interface PanelCredentials {
	url?: string;
	username: string;
	password?: string;
}

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'secondary'> =
	{
		online: 'success',
		offline: 'destructive',
		unknown: 'secondary',
	};

function ServerFormDialog({
	open,
	onOpenChange,
	initial,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	initial?: Server;
	onSuccess: () => void;
}) {
	const [panelExpanded, setPanelExpanded] = useState(false);

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<ServerForm>({
		resolver: zodResolver(serverSchema),
		defaultValues: {
			name: initial?.name ?? '',
			ip_address: initial?.ip_address ?? '',
			ssh_port: initial?.ssh_port ?? 22,
			ssh_user: initial?.ssh_user ?? 'root',
			provider: initial?.provider ?? '',
			ssh_private_key: '',
			panel_url: '',
			panel_username: '',
			panel_password: '',
		},
	});

	// Pre-load existing panel credentials when editing
	useQuery({
		queryKey: ['server-cyberpanel', initial?.id],
		enabled: !!initial?.id,
		queryFn: async () => {
			try {
				const data = await api.get<PanelCredentials>(
					`/servers/${initial!.id}/cyberpanel/credentials`,
				);
				if (data) {
					// Patch the form fields without resetting others
					reset(prev => ({
						...prev,
						panel_url: data.url ?? '',
						panel_username: data.username ?? '',
						panel_password: '',
					}));
					if (data.url || data.username) setPanelExpanded(true);
				}
			} catch {
				// No credentials stored yet — that's fine
			}
			return null;
		},
	});

	async function onSubmit(data: ServerForm) {
		try {
			const payload: Record<string, unknown> = {
				name: data.name,
				ip_address: data.ip_address,
				ssh_port: data.ssh_port,
				ssh_user: data.ssh_user,
				provider: data.provider || undefined,
			};
			if (data.ssh_private_key) {
				payload.ssh_private_key = data.ssh_private_key;
			}
			let serverId: number;
			if (initial) {
				await api.put(`/servers/${initial.id}`, payload);
				serverId = initial.id;
				toast({ title: 'Server updated' });
			} else {
				const created = await api.post<{ id: number }>('/servers', payload);
				serverId = created.id;
				toast({ title: 'Server created' });
			}
			// Save panel credentials if any credential fields are filled
			const hasPanelCreds =
				(data.panel_url && data.panel_url.trim()) ||
				(data.panel_username && data.panel_username.trim()) ||
				(data.panel_password && data.panel_password.trim());
			if (hasPanelCreds) {
				const panelPayload: Record<string, string> = {};
				if (data.panel_url) panelPayload.url = data.panel_url.trim();
				if (data.panel_username)
					panelPayload.username = data.panel_username.trim();
				if (data.panel_password)
					panelPayload.password = data.panel_password.trim();
				try {
					await api.put(
						`/servers/${serverId}/cyberpanel/credentials`,
						panelPayload,
					);
				} catch {
					toast({
						title: 'Panel credentials could not be saved',
						variant: 'destructive',
					});
				}
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
					<DialogTitle>{initial ? 'Edit Server' : 'New Server'}</DialogTitle>
				</DialogHeader>

				<form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
					<div className='space-y-1'>
						<Label htmlFor='s-name'>Name *</Label>
						<Input
							id='s-name'
							{...register('name')}
							placeholder='Production Web 01'
						/>
						{errors.name && (
							<p className='text-xs text-destructive'>{errors.name.message}</p>
						)}
					</div>

					<div className='grid grid-cols-3 gap-3'>
						<div className='col-span-2 space-y-1'>
							<Label htmlFor='s-ip'>IP / Hostname *</Label>
							<Input
								id='s-ip'
								{...register('ip_address')}
								placeholder='192.168.1.100'
								className='font-mono'
							/>
							{errors.ip_address && (
								<p className='text-xs text-destructive'>
									{errors.ip_address.message}
								</p>
							)}
						</div>
						<div className='space-y-1'>
							<Label htmlFor='s-port'>SSH Port</Label>
							<Input
								id='s-port'
								type='number'
								{...register('ssh_port')}
								placeholder='22'
								className='font-mono'
							/>
						</div>
					</div>

					<div className='grid grid-cols-2 gap-3'>
						<div className='space-y-1'>
							<Label htmlFor='s-user'>SSH User *</Label>
							<Input
								id='s-user'
								{...register('ssh_user')}
								placeholder='root'
								className='font-mono'
							/>
							{errors.ssh_user && (
								<p className='text-xs text-destructive'>
									{errors.ssh_user.message}
								</p>
							)}
						</div>
						<div className='space-y-1'>
							<Label htmlFor='s-provider'>Provider</Label>
							<Input
								id='s-provider'
								{...register('provider')}
								placeholder='DigitalOcean, AWS…'
							/>
						</div>
					</div>

					<div className='space-y-1'>
						<Label htmlFor='s-key'>
							SSH Private Key
							{initial && (
								<span className='ml-1 text-muted-foreground font-normal'>
									(leave blank to keep current)
								</span>
							)}
						</Label>
						<Textarea
							id='s-key'
							{...register('ssh_private_key')}
							rows={6}
							placeholder='-----BEGIN OPENSSH PRIVATE KEY-----'
							className='font-mono resize-y'
						/>
						<p className='text-xs text-muted-foreground'>
							Leave blank to use the global SSH key configured in Settings.
						</p>
					</div>
					{/* Panel Credentials (collapsible) */}
					<div className='border rounded-lg'>
						<button
							type='button'
							className='flex items-center justify-between w-full px-3 py-2.5 text-sm font-medium text-left hover:bg-muted/40 transition-colors rounded-lg'
							onClick={() => setPanelExpanded(v => !v)}
						>
							<span>
								Panel Credentials{' '}
								<span className='font-normal text-muted-foreground'>
									(CyberPanel, etc.)
								</span>
							</span>
							{panelExpanded ? (
								<ChevronUp className='h-4 w-4 text-muted-foreground' />
							) : (
								<ChevronDown className='h-4 w-4 text-muted-foreground' />
							)}
						</button>
						{panelExpanded && (
							<div className='px-3 pb-3 space-y-3 border-t pt-3'>
								<div className='space-y-1'>
									<Label htmlFor='s-panel-url'>Panel URL</Label>
									<Input
										id='s-panel-url'
										{...register('panel_url')}
										placeholder='https://cp.example.com:8090'
										className='font-mono'
									/>
								</div>
								<div className='grid grid-cols-2 gap-3'>
									<div className='space-y-1'>
										<Label htmlFor='s-panel-user'>Username</Label>
										<Input
											id='s-panel-user'
											{...register('panel_username')}
											placeholder='admin'
											autoComplete='off'
										/>
									</div>
									<div className='space-y-1'>
										<Label htmlFor='s-panel-pass'>
											Password
											{initial && (
												<span className='ml-1 text-xs text-muted-foreground font-normal'>
													(leave blank to keep)
												</span>
											)}
										</Label>
										<Input
											id='s-panel-pass'
											type='password'
											{...register('panel_password')}
											placeholder='••••••••'
											autoComplete='new-password'
										/>
									</div>
								</div>
							</div>
						)}
					</div>
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

export function ServersPage() {
	const qc = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Server | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState('');
	const [searchInput, setSearchInput] = useState('');

	const { data, isLoading } = useQuery({
		queryKey: ['servers', page, search],
		queryFn: () =>
			api.get<{ items: Server[]; total: number }>(
				`/servers?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`,
			),
	});

	const servers = data?.items ?? [];
	const totalPages = data ? Math.ceil(data.total / 20) : 1;

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/servers/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['servers'] });
			setDeleteTarget(null);
			toast({ title: 'Server deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	const testConnection = useMutation({
		mutationFn: (id: number) => api.post(`/servers/${id}/test-connection`, {}),
		onSuccess: (_, id) => {
			qc.invalidateQueries({ queryKey: ['servers'] });
			toast({ title: `Server #${id} is reachable` });
		},
		onError: () =>
			toast({ title: 'Connection test failed', variant: 'destructive' }),
	});

	function invalidate() {
		qc.invalidateQueries({ queryKey: ['servers'] });
	}

	async function handleOpenPanel(id: number) {
		try {
			const creds = await api.get<PanelCredentials>(
				`/servers/${id}/cyberpanel/credentials`,
			);
			if (creds?.url) window.open(creds.url, '_blank', 'noopener,noreferrer');
			if (creds?.password) {
				try {
					await navigator.clipboard.writeText(creds.password);
				} catch {
					/* clipboard not available */
				}
			}
			toast({
				title: creds?.url
					? `Opening panel for server #${id}`
					: `No panel URL configured`,
				description: creds?.password
					? 'Password copied to clipboard'
					: undefined,
			});
		} catch {
			toast({
				title: 'No panel credentials configured',
				description: 'Add them via Edit server → Panel Credentials',
				variant: 'destructive',
			});
		}
	}

	const columns: Column<Server>[] = [
		{
			header: 'Name',
			render: s => <span className='font-medium'>{s.name}</span>,
		},
		{
			header: 'IP Address',
			render: s => (
				<span className='font-mono text-muted-foreground'>
					{s.ip_address}:{s.ssh_port}
				</span>
			),
		},
		{
			header: 'SSH User',
			render: s => (
				<span className='font-mono text-muted-foreground'>{s.ssh_user}</span>
			),
		},
		{
			header: 'Provider',
			render: s => (
				<span className='text-muted-foreground'>{s.provider ?? '—'}</span>
			),
		},
		{
			header: 'Status',
			render: s => (
				<Badge variant={STATUS_VARIANT[s.status] ?? 'secondary'}>
					{s.status}
				</Badge>
			),
		},
	];

	return (
		<div className='space-y-4'>
			<PageHeader
				title='Servers'
				onCreate={() => setCreateOpen(true)}
				createLabel='New Server'
			/>

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
				placeholder='Search servers…'
				totalCount={data?.total ?? 0}
				totalLabel='total servers'
			/>

			<DataTable
				columns={columns}
				data={servers}
				isLoading={isLoading}
				rowKey={s => s.id}
				emptyMessage={search ? 'No results.' : 'No servers yet.'}
				renderActions={s => (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant='ghost' size='icon' className='h-7 w-7'>
								<MoreHorizontal className='h-4 w-4' />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end'>
							<DropdownMenuItem
								onClick={() => testConnection.mutate(s.id)}
								disabled={testConnection.isPending}
							>
								<Plug className='h-4 w-4 mr-2' />
								Test Connection
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => handleOpenPanel(s.id)}>
								<ExternalLink className='h-4 w-4 mr-2' />
								Open Panel
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => setEditTarget(s)}>
								<Pencil className='h-4 w-4 mr-2' />
								Edit
							</DropdownMenuItem>
							<DropdownMenuItem
								className='text-destructive focus:text-destructive'
								onClick={() => setDeleteTarget(s)}
							>
								<Trash2 className='h-4 w-4 mr-2' />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			/>

			<Pagination page={page} totalPages={totalPages} onPageChange={setPage} />

			<ServerFormDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onSuccess={invalidate}
			/>

			{editTarget && (
				<ServerFormDialog
					key={editTarget.id}
					open
					onOpenChange={o => !o && setEditTarget(null)}
					initial={editTarget}
					onSuccess={invalidate}
				/>
			)}

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title='Delete Server'
				description={`"${deleteTarget?.name}" (${deleteTarget?.ip_address}) will be permanently deleted. All associated environments and data will be removed.`}
				confirmLabel='Delete'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}
