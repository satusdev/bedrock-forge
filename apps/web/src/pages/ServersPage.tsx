import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Trash2, MoreHorizontal, Plug, KeyRound } from 'lucide-react';
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
});
type ServerForm = z.infer<typeof serverSchema>;

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
			if (initial) {
				await api.put(`/servers/${initial.id}`, payload);
				toast({ title: 'Server updated' });
			} else {
				await api.post('/servers', payload);
				toast({ title: 'Server created' });
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


// ─── CyberPanel Credentials Dialog ──────────────────────────────────────────

interface CpCredentials {
	username: string;
	password: string;
	url?: string;
}

function CyberPanelCredentialsDialog({
	serverId,
	onOpenChange,
}: {
	serverId: number;
	onOpenChange: (o: boolean) => void;
}) {
	const qc = useQueryClient();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [url, setUrl] = useState('');
	const [saving, setSaving] = useState(false);

	const { isLoading } = useQuery({
		queryKey: ['server-cyberpanel', serverId],
		queryFn: async () => {
			const data = await api.get<CpCredentials>(`/servers/${serverId}/cyberpanel/credentials`);
			if (data) {
				setUsername(data.username ?? '');
				setUrl(data.url ?? '');
			}
			return data;
		},
	});

	async function handleSave() {
		if (!username || !password) {
			toast({ title: 'Username and password are required', variant: 'destructive' });
			return;
		}
		try {
			setSaving(true);
			await api.put(`/servers/${serverId}/cyberpanel/credentials`, {
				username,
				password,
				...(url && { url }),
			});
			qc.invalidateQueries({ queryKey: ['server-cyberpanel', serverId] });
			toast({ title: 'CyberPanel credentials saved' });
			onOpenChange(false);
		} catch {
			toast({ title: 'Save failed', variant: 'destructive' });
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>CyberPanel Credentials</DialogTitle>
				</DialogHeader>
				{isLoading ? (
					<p className='text-sm text-muted-foreground py-4'>Loading…</p>
				) : (
					<div className='space-y-4 py-2'>
						<div className='space-y-1'>
							<Label htmlFor='cp-url'>CyberPanel URL</Label>
							<Input
								id='cp-url'
								value={url}
								onChange={e => setUrl(e.target.value)}
								placeholder='https://cp.example.com:8090'
								className='font-mono'
							/>
						</div>
						<div className='space-y-1'>
							<Label htmlFor='cp-user'>Username *</Label>
							<Input
								id='cp-user'
								value={username}
								onChange={e => setUsername(e.target.value)}
								placeholder='admin'
								autoComplete='off'
							/>
						</div>
						<div className='space-y-1'>
							<Label htmlFor='cp-pass'>Password *</Label>
							<Input
								id='cp-pass'
								type='password'
								value={password}
								onChange={e => setPassword(e.target.value)}
								placeholder='leave blank to keep current'
								autoComplete='new-password'
							/>
						</div>
					</div>
				)}
				<DialogFooter>
					<Button variant='outline' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button onClick={handleSave} disabled={saving || isLoading}>
						{saving ? 'Saving…' : 'Save'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ServersPage() {
	const qc = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Server | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
	const [cpTarget, setCpTarget] = useState<Server | null>(null);
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
							<DropdownMenuItem onClick={() => setCpTarget(s)}>
								<KeyRound className='h-4 w-4 mr-2' />
								CyberPanel Credentials
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
