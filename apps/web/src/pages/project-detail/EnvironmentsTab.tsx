import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
	Plus,
	Pencil,
	Trash2,
	ExternalLink,
	Server,
	FolderOpen,
	Globe,
	HardDrive,
	Activity,
	ScanLine,
	MonitorSmartphone,
	Database,
	Eye,
	EyeOff,
	Copy,
	Shield,
	ChevronDown,
	ChevronUp,
	Loader2,
	FolderSync,
	CheckCircle2,
	CircleDashed,
	AlertTriangle,
	X,
	Users,
	LogIn,
} from 'lucide-react';
import { WS_EVENTS } from '@bedrock-forge/shared';
import { useWebSocketEvent, useSubscribeEnvironment } from '@/lib/websocket';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertDialog } from '@/components/ui/alert-dialog';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '@/components/ui/card';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface ServerOption {
	id: number;
	name: string;
	ip_address: string;
	status: 'online' | 'offline' | 'unknown';
}

interface DbCredentials {
	dbName: string;
	dbUser: string;
	dbPassword: string;
	dbHost: string;
}

interface Environment {
	id: number;
	project_id: number;
	type: string;
	url: string;
	root_path: string;
	backup_path: string | null;
	google_drive_folder_id: string | null;
	protected_tables: string[];
	server: {
		id: number;
		name: string;
		ip_address: string;
		status: 'online' | 'offline' | 'unknown';
	};
	environment_tags?: Array<{
		tag: { id: number; name: string; color: string | null };
	}>;
	latestProvisioningJob?: {
		id: number;
		status: string;
		progress: number | null;
		last_error: string | null;
	} | null;
}

interface Tag {
	id: number;
	name: string;
	color: string | null;
}

const envSchema = z.object({
	type: z.enum(['production', 'staging', 'development']),
	server_id: z.coerce
		.number({ invalid_type_error: 'Server is required' })
		.positive(),
	url: z.string().url('Must be a valid URL'),
	root_path: z.string().min(1, 'Root path is required').max(500),
	backup_path: z.string().max(500).optional().or(z.literal('')),
	google_drive_folder_id: z.string().max(500).optional().or(z.literal('')),
});
type EnvForm = z.infer<typeof envSchema>;

const ENV_TYPES = [
	{ value: 'production', label: 'Production' },
	{ value: 'staging', label: 'Staging' },
	{ value: 'development', label: 'Development' },
] as const;
type EnvTypeValue = (typeof ENV_TYPES)[number]['value'];

const SERVER_STATUS_VARIANT: Record<
	string,
	'success' | 'destructive' | 'secondary'
> = {
	online: 'success',
	offline: 'destructive',
	unknown: 'secondary',
};

function ProtectedTablesPicker({
	projectId,
	envId,
	value,
	onChange,
}: {
	projectId: number;
	envId: number | undefined;
	value: string[];
	onChange: (v: string[]) => void;
}) {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [allTables, setAllTables] = useState<string[]>([]);
	const [pendingSelection, setPendingSelection] = useState<string[]>([]);
	const [search, setSearch] = useState('');
	const [manualInput, setManualInput] = useState('');

	const fetchMutation = useMutation({
		mutationFn: () =>
			api.get<string[]>(
				`/projects/${projectId}/environments/${envId!}/db-tables`,
			),
		onSuccess: data => setAllTables(data),
		onError: () =>
			toast({
				title: 'Failed to load tables from server',
				variant: 'destructive',
			}),
	});

	const openDialog = () => {
		setPendingSelection([...value]);
		setSearch('');
		setDialogOpen(true);
	};

	const addManual = () => {
		const name = manualInput.trim().replace(/[^a-zA-Z0-9_$]/g, '');
		if (!name) return;
		if (!value.includes(name)) onChange([...value, name]);
		setManualInput('');
	};

	const filtered = allTables.filter(t =>
		t.toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<div className='space-y-2'>
			{/* Selected badges */}
			{value.length > 0 && (
				<div className='flex flex-wrap gap-1'>
					{value.map(t => (
						<Badge key={t} variant='secondary' className='gap-1 pr-1'>
							{t}
							<button
								type='button'
								onClick={() => onChange(value.filter(x => x !== t))}
								className='ml-0.5 rounded-sm hover:text-destructive focus:outline-none'
								aria-label={`Remove ${t}`}
							>
								<X className='h-3 w-3' />
							</button>
						</Badge>
					))}
				</div>
			)}

			{/* Manual input + Browse button */}
			<div className='flex gap-2'>
				<Input
					value={manualInput}
					onChange={e => setManualInput(e.target.value)}
					onKeyDown={e => {
						if (e.key === 'Enter') {
							e.preventDefault();
							addManual();
						}
					}}
					placeholder='Type table name…'
					className='h-8 text-sm'
				/>
				<Button type='button' variant='outline' size='sm' onClick={addManual}>
					Add
				</Button>
				{envId && (
					<Button
						type='button'
						variant='outline'
						size='sm'
						onClick={openDialog}
					>
						Browse
					</Button>
				)}
			</div>
			{value.length === 0 && (
				<p className='text-xs text-muted-foreground'>
					No tables protected. Add table names to preserve them during DB
					push/clone.
				</p>
			)}

			{/* Browse dialog */}
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className='sm:max-w-md'>
					<DialogHeader>
						<DialogTitle>Select Protected Tables</DialogTitle>
					</DialogHeader>
					<div className='space-y-3'>
						<Button
							type='button'
							variant='outline'
							size='sm'
							className='w-full'
							onClick={() => fetchMutation.mutate()}
							disabled={fetchMutation.isPending}
						>
							{fetchMutation.isPending ? (
								<>
									<Loader2 className='h-4 w-4 mr-2 animate-spin' />
									Loading tables…
								</>
							) : (
								<>
									<Database className='h-4 w-4 mr-2' />
									{allTables.length > 0
										? 'Reload tables from server'
										: 'Load tables from server'}
								</>
							)}
						</Button>

						{allTables.length > 0 && (
							<Input
								value={search}
								onChange={e => setSearch(e.target.value)}
								placeholder='Search tables…'
								className='h-8'
							/>
						)}

						{allTables.length > 0 && (
							<div className='max-h-60 overflow-y-auto rounded border divide-y'>
								{filtered.length === 0 && (
									<p className='text-xs text-muted-foreground p-3'>
										No tables match
									</p>
								)}
								{filtered.map(t => {
									const selected = pendingSelection.includes(t);
									return (
										<button
											key={t}
											type='button'
											onClick={() =>
												setPendingSelection(prev =>
													selected ? prev.filter(x => x !== t) : [...prev, t],
												)
											}
											className={cn(
												'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors',
												selected && 'bg-primary/10 text-primary font-medium',
											)}
										>
											<CheckCircle2
												className={cn(
													'h-4 w-4 shrink-0',
													selected
														? 'text-primary'
														: 'text-muted-foreground opacity-20',
												)}
											/>
											{t}
										</button>
									);
								})}
							</div>
						)}

						{allTables.length > 0 && (
							<p className='text-xs text-muted-foreground'>
								{pendingSelection.length} table
								{pendingSelection.length !== 1 ? 's' : ''} selected
							</p>
						)}
					</div>
					<DialogFooter>
						<Button
							type='button'
							variant='outline'
							onClick={() => setDialogOpen(false)}
						>
							Cancel
						</Button>
						<Button
							type='button'
							onClick={() => {
								onChange(pendingSelection);
								setDialogOpen(false);
							}}
						>
							Apply ({pendingSelection.length})
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function EnvironmentFormDialog({
	open,
	onOpenChange,
	projectId,
	initial,
	servers,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	projectId: number;
	initial?: Environment;
	servers: ServerOption[];
	onSuccess: () => void;
}) {
	const {
		register,
		handleSubmit,
		setValue,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<EnvForm>({
		resolver: zodResolver(envSchema),
		defaultValues: {
			type: (initial?.type as EnvTypeValue) ?? 'production',
			server_id: initial?.server.id ?? undefined,
			url: initial?.url ?? '',
			root_path: initial?.root_path ?? '',
			backup_path: initial?.backup_path ?? '',
			google_drive_folder_id: initial?.google_drive_folder_id ?? '',
		},
	});

	const [protectedTables, setProtectedTables] = useState<string[]>(
		initial?.protected_tables ?? [],
	);

	async function onSubmit(data: EnvForm) {
		try {
			const payload: Record<string, unknown> = {
				type: data.type,
				server_id: data.server_id,
				url: data.url,
				root_path: data.root_path,
				backup_path: data.backup_path || null,
				google_drive_folder_id: data.google_drive_folder_id || null,
				protected_tables: protectedTables,
			};
			if (initial) {
				await api.put(
					`/projects/${projectId}/environments/${initial.id}`,
					payload,
				);
				toast({ title: 'Environment updated' });
			} else {
				await api.post(`/projects/${projectId}/environments`, payload);
				toast({ title: 'Environment created' });
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
					<DialogTitle>
						{initial ? 'Edit Environment' : 'Add Environment'}
					</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
					<div className='grid grid-cols-2 gap-3'>
						<div className='space-y-1'>
							<Label htmlFor='env-type'>Type *</Label>
							<Select
								defaultValue={initial?.type ?? 'production'}
								onValueChange={v => setValue('type', v as EnvTypeValue)}
							>
								<SelectTrigger id='env-type'>
									<SelectValue placeholder='Select type…' />
								</SelectTrigger>
								<SelectContent>
									{ENV_TYPES.map(t => (
										<SelectItem key={t.value} value={t.value}>
											{t.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{errors.type && (
								<p className='text-xs text-destructive'>
									{errors.type.message}
								</p>
							)}
						</div>
						<div className='space-y-1'>
							<Label>Server *</Label>
							<Select
								defaultValue={initial?.server.id?.toString()}
								onValueChange={v => setValue('server_id', Number(v))}
							>
								<SelectTrigger>
									<SelectValue placeholder='Select server…' />
								</SelectTrigger>
								<SelectContent>
									{servers.map(s => (
										<SelectItem key={s.id} value={s.id.toString()}>
											{s.name} ({s.ip_address})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{errors.server_id && (
								<p className='text-xs text-destructive'>
									{errors.server_id.message}
								</p>
							)}
						</div>
					</div>

					<div className='space-y-1'>
						<Label htmlFor='env-url'>Site URL *</Label>
						<Input
							id='env-url'
							{...register('url')}
							placeholder='https://example.com'
						/>
						{errors.url && (
							<p className='text-xs text-destructive'>{errors.url.message}</p>
						)}
					</div>

					<div className='space-y-1'>
						<Label htmlFor='env-root'>Root Path *</Label>
						<Input
							id='env-root'
							{...register('root_path')}
							placeholder='/home/user/public_html'
						/>
						{errors.root_path && (
							<p className='text-xs text-destructive'>
								{errors.root_path.message}
							</p>
						)}
					</div>

					<div className='space-y-1'>
						<Label htmlFor='env-backup'>
							Backup Path{' '}
							<span className='text-muted-foreground font-normal text-xs'>
								(optional)
							</span>
						</Label>
						<Input
							id='env-backup'
							{...register('backup_path')}
							placeholder='/home/user/backups'
						/>
						<p className='text-xs text-muted-foreground'>
							Persistent directory on the server for backup files
						</p>
						{errors.backup_path && (
							<p className='text-xs text-destructive'>
								{errors.backup_path.message}
							</p>
						)}
					</div>

					<div className='space-y-1'>
						<Label htmlFor='env-gdrive'>
							Google Drive Folder ID{' '}
							<span className='text-muted-foreground font-normal text-xs'>
								(optional)
							</span>
						</Label>
						<Input
							id='env-gdrive'
							{...register('google_drive_folder_id')}
							placeholder='1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms'
						/>
						<p className='text-xs text-muted-foreground'>
							Backups for this environment are uploaded to this Google Drive
							folder
						</p>
						{errors.google_drive_folder_id && (
							<p className='text-xs text-destructive'>
								{errors.google_drive_folder_id.message}
							</p>
						)}
					</div>

					<div className='space-y-1'>
						<Label>
							Protected Tables{' '}
							<span className='text-muted-foreground font-normal text-xs'>
								(optional)
							</span>
						</Label>
						<ProtectedTablesPicker
							projectId={projectId}
							envId={initial?.id}
							value={protectedTables}
							onChange={setProtectedTables}
						/>
						<p className='text-xs text-muted-foreground'>
							WP table names preserved during DB push/clone. Use for custom
							plugin tables that hold production-only data.
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

const dbCredsSchema = z.object({
	dbName: z.string().min(1, 'Required').max(100),
	dbUser: z.string().min(1, 'Required').max(100),
	dbPassword: z.string().min(1, 'Required').max(200),
	dbHost: z.string().min(1, 'Required').max(255),
});
type DbCredsForm = z.infer<typeof dbCredsSchema>;

interface WpUser {
	id: number;
	user_login: string;
	user_email: string;
	display_name: string;
	user_registered: string;
	roles: string[];
}

interface QuickLoginResult {
	loginUrl: string;
	expiresAt: string;
}

function WpUsersSection({
	projectId,
	envId,
}: {
	projectId: number;
	envId: number;
}) {
	const [open, setOpen] = useState(false);
	const [loginResult, setLoginResult] = useState<QuickLoginResult | null>(null);
	const [loginDialogOpen, setLoginDialogOpen] = useState(false);
	const [loadingUserId, setLoadingUserId] = useState<number | null>(null);
	const [copied, setCopied] = useState(false);

	const {
		data: users,
		isLoading,
		isError,
		refetch,
	} = useQuery<WpUser[]>({
		queryKey: ['wp-users', envId],
		queryFn: () =>
			api.get<WpUser[]>(
				`/projects/${projectId}/environments/${envId}/wp-users`,
			),
		enabled: open,
		retry: false,
	});

	async function handleQuickLogin(userId: number) {
		setLoadingUserId(userId);
		try {
			const result = await api.post<QuickLoginResult>(
				`/projects/${projectId}/environments/${envId}/wp-quick-login`,
				{ user_id: userId },
			);
			setLoginResult(result);
			setLoginDialogOpen(true);
		} catch {
			toast({ title: 'Failed to create login link', variant: 'destructive' });
		} finally {
			setLoadingUserId(null);
		}
	}

	function copyLoginUrl() {
		if (!loginResult) return;
		navigator.clipboard.writeText(loginResult.loginUrl).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}

	const ROLE_COLORS: Record<string, string> = {
		administrator:
			'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
		editor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
		author:
			'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
		contributor:
			'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
		subscriber: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
	};

	return (
		<>
			<div className='border rounded-md overflow-hidden'>
				<button
					type='button'
					className='w-full flex items-center justify-between px-3 py-2 text-xs font-medium bg-muted/50 hover:bg-muted transition-colors'
					onClick={() => setOpen(o => !o)}
				>
					<span className='flex items-center gap-1.5'>
						<Users className='h-3.5 w-3.5 text-muted-foreground' />
						WP Users
					</span>
					{open ? (
						<ChevronUp className='h-3.5 w-3.5 text-muted-foreground' />
					) : (
						<ChevronDown className='h-3.5 w-3.5 text-muted-foreground' />
					)}
				</button>

				{open && (
					<div className='px-3 py-2.5 text-xs'>
						{isLoading && (
							<div className='space-y-1.5'>
								<Skeleton className='h-5 w-full' />
								<Skeleton className='h-5 w-4/5' />
								<Skeleton className='h-5 w-3/5' />
							</div>
						)}
						{isError && (
							<div className='flex items-center justify-between'>
								<p className='text-muted-foreground'>Failed to load users</p>
								<Button
									size='sm'
									variant='outline'
									className='h-6 text-xs'
									onClick={() => refetch()}
								>
									Retry
								</Button>
							</div>
						)}
						{!isLoading && !isError && users && users.length === 0 && (
							<p className='text-muted-foreground text-center py-1'>
								No users found
							</p>
						)}
						{!isLoading && !isError && users && users.length > 0 && (
							<div className='space-y-1'>
								{users.map(u => (
									<div
										key={u.id}
										className='flex items-center justify-between gap-2 py-1 border-b last:border-0'
									>
										<div className='flex items-center gap-2 min-w-0'>
											<div
												className='h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0'
												style={{
													backgroundColor: `hsl(${(u.user_login.charCodeAt(0) * 47) % 360}, 60%, 45%)`,
												}}
											>
												{u.user_login[0].toUpperCase()}
											</div>
											<div className='min-w-0'>
												<p className='font-medium truncate leading-tight'>
													{u.user_login}
												</p>
												<p className='text-muted-foreground truncate leading-tight'>
													{u.user_email}
												</p>
											</div>
											<div className='flex flex-wrap gap-1 shrink-0'>
												{u.roles.map(role => (
													<span
														key={role}
														className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ROLE_COLORS[role] ?? 'bg-muted text-muted-foreground'}`}
													>
														{role}
													</span>
												))}
											</div>
										</div>
										<Button
											size='sm'
											variant='outline'
											className='h-6 text-xs shrink-0'
											disabled={loadingUserId === u.id}
											onClick={() => handleQuickLogin(u.id)}
										>
											{loadingUserId === u.id ? (
												<Loader2 className='h-3 w-3 animate-spin' />
											) : (
												<>
													<LogIn className='h-3 w-3 mr-1' />
													Login
												</>
											)}
										</Button>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>

			{/* Quick login link dialog */}
			<Dialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen}>
				<DialogContent className='sm:max-w-md'>
					<DialogHeader>
						<DialogTitle className='flex items-center gap-2'>
							<LogIn className='h-4 w-4' /> Quick Login Link
						</DialogTitle>
					</DialogHeader>
					{loginResult && (
						<div className='space-y-4'>
							<p className='text-sm text-muted-foreground'>
								This one-time link expires at{' '}
								<span className='font-medium text-foreground'>
									{new Date(loginResult.expiresAt).toLocaleTimeString()}
								</span>{' '}
								and self-destructs after use.
							</p>
							<div className='flex items-center gap-2'>
								<code className='flex-1 text-xs bg-muted px-2 py-1.5 rounded font-mono break-all'>
									{loginResult.loginUrl}
								</code>
							</div>
							<div className='flex gap-2'>
								<Button
									variant='outline'
									className='flex-1'
									onClick={copyLoginUrl}
								>
									<Copy className='h-4 w-4 mr-2' />
									{copied ? 'Copied!' : 'Copy URL'}
								</Button>
								<Button
									className='flex-1'
									onClick={() => {
										window.open(loginResult.loginUrl, '_blank', 'noopener');
										setLoginDialogOpen(false);
									}}
								>
									<ExternalLink className='h-4 w-4 mr-2' />
									Open
								</Button>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}

function DbCredentialsSection({
	projectId,
	envId,
}: {
	projectId: number;
	envId: number;
}) {
	const qc = useQueryClient();
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState(false);
	const [showPass, setShowPass] = useState(false);

	const { data: creds, isLoading } = useQuery<DbCredentials | null>({
		queryKey: ['db-credentials', envId],
		queryFn: () =>
			api
				.get<DbCredentials | null>(
					`/projects/${projectId}/environments/${envId}/db-credentials`,
				)
				.catch(() => null),
		enabled: open,
	});

	const {
		register,
		handleSubmit,
		reset: resetForm,
		formState: { errors, isSubmitting },
	} = useForm<DbCredsForm>({
		resolver: zodResolver(dbCredsSchema),
		defaultValues: {
			dbName: creds?.dbName ?? '',
			dbUser: creds?.dbUser ?? '',
			dbPassword: creds?.dbPassword ?? '',
			dbHost: creds?.dbHost ?? 'localhost',
		},
		values: creds
			? {
					dbName: creds.dbName,
					dbUser: creds.dbUser,
					dbPassword: creds.dbPassword,
					dbHost: creds.dbHost,
				}
			: undefined,
	});

	async function saveCreds(data: DbCredsForm) {
		try {
			await api.put(
				`/projects/${projectId}/environments/${envId}/db-credentials`,
				data,
			);
			qc.invalidateQueries({ queryKey: ['db-credentials', envId] });
			toast({ title: 'DB credentials saved' });
			setEditing(false);
		} catch {
			toast({ title: 'Save failed', variant: 'destructive' });
		}
	}

	function copyToClipboard(text: string, label: string) {
		navigator.clipboard
			.writeText(text)
			.then(() => toast({ title: `${label} copied` }))
			.catch(() => {});
	}

	return (
		<div className='border rounded-md overflow-hidden'>
			<button
				type='button'
				className='w-full flex items-center justify-between px-3 py-2 text-xs font-medium bg-muted/50 hover:bg-muted transition-colors'
				onClick={() => setOpen(o => !o)}
			>
				<span className='flex items-center gap-1.5'>
					<Database className='h-3.5 w-3.5 text-muted-foreground' />
					DB Credentials
				</span>
				{open ? (
					<ChevronUp className='h-3.5 w-3.5 text-muted-foreground' />
				) : (
					<ChevronDown className='h-3.5 w-3.5 text-muted-foreground' />
				)}
			</button>

			{open && (
				<div className='px-3 py-2.5 space-y-2 text-xs'>
					{isLoading ? (
						<div className='space-y-1.5'>
							<Skeleton className='h-4 w-full' />
							<Skeleton className='h-4 w-3/4' />
						</div>
					) : !creds && !editing ? (
						<div className='text-center py-1 space-y-2'>
							<p className='text-muted-foreground'>No credentials stored</p>
							<Button
								size='sm'
								variant='outline'
								className='h-6 text-xs'
								onClick={() => setEditing(true)}
							>
								Add credentials
							</Button>
						</div>
					) : editing ? (
						<form onSubmit={handleSubmit(saveCreds)} className='space-y-2'>
							<div className='grid grid-cols-2 gap-2'>
								<div className='space-y-1'>
									<Label className='text-xs'>DB Name</Label>
									<Input
										{...register('dbName')}
										placeholder='wordpress_db'
										className='h-7 text-xs'
									/>
									{errors.dbName && (
										<p className='text-destructive text-xs'>
											{errors.dbName.message}
										</p>
									)}
								</div>
								<div className='space-y-1'>
									<Label className='text-xs'>Host</Label>
									<Input
										{...register('dbHost')}
										placeholder='localhost'
										className='h-7 text-xs'
									/>
									{errors.dbHost && (
										<p className='text-destructive text-xs'>
											{errors.dbHost.message}
										</p>
									)}
								</div>
							</div>
							<div className='grid grid-cols-2 gap-2'>
								<div className='space-y-1'>
									<Label className='text-xs'>Username</Label>
									<Input
										{...register('dbUser')}
										placeholder='db_user'
										className='h-7 text-xs'
									/>
									{errors.dbUser && (
										<p className='text-destructive text-xs'>
											{errors.dbUser.message}
										</p>
									)}
								</div>
								<div className='space-y-1'>
									<Label className='text-xs'>Password</Label>
									<Input
										type='password'
										{...register('dbPassword')}
										placeholder='••••••••'
										className='h-7 text-xs'
									/>
									{errors.dbPassword && (
										<p className='text-destructive text-xs'>
											{errors.dbPassword.message}
										</p>
									)}
								</div>
							</div>
							<div className='flex gap-2 pt-1'>
								<Button
									type='submit'
									size='sm'
									className='h-6 text-xs flex-1'
									disabled={isSubmitting}
								>
									{isSubmitting ? 'Saving…' : 'Save'}
								</Button>
								<Button
									type='button'
									size='sm'
									variant='outline'
									className='h-6 text-xs'
									onClick={() => {
										setEditing(false);
										resetForm();
									}}
								>
									Cancel
								</Button>
							</div>
						</form>
					) : (
						<div className='space-y-1.5'>
							<div className='flex items-center justify-between'>
								<span className='text-muted-foreground'>Database</span>
								<div className='flex items-center gap-1'>
									<span className='font-mono'>{creds!.dbName}</span>
									<button
										type='button'
										onClick={() => copyToClipboard(creds!.dbName, 'DB name')}
										className='text-muted-foreground hover:text-foreground'
									>
										<Copy className='h-3 w-3' />
									</button>
								</div>
							</div>
							<div className='flex items-center justify-between'>
								<span className='text-muted-foreground'>Host</span>
								<div className='flex items-center gap-1'>
									<span className='font-mono'>{creds!.dbHost}</span>
									<button
										type='button'
										onClick={() => copyToClipboard(creds!.dbHost, 'Host')}
										className='text-muted-foreground hover:text-foreground'
									>
										<Copy className='h-3 w-3' />
									</button>
								</div>
							</div>
							<div className='flex items-center justify-between'>
								<span className='text-muted-foreground'>Username</span>
								<div className='flex items-center gap-1'>
									<span className='font-mono'>{creds!.dbUser}</span>
									<button
										type='button'
										onClick={() => copyToClipboard(creds!.dbUser, 'Username')}
										className='text-muted-foreground hover:text-foreground'
									>
										<Copy className='h-3 w-3' />
									</button>
								</div>
							</div>
							<div className='flex items-center justify-between'>
								<span className='text-muted-foreground'>Password</span>
								<div className='flex items-center gap-1'>
									<span className='font-mono'>
										{showPass ? creds!.dbPassword : '••••••••'}
									</span>
									<button
										type='button'
										onClick={() => setShowPass(v => !v)}
										className='text-muted-foreground hover:text-foreground'
									>
										{showPass ? (
											<EyeOff className='h-3 w-3' />
										) : (
											<Eye className='h-3 w-3' />
										)}
									</button>
									<button
										type='button'
										onClick={() =>
											copyToClipboard(creds!.dbPassword, 'Password')
										}
										className='text-muted-foreground hover:text-foreground'
									>
										<Copy className='h-3 w-3' />
									</button>
								</div>
							</div>
							<Button
								size='sm'
								variant='outline'
								className='h-6 text-xs w-full mt-1'
								onClick={() => setEditing(true)}
							>
								Edit credentials
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function EnvironmentCard({
	env,
	projectId,
	onEdit,
	onDelete,
}: {
	env: Environment;
	projectId: number;
	onEdit: (e: Environment) => void;
	onDelete: (e: Environment) => void;
}) {
	const qc = useQueryClient();
	const [showAddTag, setShowAddTag] = useState(false);

	// Subscribe to WS room so real-time progress events reach this card
	useSubscribeEnvironment(env.id);

	const job = env.latestProvisioningJob;
	const isProvisioning =
		!!job && (job.status === 'queued' || job.status === 'active');
	const isProvisionFailed = !!job && job.status === 'failed';

	// Real-time job events for this environment
	useWebSocketEvent(WS_EVENTS.JOB_PROGRESS, (raw: unknown) => {
		const d = raw as { environmentId?: number; queueName?: string };
		if (d.environmentId === env.id && d.queueName === 'projects') {
			qc.invalidateQueries({ queryKey: ['environments', projectId] });
		}
	});
	useWebSocketEvent(WS_EVENTS.JOB_COMPLETED, (raw: unknown) => {
		const d = raw as { environmentId?: number; queueName?: string };
		if (d.environmentId === env.id && d.queueName === 'projects') {
			qc.invalidateQueries({ queryKey: ['environments', projectId] });
			qc.invalidateQueries({ queryKey: ['project', projectId] });
			toast({ title: `${env.type} environment provisioned` });
		}
	});
	useWebSocketEvent(WS_EVENTS.JOB_FAILED, (raw: unknown) => {
		const d = raw as {
			environmentId?: number;
			queueName?: string;
			error?: string;
		};
		if (d.environmentId === env.id && d.queueName === 'projects') {
			qc.invalidateQueries({ queryKey: ['environments', projectId] });
			toast({
				title: 'Provisioning failed',
				description: d.error,
				variant: 'destructive',
			});
		}
	});

	// ── Available tags query ────────────────────────────────────────────────
	const { data: allTags = [] } = useQuery<Tag[]>({
		queryKey: ['tags'],
		queryFn: () => api.get('/tags'),
		staleTime: 60_000,
	});

	const addTagMutation = useMutation({
		mutationFn: (tagId: number) =>
			api.post(`/environments/${env.id}/tags/${tagId}`, {}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['environments', projectId] });
			setShowAddTag(false);
		},
		onError: () =>
			toast({ title: 'Failed to add tag', variant: 'destructive' }),
	});

	const removeTagMutation = useMutation({
		mutationFn: (tagId: number) =>
			api.delete(`/environments/${env.id}/tags/${tagId}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['environments', projectId] });
		},
		onError: () =>
			toast({ title: 'Failed to remove tag', variant: 'destructive' }),
	});

	const currentTagIds = new Set(
		(env.environment_tags ?? []).map(et => et.tag.id),
	);
	const availableToAdd = allTags.filter(t => !currentTagIds.has(t.id));

	function triggerBackup() {
		api
			.post('/backups/create', { environmentId: env.id, type: 'full' })
			.then(() => toast({ title: 'Backup started' }))
			.catch(() =>
				toast({ title: 'Failed to start backup', variant: 'destructive' }),
			);
	}

	function triggerScan() {
		api
			.post(`/plugin-scans/environment/${env.id}/scan`, {})
			.then(() => toast({ title: 'Plugin scan queued' }))
			.catch(() =>
				toast({ title: 'Failed to start scan', variant: 'destructive' }),
			);
	}

	return (
		<Card className='flex flex-col'>
			{isProvisioning && (
				<div className='px-4 py-2 bg-blue-50 dark:bg-blue-950/40 border-b flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300 rounded-t-lg'>
					<Loader2 className='h-3.5 w-3.5 shrink-0 animate-spin' />
					<span className='flex-1'>
						{job.status === 'queued'
							? 'Provisioning queued…'
							: `Provisioning in progress${job.progress ? ` — ${job.progress}%` : '…'}`}
					</span>
				</div>
			)}
			{isProvisionFailed && (
				<div className='px-4 py-2 bg-red-50 dark:bg-red-950/40 border-b flex items-start gap-2 text-sm text-red-700 dark:text-red-300 rounded-t-lg'>
					<AlertTriangle className='h-3.5 w-3.5 shrink-0 mt-0.5' />
					<span className='flex-1 line-clamp-2'>
						Provisioning failed
						{job.last_error ? `: ${job.last_error}` : ''}.
					</span>
					<a href='/activity' className='shrink-0 underline whitespace-nowrap'>
						View logs
					</a>
				</div>
			)}
			<CardHeader className='pb-3'>
				<div className='flex items-start justify-between gap-2'>
					<div className='flex items-center gap-2 flex-wrap'>
						<Badge variant='outline' className='text-xs font-mono capitalize'>
							{env.type}
						</Badge>
						<Badge
							variant={SERVER_STATUS_VARIANT[env.server.status] ?? 'secondary'}
							className='text-xs'
						>
							{env.server.status}
						</Badge>
					</div>
					<div className='flex items-center gap-1 shrink-0'>
						<Button
							variant='ghost'
							size='icon'
							className='h-7 w-7'
							onClick={() => onEdit(env)}
							title='Edit environment'
						>
							<Pencil className='h-3.5 w-3.5' />
						</Button>
						<Button
							variant='ghost'
							size='icon'
							className='h-7 w-7 text-destructive hover:text-destructive'
							onClick={() => onDelete(env)}
							title='Delete environment'
						>
							<Trash2 className='h-3.5 w-3.5' />
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className='flex flex-col gap-2.5 flex-1'>
				<div className='flex items-start gap-2 text-sm'>
					<Server className='h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground' />
					<div>
						<p className='font-medium leading-none'>{env.server.name}</p>
						<p className='text-xs text-muted-foreground mt-0.5'>
							{env.server.ip_address}
						</p>
					</div>
				</div>

				<div className='flex items-center gap-2 text-sm'>
					<Globe className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
					<a
						href={env.url}
						target='_blank'
						rel='noopener noreferrer'
						className='text-primary hover:underline truncate flex items-center gap-1'
					>
						{env.url}
						<ExternalLink className='h-3 w-3 shrink-0' />
					</a>
				</div>

				<div className='flex items-center gap-2 text-sm'>
					<FolderOpen className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
					<code className='text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-full'>
						{env.root_path}
					</code>
				</div>

				{env.backup_path && (
					<div className='flex items-center gap-2 text-sm'>
						<HardDrive className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
						<code className='text-xs bg-muted px-1.5 py-0.5 rounded truncate max-w-full'>
							{env.backup_path}
						</code>
					</div>
				)}

				<DbCredentialsSection projectId={projectId} envId={env.id} />

				<WpUsersSection projectId={projectId} envId={env.id} />

				{/* Tags */}
				{((env.environment_tags && env.environment_tags.length > 0) ||
					allTags.length > 0) && (
					<div className='flex flex-wrap items-center gap-1.5 pt-1'>
						{(env.environment_tags ?? []).map(et => (
							<span
								key={et.tag.id}
								className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border'
								style={
									et.tag.color
										? { borderColor: et.tag.color, color: et.tag.color }
										: undefined
								}
							>
								{et.tag.name}
								<button
									type='button'
									onClick={() => removeTagMutation.mutate(et.tag.id)}
									className='hover:opacity-70 transition-opacity leading-none'
									aria-label={`Remove tag ${et.tag.name}`}
								>
									<X className='h-2.5 w-2.5' />
								</button>
							</span>
						))}
						{availableToAdd.length > 0 &&
							(showAddTag ? (
								<Select
									onValueChange={v => {
										addTagMutation.mutate(Number(v));
									}}
								>
									<SelectTrigger className='h-6 text-xs w-32'>
										<SelectValue placeholder='Add tag…' />
									</SelectTrigger>
									<SelectContent>
										{availableToAdd.map(t => (
											<SelectItem key={t.id} value={String(t.id)}>
												{t.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							) : (
								<button
									type='button'
									onClick={() => setShowAddTag(true)}
									className='inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-full px-2 py-0.5 transition-colors'
								>
									<Plus className='h-2.5 w-2.5' />
									Tag
								</button>
							))}
					</div>
				)}

				<div className='flex items-center gap-1.5 pt-2 mt-auto border-t'>
					<Button
						variant='secondary'
						size='sm'
						className='flex-1 text-xs h-7'
						onClick={triggerBackup}
						title='Create a full backup of this environment'
					>
						<HardDrive className='h-3 w-3 mr-1' />
						Backup
					</Button>
					<Button
						variant='secondary'
						size='sm'
						className='flex-1 text-xs h-7'
						onClick={triggerScan}
						title='Scan WordPress plugins'
					>
						<ScanLine className='h-3 w-3 mr-1' />
						Scan
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

// ── Scanned site shape from POST /projects/:id/environments/scan-server ───────

interface ScannedSite {
	path: string;
	name: string;
	isBedrock: boolean;
	isWordPress: boolean;
	siteUrl?: string;
	alreadyInThisProject: boolean;
	serverId: number;
	serverName: string;
	hasDbCredentials?: boolean;
	dbCredentials?: {
		dbName: string;
		dbUser: string;
		dbPassword: string;
		dbHost: string;
	};
}

// ── Add Environment Wizard ─────────────────────────────────────────────────────

function AddEnvironmentWizard({
	open,
	onOpenChange,
	projectId,
	servers,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	projectId: number;
	servers: ServerOption[];
	onSuccess: () => void;
}) {
	const [step, setStep] = useState<1 | 2>(1);
	const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
	const [sites, setSites] = useState<ScannedSite[]>([]);
	const [selectedSite, setSelectedSite] = useState<ScannedSite | null>(null);
	const [envType, setEnvType] = useState<EnvTypeValue>('production');
	const [customUrl, setCustomUrl] = useState('');
	const [isCreating, setIsCreating] = useState(false);

	const scanMutation = useMutation({
		mutationFn: (serverId: number) =>
			api.post<ScannedSite[]>(
				`/projects/${projectId}/environments/scan-server`,
				{ server_id: serverId },
			),
		onSuccess: data => {
			setSites(Array.isArray(data) ? data : []);
			setStep(2);
		},
		onError: () => toast({ title: 'Scan failed', variant: 'destructive' }),
	});

	function reset() {
		setStep(1);
		setSelectedServerId(null);
		setSites([]);
		setSelectedSite(null);
		setEnvType('production');
		setCustomUrl('');
	}

	function handleClose(o: boolean) {
		if (!o) reset();
		onOpenChange(o);
	}

	async function handleCreate() {
		if (!selectedSite || !selectedServerId) return;
		const url = customUrl.trim() || selectedSite.siteUrl || '';
		if (!url) {
			toast({ title: 'Site URL is required', variant: 'destructive' });
			return;
		}
		setIsCreating(true);
		try {
			await api.post(`/projects/${projectId}/environments`, {
				type: envType,
				server_id: selectedServerId,
				url,
				root_path: selectedSite.path,
				...(selectedSite.dbCredentials
					? { db_credentials: selectedSite.dbCredentials }
					: {}),
			});
			toast({ title: 'Environment created' });
			onSuccess();
			handleClose(false);
		} catch {
			toast({ title: 'Create failed', variant: 'destructive' });
		} finally {
			setIsCreating(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className='sm:max-w-lg'>
				<DialogHeader>
					<DialogTitle>Add Environment</DialogTitle>
				</DialogHeader>

				{step === 1 ? (
					<div className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							Select a server to scan for WordPress installations.
						</p>
						<div className='space-y-1'>
							<Label>Server</Label>
							<Select
								value={selectedServerId?.toString()}
								onValueChange={v => setSelectedServerId(Number(v))}
							>
								<SelectTrigger>
									<SelectValue placeholder='Select server…' />
								</SelectTrigger>
								<SelectContent>
									{servers.map(s => (
										<SelectItem key={s.id} value={s.id.toString()}>
											{s.name}{' '}
											<span className='text-muted-foreground text-xs'>
												({s.ip_address})
											</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<DialogFooter>
							<Button
								type='button'
								variant='outline'
								onClick={() => handleClose(false)}
							>
								Cancel
							</Button>
							<Button
								disabled={!selectedServerId || scanMutation.isPending}
								onClick={() =>
									selectedServerId && scanMutation.mutate(selectedServerId)
								}
							>
								{scanMutation.isPending ? (
									<>
										<Loader2 className='h-4 w-4 mr-1.5 animate-spin' />
										Scanning…
									</>
								) : (
									<>
										<ScanLine className='h-4 w-4 mr-1.5' />
										Scan Server
									</>
								)}
							</Button>
						</DialogFooter>
					</div>
				) : (
					<div className='space-y-4'>
						<p className='text-sm text-muted-foreground'>
							{sites.length === 0
								? 'No WordPress sites found on this server.'
								: `Found ${sites.length} site${sites.length !== 1 ? 's' : ''}. Select one to add as an environment.`}
						</p>

						{sites.length > 0 && (
							<div className='border rounded-lg divide-y max-h-64 overflow-y-auto'>
								{sites.map(site => (
									<button
										key={site.path}
										type='button'
										disabled={site.alreadyInThisProject}
										onClick={() => {
											setSelectedSite(site);
											setCustomUrl(site.siteUrl ?? '');
										}}
										className={[
											'w-full text-left px-3 py-2.5 transition-colors flex items-start gap-2',
											site.alreadyInThisProject
												? 'opacity-50 cursor-not-allowed'
												: 'hover:bg-muted/50 cursor-pointer',
											selectedSite?.path === site.path &&
											!site.alreadyInThisProject
												? 'bg-primary/10'
												: '',
										].join(' ')}
									>
										<div className='mt-0.5 shrink-0'>
											{site.alreadyInThisProject ? (
												<CheckCircle2 className='h-4 w-4 text-green-500' />
											) : selectedSite?.path === site.path ? (
												<CheckCircle2 className='h-4 w-4 text-primary' />
											) : (
												<CircleDashed className='h-4 w-4 text-muted-foreground' />
											)}
										</div>
										<div className='min-w-0'>
											<p className='font-medium text-sm truncate'>
												{site.name}
											</p>
											<p className='text-xs text-muted-foreground font-mono truncate'>
												{site.path}
											</p>
											{site.siteUrl && (
												<p className='text-xs text-muted-foreground truncate'>
													{site.siteUrl}
												</p>
											)}
											{site.alreadyInThisProject && (
												<p className='text-xs text-green-600 dark:text-green-400'>
													Already in this project
												</p>
											)}
										</div>
									</button>
								))}
							</div>
						)}

						{selectedSite && (
							<div className='space-y-3 border-t pt-3'>
								<div className='grid grid-cols-2 gap-3'>
									<div className='space-y-1'>
										<Label>Environment Type *</Label>
										<Select
											value={envType}
											onValueChange={v => setEnvType(v as EnvTypeValue)}
										>
											<SelectTrigger>
												<SelectValue placeholder='Select type…' />
											</SelectTrigger>
											<SelectContent>
												{ENV_TYPES.map(t => (
													<SelectItem key={t.value} value={t.value}>
														{t.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className='space-y-1'>
										<Label>Site URL *</Label>
										<Input
											value={customUrl}
											onChange={e => setCustomUrl(e.target.value)}
											placeholder='https://example.com'
										/>
									</div>
								</div>
							</div>
						)}

						<DialogFooter>
							<Button
								type='button'
								variant='outline'
								onClick={() => setStep(1)}
							>
								Back
							</Button>
							<Button
								disabled={!selectedSite || !envType || isCreating}
								onClick={handleCreate}
							>
								{isCreating ? (
									<>
										<Loader2 className='h-4 w-4 mr-1.5 animate-spin' />
										Creating…
									</>
								) : (
									'Create Environment'
								)}
							</Button>
						</DialogFooter>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

export function EnvironmentsTab({ projectId }: { projectId: number }) {
	const qc = useQueryClient();
	const [createOpen, setCreateOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<Environment | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<Environment | null>(null);

	const { data: environments = [], isLoading } = useQuery({
		queryKey: ['environments', projectId],
		queryFn: async () => {
			type ApiEnv = Omit<Environment, 'latestProvisioningJob'> & {
				job_executions: Array<{
					id: number;
					status: string;
					progress: number | null;
					last_error: string | null;
				}>;
			};
			const items = await api.get<ApiEnv[]>(
				`/projects/${projectId}/environments`,
			);
			return items.map(e => ({
				...e,
				latestProvisioningJob: e.job_executions?.[0] ?? null,
			})) satisfies Environment[];
		},
		refetchInterval: query => {
			const data = query.state.data;
			const hasActive = data?.some(
				e =>
					e.latestProvisioningJob?.status === 'queued' ||
					e.latestProvisioningJob?.status === 'active',
			);
			return hasActive ? 5000 : false;
		},
	});

	const { data: serversData } = useQuery({
		queryKey: ['servers-list'],
		queryFn: () =>
			api
				.get<{ items: ServerOption[] }>('/servers?limit=100')
				.then(r => r.items),
	});
	const servers = serversData ?? [];

	const deleteMutation = useMutation({
		mutationFn: (id: number) =>
			api.delete(`/projects/${projectId}/environments/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['environments', projectId] });
			qc.invalidateQueries({ queryKey: ['project', projectId] });
			setDeleteTarget(null);
			toast({ title: 'Environment deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	function invalidate() {
		qc.invalidateQueries({ queryKey: ['environments', projectId] });
		qc.invalidateQueries({ queryKey: ['project', projectId] });
	}

	if (isLoading) {
		return (
			<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
				{[1, 2].map(i => (
					<Skeleton key={i} className='h-56 rounded-lg' />
				))}
			</div>
		);
	}

	return (
		<div className='space-y-4'>
			<div className='flex items-center justify-between'>
				<p className='text-sm text-muted-foreground'>
					{environments.length} environment
					{environments.length !== 1 ? 's' : ''} configured
				</p>
				<Button size='sm' onClick={() => setCreateOpen(true)}>
					<Plus className='h-4 w-4 mr-1.5' />
					Add Environment
				</Button>
			</div>

			{environments.length === 0 ? (
				<div className='border rounded-lg p-12 text-center'>
					<MonitorSmartphone className='h-10 w-10 mx-auto text-muted-foreground/40 mb-3' />
					<p className='font-medium text-muted-foreground'>
						No environments yet
					</p>
					<p className='text-sm text-muted-foreground mt-1'>
						Add a production or staging environment to get started
					</p>
					<Button
						className='mt-4'
						size='sm'
						onClick={() => setCreateOpen(true)}
					>
						<Plus className='h-4 w-4 mr-1.5' />
						Add First Environment
					</Button>
				</div>
			) : (
				<div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'>
					{environments.map(env => (
						<EnvironmentCard
							key={env.id}
							env={env}
							projectId={projectId}
							onEdit={setEditTarget}
							onDelete={setDeleteTarget}
						/>
					))}
				</div>
			)}

			<AddEnvironmentWizard
				open={createOpen}
				onOpenChange={setCreateOpen}
				projectId={projectId}
				servers={servers}
				onSuccess={invalidate}
			/>

			{editTarget && (
				<EnvironmentFormDialog
					key={editTarget.id}
					open
					onOpenChange={o => !o && setEditTarget(null)}
					projectId={projectId}
					initial={editTarget}
					servers={servers}
					onSuccess={invalidate}
				/>
			)}

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title='Delete Environment'
				description={`Delete the "${deleteTarget?.type}" environment at ${deleteTarget?.url}? All associated backups, plugin scans, and monitor data will be permanently removed.`}
				confirmLabel='Delete'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}
