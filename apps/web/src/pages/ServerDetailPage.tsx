import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	ArrowLeft,
	Server as ServerIcon,
	FolderKanban,
	Globe,
	Plug,
	ExternalLink,
	Pencil,
	RefreshCw,
	Activity,
	HardDrive,
	Terminal,
	Cpu,
	MemoryStick,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ServerFormDialog } from './ServersPage';

interface Environment {
	id: number;
	type: string;
	url: string | null;
	root_path: string;
	google_drive_folder_id: string | null;
	project: {
		id: number;
		name: string;
		client: { id: number; name: string };
	};
}

interface ServerDetail {
	id: number;
	name: string;
	ip_address: string;
	ssh_port: number;
	ssh_user: string;
	provider: string | null;
	status: 'online' | 'offline' | 'unknown';
	cyberpanel_version: string | null;
	created_at: string;
	environments: Environment[];
	_count: { environments: number };
}

interface SshHealth {
	active: number;
	idle: number;
	total: number;
	maxConnections: number;
	status: 'healthy' | 'busy' | 'empty';
}

interface SystemStats {
	cpu_usage: number | null;
	memory_used_mb: number | null;
	memory_total_mb: number | null;
	disk_used_gb: number | null;
	disk_total_gb: number | null;
	uptime_seconds: number | null;
	load_average: [number, number, number] | null;
}

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'secondary'> = {
	online: 'success',
	offline: 'destructive',
	unknown: 'secondary',
};

function fmtUptime(seconds: number): string {
	const d = Math.floor(seconds / 86400);
	const h = Math.floor((seconds % 86400) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (d > 0) return `${d}d ${h}h`;
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

function StatCard({
	label,
	value,
	unit,
	icon: Icon,
	percent,
}: {
	label: string;
	value: string | number;
	unit?: string;
	icon: React.ElementType;
	percent?: number;
}) {
	return (
		<div className='bg-card border rounded-lg p-4 space-y-2'>
			<div className='flex items-center gap-2 text-muted-foreground text-xs font-medium uppercase tracking-wide'>
				<Icon className='h-3.5 w-3.5' />
				{label}
			</div>
			<div className='flex items-end gap-1'>
				<span className='text-2xl font-bold tabular-nums'>{value}</span>
				{unit && <span className='text-sm text-muted-foreground mb-0.5'>{unit}</span>}
			</div>
			{percent !== undefined && (
				<div className='w-full bg-muted rounded-full h-1.5'>
					<div
						className={`h-1.5 rounded-full transition-all ${
							percent > 90
								? 'bg-destructive'
								: percent > 70
									? 'bg-yellow-500'
									: 'bg-primary'
						}`}
						style={{ width: `${Math.min(percent, 100)}%` }}
					/>
				</div>
			)}
		</div>
	);
}

function OverviewTab({ server }: { server: ServerDetail }) {
	const { data: sshHealth } = useQuery<SshHealth>({
		queryKey: ['ssh-health', server.id],
		queryFn: () => api.get(`/servers/${server.id}/ssh-health`),
		staleTime: 30_000,
		retry: false,
	});

	const { data: stats, isLoading: statsLoading } = useQuery<SystemStats>({
		queryKey: ['server-stats', server.id],
		queryFn: () => api.get(`/servers/${server.id}/stats`),
		staleTime: 60_000,
		retry: false,
	});

	const cpuPct = stats?.cpu_usage ?? null;
	const memPct =
		stats?.memory_used_mb && stats?.memory_total_mb
			? Math.round((stats.memory_used_mb / stats.memory_total_mb) * 100)
			: null;
	const diskPct =
		stats?.disk_used_gb && stats?.disk_total_gb
			? Math.round((stats.disk_used_gb / stats.disk_total_gb) * 100)
			: null;

	return (
		<div className='space-y-6'>
			{/* Connection info */}
			<div className='bg-card border rounded-lg divide-y'>
				<div className='px-4 py-3'>
					<p className='text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2'>
						Connection
					</p>
					<div className='grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm'>
						<div>
							<p className='text-muted-foreground text-xs'>IP Address</p>
							<p className='font-mono font-medium mt-0.5'>{server.ip_address}</p>
						</div>
						<div>
							<p className='text-muted-foreground text-xs'>SSH Port</p>
							<p className='font-mono font-medium mt-0.5'>{server.ssh_port}</p>
						</div>
						<div>
							<p className='text-muted-foreground text-xs'>SSH User</p>
							<p className='font-mono font-medium mt-0.5'>{server.ssh_user}</p>
						</div>
						<div>
							<p className='text-muted-foreground text-xs'>Provider</p>
							<p className='font-medium mt-0.5'>{server.provider ?? '—'}</p>
						</div>
					</div>
				</div>

				{sshHealth && (
					<div className='px-4 py-3'>
						<p className='text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2'>
							SSH Connection Pool
						</p>
						<div className='flex items-center gap-6 text-sm'>
							<div>
								<span className='text-muted-foreground'>Active </span>
								<span className='font-mono font-medium'>{sshHealth.active}</span>
							</div>
							<div>
								<span className='text-muted-foreground'>Idle </span>
								<span className='font-mono font-medium'>{sshHealth.idle}</span>
							</div>
							<div>
								<span className='text-muted-foreground'>Max </span>
								<span className='font-mono font-medium'>{sshHealth.maxConnections}</span>
							</div>
							<Badge
								variant={
									sshHealth.status === 'healthy'
										? 'success'
										: sshHealth.status === 'busy'
											? 'warning'
											: 'secondary'
								}
							>
								{sshHealth.status}
							</Badge>
						</div>
					</div>
				)}

				{server.cyberpanel_version && (
					<div className='px-4 py-3'>
						<p className='text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-2'>
							Control Panel
						</p>
						<div className='flex items-center gap-2'>
							<Badge variant='info'>CyberPanel {server.cyberpanel_version}</Badge>
						</div>
					</div>
				)}
			</div>

			{/* System stats */}
			{statsLoading ? (
				<div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
					{[1, 2, 3, 4].map(i => (
						<Skeleton key={i} className='h-24 rounded-lg' />
					))}
				</div>
			) : stats ? (
				<div className='grid grid-cols-2 sm:grid-cols-4 gap-4'>
					{cpuPct !== null && (
						<StatCard
							label='CPU'
							value={cpuPct}
							unit='%'
							icon={Cpu}
							percent={cpuPct}
						/>
					)}
					{memPct !== null && stats.memory_used_mb && stats.memory_total_mb && (
						<StatCard
							label='Memory'
							value={Math.round(stats.memory_used_mb / 1024)}
							unit={`/ ${Math.round(stats.memory_total_mb / 1024)} GB`}
							icon={MemoryStick}
							percent={memPct}
						/>
					)}
					{diskPct !== null && stats.disk_used_gb && stats.disk_total_gb && (
						<StatCard
							label='Disk'
							value={Math.round(stats.disk_used_gb)}
							unit={`/ ${Math.round(stats.disk_total_gb)} GB`}
							icon={HardDrive}
							percent={diskPct}
						/>
					)}
					{stats.uptime_seconds !== null && (
						<StatCard
							label='Uptime'
							value={fmtUptime(stats.uptime_seconds)}
							icon={Activity}
						/>
					)}
				</div>
			) : null}
		</div>
	);
}

function EnvironmentsTab({ environments }: { environments: Environment[] }) {
	const envsByProject = environments.reduce<Record<number, { project: Environment['project']; envs: Environment[] }>>(
		(acc, env) => {
			const pid = env.project.id;
			if (!acc[pid]) acc[pid] = { project: env.project, envs: [] };
			acc[pid].envs.push(env);
			return acc;
		},
		{},
	);

	if (environments.length === 0) {
		return (
			<div className='border rounded-lg p-8 text-center text-muted-foreground'>
				<FolderKanban className='h-8 w-8 mx-auto mb-3 opacity-50' />
				<p className='font-medium'>No environments</p>
				<p className='text-sm mt-1'>No environments are deployed on this server yet.</p>
			</div>
		);
	}

	const ENV_TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
		production: 'default',
		staging: 'secondary',
		development: 'outline',
	};

	return (
		<div className='space-y-4'>
			{Object.values(envsByProject).map(({ project, envs }) => (
				<div key={project.id} className='border rounded-lg overflow-hidden'>
					<div className='bg-muted/40 px-4 py-2.5 flex items-center justify-between'>
						<div className='flex items-center gap-2'>
							<FolderKanban className='h-4 w-4 text-muted-foreground' />
							<Link
								to={`/projects/${project.id}`}
								className='font-medium text-sm hover:text-primary transition-colors'
							>
								{project.name}
							</Link>
							<span className='text-muted-foreground text-xs'>· {project.client.name}</span>
						</div>
						<Badge variant='outline' className='text-xs'>
							{envs.length} env{envs.length !== 1 ? 's' : ''}
						</Badge>
					</div>
					<div className='divide-y'>
						{envs.map(env => (
							<div key={env.id} className='px-4 py-3 flex items-center justify-between gap-4'>
								<div className='flex items-center gap-3 min-w-0'>
									<Badge
										variant={ENV_TYPE_VARIANT[env.type] ?? 'secondary'}
										className='shrink-0 capitalize'
									>
										{env.type}
									</Badge>
									{env.url && (
										<a
											href={env.url}
											target='_blank'
											rel='noopener noreferrer'
											className='text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 min-w-0 truncate'
										>
											<Globe className='h-3.5 w-3.5 shrink-0' />
											<span className='truncate'>{env.url}</span>
											<ExternalLink className='h-3 w-3 shrink-0' />
										</a>
									)}
								</div>
								<code className='text-xs text-muted-foreground font-mono truncate max-w-xs'>
									{env.root_path}
								</code>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

export function ServerDetailPage() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const qc = useQueryClient();
	const isAdmin = useAuthStore(s => s.user?.roles?.includes('admin') ?? false);
	const [editOpen, setEditOpen] = useState(false);

	const { data: server, isLoading, isError } = useQuery<ServerDetail>({
		queryKey: ['server', id],
		queryFn: () => api.get(`/servers/${id}?include=environments`),
		enabled: !!id,
	});

	const testConnection = useMutation({
		mutationFn: () =>
			api.post<{ success: boolean; message: string; cyberpanelVersion?: string }>(
				`/servers/${id}/test-connection`,
				{},
			),
		onSuccess: result => {
			qc.invalidateQueries({ queryKey: ['server', id] });
			qc.invalidateQueries({ queryKey: ['servers'] });
			const versionLine = result.cyberpanelVersion
				? ` · CyberPanel ${result.cyberpanelVersion}`
				: '';
			toast({ title: `Server is reachable${versionLine}` });
		},
		onError: () => toast({ title: 'Connection test failed', variant: 'destructive' }),
	});

	async function handleOpenPanel() {
		try {
			const creds = await api.get<{ url?: string; username: string; password?: string }>(
				`/servers/${id}/cyberpanel/credentials`,
			);
			if (creds?.url) window.open(creds.url, '_blank', 'noopener,noreferrer');
			if (creds?.password) {
				try {
					await navigator.clipboard.writeText(creds.password);
				} catch { /* clipboard not available */ }
			}
			toast({
				title: creds?.url ? 'Opening control panel' : 'No panel URL configured',
				description: creds?.password ? 'Password copied to clipboard' : undefined,
			});
		} catch {
			toast({
				title: 'No panel credentials configured',
				description: 'Add them via Edit server → Panel Credentials',
				variant: 'destructive',
			});
		}
	}

	if (isLoading) {
		return (
			<div className='space-y-6 max-w-5xl'>
				<Skeleton className='h-8 w-32' />
				<div className='flex items-start justify-between'>
					<Skeleton className='h-10 w-64' />
					<Skeleton className='h-9 w-32' />
				</div>
				<Skeleton className='h-10 w-full rounded-lg' />
				<Skeleton className='h-48 w-full rounded-lg' />
			</div>
		);
	}

	if (isError || !server) {
		return (
			<div className='flex flex-col items-center justify-center py-24 text-center'>
				<ServerIcon className='h-12 w-12 text-muted-foreground mb-4' />
				<h2 className='text-lg font-semibold mb-1'>Server not found</h2>
				<p className='text-muted-foreground text-sm mb-4'>
					This server may have been deleted or you don't have access.
				</p>
				<Button variant='outline' onClick={() => navigate('/servers')}>
					<ArrowLeft className='h-4 w-4 mr-1.5' />
					Back to Servers
				</Button>
			</div>
		);
	}

	return (
		<div className='space-y-6 max-w-5xl'>
			{/* Back */}
			<Button variant='ghost' size='sm' className='-ml-1' onClick={() => navigate('/servers')}>
				<ArrowLeft className='h-4 w-4 mr-1.5' />
				All Servers
			</Button>

			{/* Header */}
			<div className='flex flex-wrap items-start justify-between gap-4'>
				<div>
					<div className='flex items-center gap-3 flex-wrap'>
						<h1 className='text-3xl font-bold tracking-tight'>{server.name}</h1>
						<Badge variant={STATUS_VARIANT[server.status] ?? 'secondary'} className='text-sm'>
							{server.status}
						</Badge>
					</div>
					<div className='flex items-center gap-2 text-muted-foreground text-sm mt-1.5'>
						<Terminal className='h-3.5 w-3.5' />
						<span className='font-mono'>
							{server.ssh_user}@{server.ip_address}:{server.ssh_port}
						</span>
					</div>
				</div>

				<div className='flex items-center gap-2 flex-wrap'>
					<Button
						variant='outline'
						size='sm'
						onClick={() => testConnection.mutate()}
						disabled={testConnection.isPending}
					>
						{testConnection.isPending ? (
							<RefreshCw className='h-4 w-4 mr-1.5 animate-spin' />
						) : (
							<Plug className='h-4 w-4 mr-1.5' />
						)}
						Test Connection
					</Button>
					{server.cyberpanel_version && (
						<Button variant='outline' size='sm' onClick={handleOpenPanel}>
							<ExternalLink className='h-4 w-4 mr-1.5' />
							Open Panel
						</Button>
					)}
					{isAdmin && (
						<Button variant='outline' size='sm' onClick={() => setEditOpen(true)}>
							<Pencil className='h-4 w-4 mr-1.5' />
							Edit
						</Button>
					)}
				</div>
			</div>

			{/* Stats strip */}
			<div className='flex flex-wrap gap-3'>
				<div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2'>
					<FolderKanban className='h-4 w-4 text-muted-foreground' />
					<div>
						<p className='text-xs text-muted-foreground'>Environments</p>
						<p className='text-sm font-medium'>{server.environments?.length ?? 0}</p>
					</div>
				</div>
				{server.provider && (
					<div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2'>
						<ServerIcon className='h-4 w-4 text-muted-foreground' />
						<div>
							<p className='text-xs text-muted-foreground'>Provider</p>
							<p className='text-sm font-medium'>{server.provider}</p>
						</div>
					</div>
				)}
				{server.cyberpanel_version && (
					<div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2'>
						<Globe className='h-4 w-4 text-muted-foreground' />
						<div>
							<p className='text-xs text-muted-foreground'>CyberPanel</p>
							<p className='text-sm font-medium'>{server.cyberpanel_version}</p>
						</div>
					</div>
				)}
			</div>

			{/* Tabs */}
			<Tabs defaultValue='overview'>
				<TabsList className='flex-wrap h-auto gap-1'>
					<TabsTrigger value='overview'>Overview</TabsTrigger>
					<TabsTrigger value='environments'>
						Environments
						{server.environments?.length > 0 && (
							<span className='ml-1.5 text-xs opacity-70'>({server.environments.length})</span>
						)}
					</TabsTrigger>
				</TabsList>

				<div className='mt-4'>
					<TabsContent value='overview'>
						<OverviewTab server={server} />
					</TabsContent>
					<TabsContent value='environments'>
						<EnvironmentsTab environments={server.environments ?? []} />
					</TabsContent>
				</div>
			</Tabs>

			{/* Edit dialog — re-use the form from ServersPage */}
			{isAdmin && editOpen && (
				<ServerFormDialog
					open={editOpen}
					onOpenChange={setEditOpen}
					initial={server}
					onSuccess={() => {
						qc.invalidateQueries({ queryKey: ['server', id] });
						qc.invalidateQueries({ queryKey: ['servers'] });
					}}
				/>
			)}
		</div>
	);
}
