import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWebSocketEvent } from '@/lib/websocket';
import { WS_EVENTS } from '@bedrock-forge/shared';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
	Trash2,
	Pencil,
	Search,
	Shield,
	Globe,
	Type,
	ChevronLeft,
	ChevronRight,
	ChevronDown,
	ChevronUp,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertDialog } from '@/components/ui/alert-dialog';
import { PageHeader, DataTable, type Column } from '@/components/crud';
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

// Types

interface Environment {
	id: number;
	type: string;
	url: string;
	project: { name: string };
}

interface Monitor {
	id: number;
	enabled: boolean;
	interval_seconds: number;
	last_checked_at: string | null;
	last_status: number | null;
	last_response_ms: number | null;
	uptime_pct: number | string | null;
	check_ssl: boolean;
	ssl_expires_at: string | null;
	ssl_issuer: string | null;
	ssl_days_remaining: number | null;
	ssl_alert_days: number | null;
	check_dns: boolean;
	dns_resolves: boolean | null;
	check_keyword: boolean;
	keyword: string | null;
	keyword_found: boolean | null;
	environment: { id: number; url: string; type: string };
}

interface PaginatedMonitors {
	items: Monitor[];
	total: number;
}

const PAGE_LIMIT = 20;

const INTERVALS = [
	{ value: '30', label: '30 seconds' },
	{ value: '60', label: '1 minute' },
	{ value: '300', label: '5 minutes' },
	{ value: '600', label: '10 minutes' },
	{ value: '1800', label: '30 minutes' },
];

const monitorSchema = z
	.object({
		environment_id: z.coerce
			.number({ invalid_type_error: 'Environment is required' })
			.positive('Environment is required'),
		interval_seconds: z.coerce.number().default(60),
		check_ssl: z.boolean().default(false),
		ssl_alert_days: z.coerce
			.number()
			.int()
			.min(1)
			.max(365)
			.optional()
			.nullable(),
		check_dns: z.boolean().default(false),
		check_keyword: z.boolean().default(false),
		keyword: z.string().max(200).optional().nullable(),
	})
	.refine(d => !d.check_keyword || (d.keyword && d.keyword.trim().length > 0), {
		message: 'Keyword is required when keyword check is enabled',
		path: ['keyword'],
	});
type MonitorForm = z.infer<typeof monitorSchema>;

function isUp(status: number | null): boolean {
	return status !== null && status >= 200 && status < 300;
}

function StatusDot({ status }: { status: number | null }) {
	if (status === null)
		return <span className='inline-block w-2 h-2 rounded-full bg-muted' />;
	return (
		<span
			className={`inline-block w-2 h-2 rounded-full ${
				isUp(status) ? 'bg-green-500' : 'bg-red-500'
			}`}
		/>
	);
}

function SslBadge({ monitor }: { monitor: Monitor }) {
	if (!monitor.check_ssl) return null;
	const days = monitor.ssl_days_remaining;
	if (days === null)
		return (
			<span title='SSL check pending'>
				<Shield className='h-3 w-3 text-muted-foreground' />
			</span>
		);
	const color =
		days <= 7
			? 'text-red-500'
			: days <= 30
				? 'text-yellow-500'
				: 'text-green-500';
	return (
		<span
			title={`SSL: ${days}d remaining${monitor.ssl_issuer ? ' · ' + monitor.ssl_issuer : ''}`}
			className={`flex items-center gap-0.5 text-[10px] font-medium ${color}`}
		>
			<Shield className='h-3 w-3' />
			{days}d
		</span>
	);
}

function DnsBadge({ monitor }: { monitor: Monitor }) {
	if (!monitor.check_dns) return null;
	if (monitor.dns_resolves === null)
		return (
			<span title='DNS check pending'>
				<Globe className='h-3 w-3 text-muted-foreground' />
			</span>
		);
	return (
		<span title={`DNS: ${monitor.dns_resolves ? 'resolves' : 'FAILED'}`}>
			<Globe
				className={`h-3 w-3 ${monitor.dns_resolves ? 'text-green-500' : 'text-red-500'}`}
			/>
		</span>
	);
}

function KeywordBadge({ monitor }: { monitor: Monitor }) {
	if (!monitor.check_keyword || !monitor.keyword) return null;
	if (monitor.keyword_found === null)
		return (
			<span title='Keyword check pending'>
				<Type className='h-3 w-3 text-muted-foreground' />
			</span>
		);
	return (
		<span
			title={`Keyword "${monitor.keyword}": ${monitor.keyword_found ? 'found' : 'NOT FOUND'}`}
		>
			<Type
				className={`h-3 w-3 ${monitor.keyword_found ? 'text-green-500' : 'text-red-500'}`}
			/>
		</span>
	);
}

function AdvancedChecksSection({
	values,
	onChange,
}: {
	values: Partial<MonitorForm>;
	onChange: (field: keyof MonitorForm, value: unknown) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className='border rounded-md overflow-hidden'>
			<button
				type='button'
				onClick={() => setOpen(o => !o)}
				className='w-full flex items-center justify-between px-3 py-2 text-xs font-medium bg-muted/50 hover:bg-muted transition-colors'
			>
				<span>Advanced checks</span>
				{open ? (
					<ChevronUp className='h-3.5 w-3.5 text-muted-foreground' />
				) : (
					<ChevronDown className='h-3.5 w-3.5 text-muted-foreground' />
				)}
			</button>
			{open && (
				<div className='px-3 py-3 space-y-4 text-sm'>
					<div className='space-y-2'>
						<div className='flex items-center justify-between'>
							<Label className='flex items-center gap-1.5'>
								<Shield className='h-3.5 w-3.5' />
								SSL certificate check
							</Label>
							<Switch
								checked={!!values.check_ssl}
								onCheckedChange={v => onChange('check_ssl', v)}
							/>
						</div>
						{values.check_ssl && (
							<div className='ml-5 space-y-1'>
								<Label className='text-xs text-muted-foreground'>
									Alert when expiring within (days) — leave blank to disable
								</Label>
								<Input
									type='number'
									min={1}
									max={365}
									placeholder='e.g. 30'
									className='h-7 text-xs w-32'
									value={values.ssl_alert_days ?? ''}
									onChange={e =>
										onChange(
											'ssl_alert_days',
											e.target.value === '' ? null : Number(e.target.value),
										)
									}
								/>
							</div>
						)}
					</div>
					<div className='flex items-center justify-between'>
						<Label className='flex items-center gap-1.5'>
							<Globe className='h-3.5 w-3.5' />
							DNS resolution check
						</Label>
						<Switch
							checked={!!values.check_dns}
							onCheckedChange={v => onChange('check_dns', v)}
						/>
					</div>
					<div className='space-y-2'>
						<div className='flex items-center justify-between'>
							<Label className='flex items-center gap-1.5'>
								<Type className='h-3.5 w-3.5' />
								Content keyword check
							</Label>
							<Switch
								checked={!!values.check_keyword}
								onCheckedChange={v => onChange('check_keyword', v)}
							/>
						</div>
						{values.check_keyword && (
							<div className='ml-5'>
								<Input
									placeholder='Keyword to search in page body…'
									className='h-7 text-xs'
									value={values.keyword ?? ''}
									onChange={e => onChange('keyword', e.target.value)}
								/>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function CreateMonitorDialog({
	open,
	onOpenChange,
	environments,
	onSuccess,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	environments: Environment[];
	onSuccess: () => void;
}) {
	const {
		handleSubmit,
		setValue,
		watch,
		reset,
		formState: { errors, isSubmitting },
	} = useForm<MonitorForm>({
		resolver: zodResolver(monitorSchema),
		defaultValues: {
			interval_seconds: 60,
			check_ssl: false,
			check_dns: false,
			check_keyword: false,
		},
	});
	const watchedValues = watch();

	async function onSubmit(data: MonitorForm) {
		try {
			await api.post('/monitors', data);
			toast({ title: 'Monitor created' });
			reset();
			onSuccess();
			onOpenChange(false);
		} catch {
			toast({ title: 'Create failed', variant: 'destructive' });
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>New Monitor</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
					<div className='space-y-1'>
						<Label>Environment *</Label>
						<Select onValueChange={v => setValue('environment_id', Number(v))}>
							<SelectTrigger>
								<SelectValue placeholder='Select environment…' />
							</SelectTrigger>
							<SelectContent>
								{environments.map(e => (
									<SelectItem key={e.id} value={e.id.toString()}>
										{e.project.name} — {e.url}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{errors.environment_id && (
							<p className='text-xs text-destructive'>
								{errors.environment_id.message}
							</p>
						)}
					</div>
					<div className='space-y-1'>
						<Label>Check interval</Label>
						<Select
							defaultValue='60'
							onValueChange={v => setValue('interval_seconds', Number(v))}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{INTERVALS.map(i => (
									<SelectItem key={i.value} value={i.value}>
										{i.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<AdvancedChecksSection
						values={watchedValues}
						onChange={(field, value) =>
							setValue(field as keyof MonitorForm, value as never)
						}
					/>
					{errors.keyword && (
						<p className='text-xs text-destructive'>{errors.keyword.message}</p>
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
							{isSubmitting ? 'Creating…' : 'Create'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function EditMonitorDialog({
	monitor,
	onOpenChange,
	onSave,
}: {
	monitor: Monitor | null;
	onOpenChange: (o: boolean) => void;
	onSave: (id: number, data: Partial<MonitorForm>) => void;
}) {
	const [interval, setInterval] = useState(
		String(monitor?.interval_seconds ?? 60),
	);
	const [checkSsl, setCheckSsl] = useState(monitor?.check_ssl ?? false);
	const [sslAlertDays, setSslAlertDays] = useState<number | null>(
		monitor?.ssl_alert_days ?? null,
	);
	const [checkDns, setCheckDns] = useState(monitor?.check_dns ?? false);
	const [checkKeyword, setCheckKeyword] = useState(
		monitor?.check_keyword ?? false,
	);
	const [keyword, setKeyword] = useState(monitor?.keyword ?? '');
	if (!monitor) return null;
	return (
		<Dialog open={!!monitor} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Edit Monitor</DialogTitle>
				</DialogHeader>
				<div className='space-y-4'>
					<div className='space-y-1'>
						<Label>URL</Label>
						<p className='text-sm font-mono text-muted-foreground truncate'>
							{monitor.environment.url}
						</p>
					</div>
					<div className='space-y-1'>
						<Label>Check interval</Label>
						<Select value={interval} onValueChange={setInterval}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{INTERVALS.map(i => (
									<SelectItem key={i.value} value={i.value}>
										{i.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<AdvancedChecksSection
						values={{
							check_ssl: checkSsl,
							ssl_alert_days: sslAlertDays,
							check_dns: checkDns,
							check_keyword: checkKeyword,
							keyword,
						}}
						onChange={(field, value) => {
							if (field === 'check_ssl') setCheckSsl(value as boolean);
							else if (field === 'ssl_alert_days')
								setSslAlertDays(value as number | null);
							else if (field === 'check_dns') setCheckDns(value as boolean);
							else if (field === 'check_keyword')
								setCheckKeyword(value as boolean);
							else if (field === 'keyword') setKeyword(value as string);
						}}
					/>
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button
						onClick={() =>
							onSave(monitor.id, {
								interval_seconds: Number(interval),
								check_ssl: checkSsl,
								ssl_alert_days: sslAlertDays,
								check_dns: checkDns,
								check_keyword: checkKeyword,
								keyword: keyword || null,
							})
						}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function Pagination({
	page,
	total,
	limit,
	onPage,
}: {
	page: number;
	total: number;
	limit: number;
	onPage: (p: number) => void;
}) {
	const totalPages = Math.max(1, Math.ceil(total / limit));
	if (totalPages <= 1) return null;
	return (
		<div className='flex items-center justify-between text-sm text-muted-foreground'>
			<span>
				{(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
			</span>
			<div className='flex items-center gap-1'>
				<Button
					variant='ghost'
					size='icon'
					className='h-7 w-7'
					disabled={page <= 1}
					onClick={() => onPage(page - 1)}
				>
					<ChevronLeft className='h-4 w-4' />
				</Button>
				<span className='px-2 text-xs font-medium'>
					{page} / {totalPages}
				</span>
				<Button
					variant='ghost'
					size='icon'
					className='h-7 w-7'
					disabled={page >= totalPages}
					onClick={() => onPage(page + 1)}
				>
					<ChevronRight className='h-4 w-4' />
				</Button>
			</div>
		</div>
	);
}

export function MonitorsPage() {
	const qc = useQueryClient();
	const navigate = useNavigate();
	const [page, setPage] = useState(1);
	const [search, setSearch] = useState('');
	const [searchInput, setSearchInput] = useState('');
	const [createOpen, setCreateOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<Monitor | null>(null);
	const [editTarget, setEditTarget] = useState<Monitor | null>(null);

	const { data, isLoading } = useQuery({
		queryKey: ['monitors', page, search],
		queryFn: () => {
			const params = new URLSearchParams({
				page: String(page),
				limit: String(PAGE_LIMIT),
			});
			if (search) params.set('search', search);
			return api.get<PaginatedMonitors>(`/monitors?${params.toString()}`);
		},
		refetchInterval: 30_000,
	});

	const { data: environments = [] } = useQuery({
		queryKey: ['environments-all'],
		queryFn: () => api.get<Environment[]>('/environments'),
	});

	useWebSocketEvent(WS_EVENTS.MONITOR_RESULT, () => {
		qc.invalidateQueries({ queryKey: ['monitors'] });
	});

	const toggle = useMutation({
		mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
			enabled
				? api.put(`/monitors/${id}/deactivate`, {})
				: api.put(`/monitors/${id}/activate`, {}),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['monitors'] }),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => api.delete(`/monitors/${id}`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['monitors'] });
			setDeleteTarget(null);
			toast({ title: 'Monitor deleted' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	const editMutation = useMutation({
		mutationFn: ({ id, ...rest }: { id: number } & Partial<MonitorForm>) =>
			api.put(`/monitors/${id}`, rest),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['monitors'] });
			setEditTarget(null);
			toast({ title: 'Monitor updated' });
		},
		onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
	});

	const columns: Column<Monitor>[] = [
		{
			header: 'Status',
			render: m => (
				<div className='flex items-center gap-2'>
					<button
						type='button'
						className='flex items-center gap-1.5'
						onClick={() => navigate(`/monitors/${m.id}`)}
					>
						<StatusDot status={m.last_status} />
						<span
							className={`text-xs font-medium ${m.last_status === null ? 'text-muted-foreground' : isUp(m.last_status) ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
						>
							{m.last_status ?? 'pending'}
						</span>
					</button>
					<div className='flex items-center gap-1'>
						<SslBadge monitor={m} />
						<DnsBadge monitor={m} />
						<KeywordBadge monitor={m} />
					</div>
				</div>
			),
		},
		{
			header: 'URL',
			render: m => (
				<button
					type='button'
					className='font-mono text-xs text-primary underline truncate max-w-[200px] block text-left'
					onClick={() => navigate(`/monitors/${m.id}`)}
				>
					{m.environment.url}
				</button>
			),
		},
		{
			header: 'Type',
			render: m => (
				<span className='capitalize'>{m.environment.type.toLowerCase()}</span>
			),
		},
		{ header: 'Interval', render: m => <span>{m.interval_seconds}s</span> },
		{
			header: 'Uptime',
			render: m => {
				const pct = parseFloat(String(m.uptime_pct ?? 0));
				return (
					<span
						className={`font-mono ${pct >= 99 ? 'text-green-600 dark:text-green-400' : pct >= 95 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}
					>
						{pct.toFixed(2)}%
					</span>
				);
			},
		},
		{
			header: 'Last Check',
			render: m => (
				<span className='text-muted-foreground text-xs'>
					{m.last_checked_at
						? new Date(m.last_checked_at).toLocaleString()
						: '—'}
				</span>
			),
		},
		{
			header: 'Active',
			render: m => (
				<button
					onClick={() => toggle.mutate({ id: m.id, enabled: m.enabled })}
					disabled={toggle.isPending}
					className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${m.enabled ? 'bg-primary' : 'bg-muted'}`}
				>
					<span
						className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${m.enabled ? 'translate-x-4' : 'translate-x-1'}`}
					/>
				</button>
			),
		},
	];

	return (
		<div className='space-y-4'>
			<PageHeader
				title='Monitors'
				onCreate={() => setCreateOpen(true)}
				createLabel='New Monitor'
			/>

			<div className='flex items-center gap-2 max-w-sm'>
				<div className='relative flex-1'>
					<Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground' />
					<Input
						className='pl-8 h-8 text-sm'
						placeholder='Search by URL…'
						value={searchInput}
						onChange={e => setSearchInput(e.target.value)}
						onKeyDown={e => {
							if (e.key === 'Enter') {
								setPage(1);
								setSearch(searchInput.trim());
							}
						}}
					/>
				</div>
				<Button
					size='sm'
					variant='outline'
					className='h-8'
					onClick={() => {
						setPage(1);
						setSearch(searchInput.trim());
					}}
				>
					Search
				</Button>
				{search && (
					<Button
						size='sm'
						variant='ghost'
						className='h-8'
						onClick={() => {
							setSearch('');
							setSearchInput('');
							setPage(1);
						}}
					>
						Clear
					</Button>
				)}
			</div>

			<DataTable
				columns={columns}
				data={data?.items ?? []}
				isLoading={isLoading}
				rowKey={m => m.id}
				emptyMessage='No monitors yet.'
				renderActions={m => (
					<div className='flex items-center gap-1'>
						<Button
							variant='ghost'
							size='icon'
							className='h-7 w-7 text-muted-foreground hover:text-foreground'
							onClick={() => setEditTarget(m)}
							title='Edit monitor'
						>
							<Pencil className='h-4 w-4' />
						</Button>
						<Button
							variant='ghost'
							size='icon'
							className='h-7 w-7 text-destructive hover:text-destructive'
							onClick={() => setDeleteTarget(m)}
						>
							<Trash2 className='h-4 w-4' />
						</Button>
					</div>
				)}
			/>

			<Pagination
				page={page}
				total={data?.total ?? 0}
				limit={PAGE_LIMIT}
				onPage={setPage}
			/>

			<CreateMonitorDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				environments={environments}
				onSuccess={() => qc.invalidateQueries({ queryKey: ['monitors'] })}
			/>

			<EditMonitorDialog
				monitor={editTarget}
				onOpenChange={o => !o && setEditTarget(null)}
				onSave={(id, data) => editMutation.mutate({ id, ...data })}
			/>

			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={o => !o && setDeleteTarget(null)}
				title='Delete Monitor'
				description={`The monitor for "${deleteTarget?.environment.url}" will be permanently deleted.`}
				confirmLabel='Delete'
				onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
				isPending={deleteMutation.isPending}
			/>
		</div>
	);
}
