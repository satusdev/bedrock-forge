import { useState, useRef, useEffect, FormEvent, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	ScanLine,
	RefreshCw,
	ArrowUpCircle,
	CheckCircle2,
	ExternalLink,
	Loader2,
	Plus,
	Trash2,
	RotateCcw,
	Package,
	Pencil,
	Code2,
	Calendar,
	Clock,
	GitBranch,
	Search,
	ChevronDown,
	ChevronUp,
	Terminal,
	XCircle,
	X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkActionsBar } from '@/components/ui/bulk-actions-bar';
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
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useWebSocketEvent, useSubscribeEnvironment } from '@/lib/websocket';
import { ExecutionLogPanel } from '@/components/ui/execution-log-panel';

interface Environment {
	id: number;
	type: string;
	server: { name: string };
}

interface Plugin {
	slug: string;
	name: string;
	version: string;
	latest_version: string | null;
	update_available: boolean;
	author: string | null;
	plugin_uri: string | null;
	description: string | null;
	managed_by_composer: boolean;
	composer_constraint: string | null;
	is_mu_plugin?: boolean;
	managed_by_monorepo?: boolean;
	monorepo_repo_url?: string | null;
	status?: 'active' | 'inactive';
}

interface PluginScanOutput {
	is_bedrock: boolean;
	plugins: Plugin[];
}

interface PluginScan {
	id: number;
	plugins: PluginScanOutput | Plugin[];
	scanned_at: string;
}

interface CustomPlugin {
	id: number;
	name: string;
	slug: string;
	description: string | null;
	repo_url: string;
	repo_path: string;
	type: string;
}

interface EnvironmentCustomPlugin {
	id: number;
	custom_plugin_id: number;
	installed_version: string | null;
	latest_version: string | null;
	version_checked_at: string | null;
	created_at: string;
	custom_plugin: CustomPlugin;
}

interface JobExecutionLogStatus {
	id: number;
	status: 'queued' | 'active' | 'completed' | 'failed' | 'dead_letter' | string;
	execution_log: Array<{ step: string; detail?: string }> | null;
	last_error?: string | null;
	completed_at?: string | null;
}

function parseScanPlugins(scan: PluginScan | undefined): {
	isBedrock: boolean;
	plugins: Plugin[];
	muPlugins: Plugin[];
} {
	if (!scan) return { isBedrock: false, plugins: [], muPlugins: [] };
	if (Array.isArray(scan.plugins)) {
		return {
			isBedrock: false,
			plugins: scan.plugins as Plugin[],
			muPlugins: [],
		};
	}
	const output = scan.plugins as PluginScanOutput;
	const all = Array.isArray(output.plugins) ? output.plugins : [];
	return {
		isBedrock: output.is_bedrock ?? false,
		plugins: all.filter(p => !p.is_mu_plugin),
		muPlugins: all.filter(p => !!p.is_mu_plugin),
	};
}

function AddPluginDialog({
	envId,
	open,
	onClose,
	isBedrock,
	onJobQueued,
}: {
	envId: number;
	open: boolean;
	onClose: () => void;
	isBedrock: boolean;
	onJobQueued?: (data: { jobExecutionId?: number; bullJobId?: string }) => void;
}) {
	const qc = useQueryClient();
	const [slug, setSlug] = useState('');
	const [version, setVersion] = useState('');
	const [skipSafetyBackup, setSkipSafetyBackup] = useState(true);
	const [workflow, setWorkflow] = useState<'composer' | 'manual'>('composer');

	const [searchQuery, setSearchQuery] = useState('');
	const [searchResults, setSearchResults] = useState<any[]>([]);
	const [isSearching, setIsSearching] = useState(false);

	useEffect(() => {
		if (!searchQuery.trim()) {
			setSearchResults([]);
			return;
		}
		const delay = setTimeout(() => {
			setIsSearching(true);
			api.get<any[]>(`/plugin-scans/search-wp-org?query=${encodeURIComponent(searchQuery)}`)
				.then(res => {
					setSearchResults(res || []);
				})
				.catch(() => {
					setSearchResults([]);
				})
				.finally(() => {
					setIsSearching(false);
				});
		}, 400);
		return () => clearTimeout(delay);
	}, [searchQuery]);

	const mutation = useMutation({
		mutationFn: () =>
			api.post<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${envId}/plugins`,
				{
					slug: slug.trim(),
					version: version.trim() || undefined,
					workflow: isBedrock ? workflow : 'manual',
					skipSafetyBackup
				},
			),
		onSuccess: (data) => {
			toast({
				title: 'Plugin install queued',
				description: isBedrock && workflow === 'composer'
					? `wpackagist-plugin/${slug} will be added via composer.`
					: `${slug} will be installed via WP-CLI.`,
			});
			qc.invalidateQueries({ queryKey: ['plugin-scans', envId] });
			if (onJobQueued) {
				onJobQueued(data);
			}
			setSlug('');
			setVersion('');
			setSearchQuery('');
			setWorkflow('composer');
			setSkipSafetyBackup(true);
			onClose();
		},
		onError: () =>
			toast({ title: 'Failed to queue install', variant: 'destructive' }),
	});

	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!slug.trim()) return;
		mutation.mutate();
	}

	return (
		<Dialog open={open} onOpenChange={v => !v && onClose()}>
			<DialogContent className='sm:max-w-lg max-h-[90vh] flex flex-col'>
				<DialogHeader>
					<DialogTitle>Add New Plugin</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className='space-y-4 py-2 overflow-y-auto flex-1 pr-1'>
					{/* Search field */}
					<div className='space-y-1.5'>
						<label className='text-xs font-semibold uppercase tracking-wider text-muted-foreground'>
							Search WordPress.org
						</label>
						<div className='relative'>
							<Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
							<Input
								placeholder='Search plugins (e.g. contact form, seo)...'
								className='pl-9'
								value={searchQuery}
								onChange={e => setSearchQuery(e.target.value)}
								disabled={mutation.isPending}
							/>
						</div>
						{isSearching && (
							<div className='flex items-center gap-2 text-xs text-muted-foreground pt-1.5 justify-center'>
								<Loader2 className='h-3 w-3 animate-spin' />
								Searching WordPress.org...
							</div>
						)}
						{searchResults.length > 0 && (
							<div className='border rounded-md divide-y max-h-48 overflow-y-auto bg-muted/10 mt-1.5'>
								{searchResults.map(p => (
									<div
										key={p.slug}
										className='p-2.5 flex items-start justify-between gap-4 hover:bg-muted/30 transition-colors text-xs'
									>
										<div className='space-y-0.5'>
											<span className='font-semibold text-foreground'>{p.name}</span>
											<span className='text-[10px] bg-muted px-1 py-0.5 rounded text-muted-foreground ml-1.5 font-mono'>{p.slug}</span>
											<p className='text-muted-foreground line-clamp-1 text-[11px]'>{p.description}</p>
											<p className='text-[10px] text-muted-foreground/80'>By {p.author}</p>
										</div>
										<Button
											type='button'
											size='sm'
											variant='outline'
											className='h-7 text-xs px-2 shrink-0'
											onClick={() => {
												setSlug(p.slug);
												setSearchQuery('');
												setSearchResults([]);
											}}
										>
											Select
										</Button>
									</div>
								))}
							</div>
						)}
					</div>

					<div className='border-t pt-3 space-y-4'>
						<div className='space-y-1.5'>
							<label className='text-sm font-medium'>Plugin Slug</label>
							<Input
								placeholder='e.g. woocommerce'
								value={slug}
								onChange={e => setSlug(e.target.value)}
								disabled={mutation.isPending}
								required
							/>
						</div>

						{isBedrock && (
							<div className='space-y-1.5'>
								<label className='text-sm font-medium'>Installation Workflow</label>
								<Select
									value={workflow}
									onValueChange={v => setWorkflow(v as 'composer' | 'manual')}
									disabled={mutation.isPending}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='composer'>Composer-managed (composer.json)</SelectItem>
										<SelectItem value='manual'>Manual installation (WP-CLI direct)</SelectItem>
									</SelectContent>
								</Select>
							</div>
						)}

						<div className='space-y-1.5'>
							<label className='text-sm font-medium'>
								Version constraint{' '}
								<span className='text-muted-foreground font-normal'>
									(optional)
								</span>
							</label>
							<Input
								placeholder={workflow === 'composer' ? 'e.g. ^8.0 or 8.1.2' : 'e.g. 8.1.2'}
								value={version}
								onChange={e => setVersion(e.target.value)}
								disabled={mutation.isPending}
							/>
						</div>

						<div className='flex items-center space-x-2 pt-2'>
							<Checkbox
								id='add-skip-backup'
								checked={skipSafetyBackup}
								onCheckedChange={(checked) => setSkipSafetyBackup(checked as boolean)}
								disabled={mutation.isPending}
							/>
							<label
								htmlFor='add-skip-backup'
								className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
							>
								Skip pre-flight safety backup
							</label>
						</div>
					</div>

					<DialogFooter className='border-t pt-3'>
						<Button
							type='button'
							variant='outline'
							onClick={onClose}
							disabled={mutation.isPending}
						>
							Cancel
						</Button>
						<Button type='submit' disabled={!slug.trim() || mutation.isPending}>
							{mutation.isPending ? (
								<Loader2 className='h-4 w-4 mr-1.5 animate-spin' />
							) : (
								<Plus className='h-4 w-4 mr-1.5' />
							)}
							Add Plugin
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ConfirmPluginActionDialog({
	open,
	onClose,
	onConfirm,
	title,
	description,
	isPending,
}: {
	open: boolean;
	onClose: () => void;
	onConfirm: (skipSafetyBackup: boolean) => void;
	title: string;
	description: string;
	isPending: boolean;
}) {
	const [skipSafetyBackup, setSkipSafetyBackup] = useState(true);

	return (
		<Dialog open={open} onOpenChange={v => !v && onClose()}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<div className='py-4 space-y-4'>
					<p className='text-sm text-muted-foreground'>{description}</p>
					<div className='flex items-center space-x-2'>
						<Checkbox
							id='action-skip-backup'
							checked={skipSafetyBackup}
							onCheckedChange={(checked) => setSkipSafetyBackup(checked as boolean)}
							disabled={isPending}
						/>
						<label
							htmlFor='action-skip-backup'
							className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
						>
							Skip pre-flight safety backup
						</label>
					</div>
				</div>
				<DialogFooter>
					<Button variant='outline' onClick={onClose} disabled={isPending}>
						Cancel
					</Button>
					<Button onClick={() => onConfirm(skipSafetyBackup)} disabled={isPending}>
						{isPending && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
						Confirm
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function EditConstraintDialog({
	plugin,
	onClose,
	onSave,
	isPending,
}: {
	plugin: Plugin;
	onClose: () => void;
	onSave: (slug: string, constraint: string) => void;
	isPending: boolean;
}) {
	const [value, setValue] = useState(plugin.composer_constraint ?? '');

	function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (value.trim()) onSave(plugin.slug, value.trim());
	}

	return (
		<Dialog open onOpenChange={o => !o && onClose()}>
			<DialogContent className='sm:max-w-sm'>
				<DialogHeader>
					<DialogTitle>Edit Constraint — {plugin.name}</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className='space-y-4 py-2'>
					<div className='space-y-1.5'>
						<label className='text-sm font-medium'>Version constraint</label>
						<Input
							value={value}
							onChange={e => setValue(e.target.value)}
							placeholder='e.g. ^8.0 or ^8.1.2'
							disabled={isPending}
							autoFocus
						/>
						<p className='text-xs text-muted-foreground'>
							Current:{' '}
							<code className='bg-muted px-1 rounded'>
								{plugin.composer_constraint ?? 'none'}
							</code>
						</p>
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
						<Button type='submit' disabled={!value.trim() || isPending}>
							{isPending ? (
								<Loader2 className='h-4 w-4 mr-1.5 animate-spin' />
							) : null}
							Update Constraint
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

interface PluginUpdateSchedule {
	id: number;
	enabled: boolean;
	frequency: 'daily' | 'weekly' | 'monthly';
	hour: number;
	minute: number;
	day_of_week: number | null;
	day_of_month: number | null;
	last_run_at: string | null;
}

function PluginUpdateScheduleCard({ envId }: { envId: number }) {
	const qc = useQueryClient();
	const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>(
		'daily',
	);
	const [enabled, setEnabled] = useState(true);
	const [hour, setHour] = useState(3);
	const [minute, setMinute] = useState(0);
	const [dayOfWeek, setDayOfWeek] = useState(1);
	const [dayOfMonth, setDayOfMonth] = useState(1);
	const [initialized, setInitialized] = useState(false);

	const { data: schedule, isLoading } = useQuery<PluginUpdateSchedule | null>({
		queryKey: ['plugin-update-schedule', envId],
		queryFn: () =>
			api
				.get<PluginUpdateSchedule>(
					`/environments/${envId}/plugin-update-schedule`,
				)
				.catch(() => null),
	});

	// Sync form from loaded schedule
	if (schedule && !initialized) {
		setEnabled(schedule.enabled);
		setFrequency(schedule.frequency);
		setHour(schedule.hour);
		setMinute(schedule.minute);
		if (schedule.day_of_week != null) setDayOfWeek(schedule.day_of_week);
		if (schedule.day_of_month != null) setDayOfMonth(schedule.day_of_month);
		setInitialized(true);
	}

	const saveMutation = useMutation({
		mutationFn: () =>
			api.put(`/environments/${envId}/plugin-update-schedule`, {
				enabled,
				frequency,
				hour,
				minute,
				day_of_week: frequency === 'weekly' ? dayOfWeek : undefined,
				day_of_month: frequency === 'monthly' ? dayOfMonth : undefined,
			}),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['plugin-update-schedule', envId] });
			toast({ title: 'Auto-update schedule saved' });
		},
		onError: () => toast({ title: 'Save failed', variant: 'destructive' }),
	});

	const deleteMutation = useMutation({
		mutationFn: () =>
			api.delete(`/environments/${envId}/plugin-update-schedule`),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['plugin-update-schedule', envId] });
			setInitialized(false);
			toast({ title: 'Schedule removed' });
		},
		onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
	});

	const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	return (
		<Card>
			<CardHeader className='pb-3'>
				<CardTitle className='text-sm flex items-center gap-2'>
					<Calendar className='h-4 w-4' />
					Auto-Update Schedule
				</CardTitle>
				<CardDescription className='text-xs'>
					Automatically run <code className='font-mono'>composer update</code>{' '}
					on a schedule.
					{schedule?.last_run_at && (
						<span className='ml-1'>
							Last run:{' '}
							<span className='font-medium text-foreground'>
								{new Date(schedule.last_run_at).toLocaleString()}
							</span>
						</span>
					)}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className='space-y-2'>
						<div className='h-8 bg-muted animate-pulse rounded' />
						<div className='h-8 bg-muted animate-pulse rounded w-3/4' />
					</div>
				) : (
					<div className='space-y-4'>
						{/* Enabled toggle */}
						<div className='flex items-center gap-3'>
							<button
								type='button'
								role='switch'
								aria-checked={enabled}
								onClick={() => setEnabled(v => !v)}
								className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
							>
								<span
									className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
								/>
							</button>
							<label className='text-sm font-medium'>
								{enabled ? 'Enabled' : 'Disabled'}
							</label>
						</div>

						<div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
							{/* Frequency */}
							<div className='space-y-1'>
								<label className='text-xs text-muted-foreground'>
									Frequency
								</label>
								<Select
									value={frequency}
									onValueChange={v => setFrequency(v as typeof frequency)}
								>
									<SelectTrigger className='h-8 text-sm'>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value='daily'>Daily</SelectItem>
										<SelectItem value='weekly'>Weekly</SelectItem>
										<SelectItem value='monthly'>Monthly</SelectItem>
									</SelectContent>
								</Select>
							</div>

							{/* Time */}
							<div className='space-y-1'>
								<label className='text-xs text-muted-foreground flex items-center gap-1'>
									<Clock className='h-3 w-3' /> Time (UTC)
								</label>
								<div className='flex items-center gap-1'>
									<Input
										type='number'
										min={0}
										max={23}
										value={hour}
										onChange={e => setHour(Number(e.target.value))}
										className='h-8 w-14 text-sm font-mono text-center p-1'
									/>
									<span className='text-muted-foreground text-sm'>:</span>
									<Input
										type='number'
										min={0}
										max={59}
										value={minute}
										onChange={e => setMinute(Number(e.target.value))}
										className='h-8 w-14 text-sm font-mono text-center p-1'
									/>
								</div>
							</div>

							{/* Day of week (weekly only) */}
							{frequency === 'weekly' && (
								<div className='space-y-1'>
									<label className='text-xs text-muted-foreground'>Day</label>
									<Select
										value={String(dayOfWeek)}
										onValueChange={v => setDayOfWeek(Number(v))}
									>
										<SelectTrigger className='h-8 text-sm'>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{DAY_NAMES.map((d, i) => (
												<SelectItem key={i} value={String(i)}>
													{d}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							)}

							{/* Day of month (monthly only) */}
							{frequency === 'monthly' && (
								<div className='space-y-1'>
									<label className='text-xs text-muted-foreground'>
										Day of month
									</label>
									<Input
										type='number'
										min={1}
										max={28}
										value={dayOfMonth}
										onChange={e => setDayOfMonth(Number(e.target.value))}
										className='h-8 w-14 text-sm font-mono text-center p-1'
									/>
								</div>
							)}
						</div>

						<div className='flex gap-2 pt-1'>
							<Button
								size='sm'
								onClick={() => saveMutation.mutate()}
								disabled={saveMutation.isPending}
								className='flex-1'
							>
								{saveMutation.isPending ? (
									<>
										<Loader2 className='h-3 w-3 mr-1.5 animate-spin' /> Saving…
									</>
								) : (
									'Save schedule'
								)}
							</Button>
							{schedule && (
								<Button
									size='sm'
									variant='destructive'
									onClick={() => deleteMutation.mutate()}
									disabled={deleteMutation.isPending}
								>
									{deleteMutation.isPending ? (
										<Loader2 className='h-3 w-3 animate-spin' />
									) : (
										<Trash2 className='h-3 w-3' />
									)}
								</Button>
							)}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export function PluginsTab({
	projectId,
	environments,
}: {
	projectId: number;
	environments: Environment[];
}) {
	const qc = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const envParam = searchParams.get('env');
	const initialEnvId = envParam ? Number(envParam) : null;
	const validInitialEnv = environments.find(e => e.id === initialEnvId)
		? initialEnvId
		: (environments[0]?.id ?? null);

	const [selectedEnvId, setSelectedEnvId] = useState<number | null>(validInitialEnv);

	useEffect(() => {
		if (selectedEnvId) {
			setSearchParams(prev => {
				const next = new URLSearchParams(prev);
				if (next.get('env') !== String(selectedEnvId)) {
					next.set('env', String(selectedEnvId));
				}
				return next;
			}, { replace: true });
		}
	}, [selectedEnvId, setSearchParams]);

	const [search, setSearch] = useState('');
	const [pluginFilter, setPluginFilter] = useState<
		'all' | 'wpackagist' | 'monorepo' | 'manual'
	>('all');
	const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
	const [updateFilter, setUpdateFilter] = useState<'all' | 'updates'>('all');
	const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
	const [expandedSlugs, setExpandedSlugs] = useState<Set<string>>(new Set());
	const [bulkProcessing, setBulkProcessing] = useState(false);
	const [bulkActionProgress, setBulkActionProgress] = useState('');

	useEffect(() => {
		setSelectedSlugs(new Set());
		setExpandedSlugs(new Set());
	}, [selectedEnvId, pluginFilter, statusFilter, updateFilter]);

	const [scanning, setScanning] = useState(false);
	const [managingJobId, setManagingJobId] = useState<string | null>(null);
	const [lastJobExecutionId, setLastJobExecutionId] = useState<number | null>(null);
	const [showLogPanel, setShowLogPanel] = useState<boolean>(false);
	const [lastJobStatus, setLastJobStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
	const [lastJobKind, setLastJobKind] = useState<'action' | 'scan'>('action');
	const [lastJobError, setLastJobError] = useState<string | null>(null);
	const [showAddDialog, setShowAddDialog] = useState(false);
	const [actionDialogState, setActionDialogState] = useState<{
		open: boolean;
		action: 'update' | 'remove' | 'updateAll' | 'activate' | 'deactivate' | 'migrate' | 'bulk-activate' | 'bulk-deactivate' | 'bulk-update' | 'bulk-remove' | null;
		slug: string | null;
	}>({ open: false, action: null, slug: null });
	const [editConstraintPlugin, setEditConstraintPlugin] =
		useState<Plugin | null>(null);
	const [composerViewOpen, setComposerViewOpen] = useState(false);
	const [composerReadLoading, setComposerReadLoading] = useState(false);
	const [composerReadData, setComposerReadData] = useState<Record<
		string,
		unknown
	> | null>(null);

	const scanningEnvIdRef = useRef<number | null>(null);
	const scanJobIdRef = useRef<string | null>(null);
	const scanStartedAtRef = useRef<number>(0);
	const managingJobIdRef = useRef<string | null>(null);
	const composerReadJobIdRef = useRef<string | null>(null);
	const composerReadExecIdRef = useRef<number | null>(null);
	const [customJobId, setCustomJobId] = useState<string | null>(null);
	const customJobIdRef = useRef<string | null>(null);

	useSubscribeEnvironment(selectedEnvId);

	const invalidatePluginState = (envId: number | null | undefined) => {
		if (!envId) return;
		qc.invalidateQueries({ queryKey: ['plugin-scans', envId] });
		qc.invalidateQueries({ queryKey: ['env-custom-plugins', envId] });
		qc.invalidateQueries({ queryKey: ['custom-plugins'] });
	};

	const waitForFollowUpScan = (
		envId: number | null | undefined,
		startedAtMs = Date.now(),
	) => {
		if (!envId) return;
		setScanning(true);
		scanningEnvIdRef.current = envId;
		scanJobIdRef.current = null;
		scanStartedAtRef.current = startedAtMs;
	};

	const completeTrackedAction = (
		envId: number | null | undefined,
		refreshStartedAtMs = Date.now(),
	) => {
		setManagingJobId(null);
		managingJobIdRef.current = null;
		setCustomJobId(null);
		customJobIdRef.current = null;
		invalidatePluginState(envId);
		waitForFollowUpScan(envId, refreshStartedAtMs);
		setLastJobStatus('completed');
		setLastJobError(null);
	};

	const failTrackedAction = (
		envId: number | null | undefined,
		error: string | null | undefined,
	) => {
		setManagingJobId(null);
		managingJobIdRef.current = null;
		setCustomJobId(null);
		customJobIdRef.current = null;
		setScanning(false);
		scanningEnvIdRef.current = null;
		scanJobIdRef.current = null;
		invalidatePluginState(envId);
		setLastJobStatus('failed');
		setLastJobError(error ?? 'An unexpected error occurred');
	};

	useWebSocketEvent('job:completed', data => {
		const event = data as {
			queueName: string;
			jobId?: string;
			environmentId?: number;
		};

		// Handle custom-plugins queue separately before the plugin-scans guard
		if (event.queueName === 'custom-plugins') {
			if (event.jobId != null && event.jobId === customJobIdRef.current) {
				completeTrackedAction(event.environmentId ?? selectedEnvId);
			}
			return;
		}

		if (event.queueName !== 'plugin-scans') return;

		const isTrackedScanJob =
			event.jobId != null && event.jobId === scanJobIdRef.current;
		const isScanJob =
			event.environmentId === scanningEnvIdRef.current || isTrackedScanJob;
		if (isScanJob) {
			const envId = event.environmentId ?? scanningEnvIdRef.current;
			setScanning(false);
			scanningEnvIdRef.current = null;
			scanJobIdRef.current = null;
			invalidatePluginState(envId);
			if (isTrackedScanJob) setLastJobStatus('completed');
		}

		const isManageJob =
			event.jobId != null && event.jobId === managingJobIdRef.current;
		if (isManageJob) {
			completeTrackedAction(event.environmentId ?? selectedEnvId);
		}

		// Composer read result: fetch execution log to get the reader content
		const isComposerRead =
			event.jobId != null && event.jobId === composerReadJobIdRef.current;
		if (isComposerRead) {
			const execId = composerReadExecIdRef.current;
			composerReadJobIdRef.current = null;
			composerReadExecIdRef.current = null;
			if (execId) {
				api
					.get<{
						execution_log: Array<{ step: string; detail?: string }> | null;
					}>(`/plugin-scans/execution/${execId}`)
					.then(data => {
						const entry = data?.execution_log?.find(
							e => e.step === 'composer-read-result',
						);
						if (entry?.detail) {
							try {
								setComposerReadData(
									JSON.parse(entry.detail) as Record<string, unknown>,
								);
							} catch {
								setComposerReadData(null);
							}
						} else {
							setComposerReadData(null);
						}
						setComposerReadLoading(false);
					})
					.catch(() => setComposerReadLoading(false));
			}
		}
	});

	useWebSocketEvent('job:failed', data => {
		const event = data as {
			queueName: string;
			jobId?: string;
			environmentId?: number;
			error?: string;
		};

		if (event.queueName === 'custom-plugins') {
			if (event.jobId != null && event.jobId === customJobIdRef.current) {
				failTrackedAction(event.environmentId ?? selectedEnvId, event.error);
				toast({
					title: 'Custom plugin operation failed',
					description: event.error ?? 'An unexpected error occurred',
					variant: 'destructive',
				});
			}
			return;
		}

		if (event.queueName !== 'plugin-scans') return;

		const isTrackedScanJob =
			event.jobId != null && event.jobId === scanJobIdRef.current;
		const isScanJob =
			event.environmentId === scanningEnvIdRef.current || isTrackedScanJob;
		if (isScanJob) {
			setScanning(false);
			scanningEnvIdRef.current = null;
			scanJobIdRef.current = null;
			if (isTrackedScanJob) {
				setLastJobStatus('failed');
				setLastJobError(event.error ?? 'An unexpected error occurred');
				toast({
					title: 'Plugin scan failed',
					description: event.error ?? 'An unexpected error occurred',
					variant: 'destructive',
				});
			} else {
				toast({
					title: 'Plugin refresh failed',
					description: event.error ?? 'The action completed, but the follow-up scan failed.',
					variant: 'destructive',
				});
			}
		}

		const isManageJob =
			event.jobId != null && event.jobId === managingJobIdRef.current;
		if (isManageJob) {
			failTrackedAction(event.environmentId ?? selectedEnvId, event.error);
			toast({
				title: 'Plugin operation failed',
				description: event.error ?? 'An unexpected error occurred',
				variant: 'destructive',
			});
		}

		const isComposerRead =
			event.jobId != null && event.jobId === composerReadJobIdRef.current;
		if (isComposerRead) {
			composerReadJobIdRef.current = null;
			composerReadExecIdRef.current = null;
			setComposerReadLoading(false);
			toast({
				title: 'Failed to read composer.json',
				description: event.error ?? 'An unexpected error occurred',
				variant: 'destructive',
			});
		}
	});

	const { data: scans, isLoading } = useQuery({
		queryKey: ['plugin-scans', selectedEnvId],
		enabled: !!selectedEnvId,
		queryFn: () =>
			api.get<{ items: PluginScan[] }>(
				`/plugin-scans/environment/${selectedEnvId}?limit=1`,
			),
		refetchInterval: 15_000,
	});

	const latestScan = scans?.items[0];

	const { data: lastJobLog } = useQuery<JobExecutionLogStatus>({
		queryKey: ['execution-log', lastJobExecutionId],
		queryFn: () =>
			api.get<JobExecutionLogStatus>(
				`/job-executions/${lastJobExecutionId}/log`,
			),
		enabled:
			lastJobExecutionId != null &&
			(lastJobStatus === 'running' || !!managingJobId || !!customJobId),
		staleTime: 0,
		refetchInterval:
			lastJobStatus === 'running' || !!managingJobId || !!customJobId
				? 2_000
				: false,
	});

	useEffect(() => {
		if (!lastJobLog) return;
		const envId = selectedEnvId;
		if (lastJobLog.status === 'completed') {
			if (lastJobKind === 'scan') {
				setScanning(false);
				scanningEnvIdRef.current = null;
				scanJobIdRef.current = null;
				invalidatePluginState(envId);
				setLastJobStatus('completed');
				setLastJobError(null);
			} else {
				completeTrackedAction(
					envId,
					lastJobLog.completed_at
						? new Date(lastJobLog.completed_at).getTime()
						: Date.now(),
				);
			}
		} else if (
			lastJobLog.status === 'failed' ||
			lastJobLog.status === 'dead_letter'
		) {
			if (lastJobKind === 'scan') {
				setScanning(false);
				scanningEnvIdRef.current = null;
				scanJobIdRef.current = null;
				setLastJobStatus('failed');
				setLastJobError(lastJobLog.last_error ?? 'An unexpected error occurred');
			} else {
				failTrackedAction(envId, lastJobLog.last_error);
			}
		}
	}, [lastJobLog?.status, lastJobLog?.last_error, selectedEnvId, lastJobKind]);

	const { data: customCatalog = [] } = useQuery<CustomPlugin[]>({
		queryKey: ['custom-plugins'],
		queryFn: () => api.get<CustomPlugin[]>('/custom-plugins'),
	});

	const { data: envCustomPlugins = [] } = useQuery<
		EnvironmentCustomPlugin[]
	>({
		queryKey: ['env-custom-plugins', selectedEnvId],
		enabled: !!selectedEnvId,
		queryFn: () =>
			api.get<EnvironmentCustomPlugin[]>(
				`/plugin-scans/environment/${selectedEnvId}/custom-plugins`,
			),
	});

	const customCatalogBySlug = new Map(customCatalog.map(plugin => [plugin.slug, plugin]));
	const envCustomBySlug = new Map(
		envCustomPlugins.map(entry => [entry.custom_plugin.slug, entry]),
	);

	useEffect(() => {
		if (scanning && latestScan) {
			const scannedAt = new Date(latestScan.scanned_at).getTime();
			if (scannedAt > scanStartedAtRef.current) {
				setScanning(false);
				scanningEnvIdRef.current = null;
				scanJobIdRef.current = null;
			}
		}
	}, [scanning, latestScan?.scanned_at]);

	const handleJobQueued = (
		data: { jobExecutionId?: number; bullJobId?: string },
		kind: 'action' | 'scan' = 'action',
	) => {
		const execId = data?.jobExecutionId ?? null;
		setLastJobExecutionId(execId);
		setLastJobKind(kind);
		if (execId) {
			setLastJobStatus('running');
			setLastJobError(null);
			setShowLogPanel(true);
		}
	};

	const scanMutation = useMutation({
		mutationFn: () =>
			api.post<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/scan`,
				{},
			),
		onSuccess: data => {
			setScanning(true);
			scanningEnvIdRef.current = selectedEnvId;
			scanJobIdRef.current = data?.bullJobId ?? null;
			scanStartedAtRef.current = Date.now();
			handleJobQueued(data, 'scan');
			toast({
				title: 'Plugin scan queued',
				description:
					'Results will appear automatically when the scan completes.',
			});
		},
		onError: () => toast({ title: 'Scan failed', variant: 'destructive' }),
	});

	const updateAllMutation = useMutation({
		mutationFn: (skipSafetyBackup: boolean) =>
			api.put<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/plugins`,
				{ skipSafetyBackup },
			),
		onSuccess: data => {
			const jobId = data?.bullJobId ?? null;
			setManagingJobId(jobId);
			managingJobIdRef.current = jobId;
			handleJobQueued(data);
			toast({
				title: 'Update all queued',
				description: 'All composer-managed plugins will be updated.',
			});
		},
		onError: () =>
			toast({ title: 'Failed to queue update-all', variant: 'destructive' }),
	});

	const removePluginMutation = useMutation({
		mutationFn: ({ slug, skipSafetyBackup }: { slug: string; skipSafetyBackup: boolean }) =>
			api.delete<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/plugins/${slug}`,
				{ skipSafetyBackup },
			),
		onSuccess: (data, { slug }) => {
			const jobId = data?.bullJobId ?? null;
			setManagingJobId(jobId);
			managingJobIdRef.current = jobId;
			handleJobQueued(data);
			toast({
				title: 'Remove queued',
				description: `${slug} will be removed via composer.`,
			});
		},
		onError: () =>
			toast({ title: 'Failed to queue removal', variant: 'destructive' }),
	});

	const updatePluginMutation = useMutation({
		mutationFn: ({ slug, skipSafetyBackup }: { slug: string; skipSafetyBackup: boolean }) =>
			api.put<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/plugins/${slug}`,
				{ skipSafetyBackup },
			),
		onSuccess: (data, { slug }) => {
			const jobId = data?.bullJobId ?? null;
			setManagingJobId(jobId);
			managingJobIdRef.current = jobId;
			handleJobQueued(data);
			toast({
				title: 'Update queued',
				description: `${slug} will be updated via composer.`,
			});
		},
		onError: () =>
			toast({ title: 'Failed to queue update', variant: 'destructive' }),
	});

	const changeConstraintMutation = useMutation({
		mutationFn: ({ slug, constraint }: { slug: string; constraint: string }) =>
			api.patch<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/plugins/${slug}/constraint`,
				{ constraint },
			),
		onSuccess: (data, { slug }) => {
			const jobId = data?.bullJobId ?? null;
			setManagingJobId(jobId);
			managingJobIdRef.current = jobId;
			setEditConstraintPlugin(null);
			handleJobQueued(data);
			toast({
				title: 'Constraint update queued',
				description: `${slug} constraint will be updated.`,
			});
		},
	});

	const toggleStatusMutation = useMutation({
		mutationFn: ({ slug, status, skipSafetyBackup }: { slug: string; status: 'active' | 'inactive'; skipSafetyBackup: boolean }) =>
			api.put<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/plugins/${slug}/status`,
				{ active: status === 'active', skipSafetyBackup },
			),
		onSuccess: (data, { slug, status }) => {
			const jobId = data?.bullJobId ?? null;
			setManagingJobId(jobId);
			managingJobIdRef.current = jobId;
			handleJobQueued(data);
			toast({
				title: `${status === 'active' ? 'Activation' : 'Deactivation'} queued`,
				description: `${slug} status change has been requested.`,
			});
		},
		onError: () =>
			toast({ title: 'Failed to queue status change', variant: 'destructive' }),
	});

	const migrateToComposerMutation = useMutation({
		mutationFn: ({ slug, skipSafetyBackup }: { slug: string; skipSafetyBackup: boolean }) =>
			api.post<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/plugins/${slug}/migrate-to-composer`,
				{ skipSafetyBackup },
			),
		onSuccess: (data, { slug }) => {
			const jobId = data?.bullJobId ?? null;
			setManagingJobId(jobId);
			managingJobIdRef.current = jobId;
			handleJobQueued(data);
			toast({
				title: 'Migration queued',
				description: `${slug} is being migrated to composer-managed wpackagist package.`,
			});
		},
		onError: () =>
			toast({ title: 'Failed to queue migration', variant: 'destructive' }),
	});

	const uninstallCustomMutation = useMutation({
		mutationFn: (customPluginId: number) =>
			api.delete<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/custom-plugins/${customPluginId}`,
			),
		onSuccess: data => {
			const jobId = data?.bullJobId ?? null;
			setCustomJobId(jobId);
			customJobIdRef.current = jobId;
			handleJobQueued(data);
			toast({
				title: 'Uninstall queued',
				description: 'Plugin will be removed via GitHub source.',
			});
		},
		onError: () => toast({ title: 'Uninstall failed', variant: 'destructive' }),
	});

	const updateCustomMutation = useMutation({
		mutationFn: (customPluginId: number) =>
			api.put<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/custom-plugins/${customPluginId}`,
				{},
			),
		onSuccess: data => {
			const jobId = data?.bullJobId ?? null;
			setCustomJobId(jobId);
			customJobIdRef.current = jobId;
			handleJobQueued(data);
			toast({
				title: 'Update queued',
				description: 'Plugin will be updated via GitHub source.',
			});
		},
		onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
	});

	const checkVersionsMutation = useMutation({
		mutationFn: () =>
			api.post(
				`/plugin-scans/environment/${selectedEnvId}/custom-plugins/check-versions`,
				{},
			),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['env-custom-plugins', selectedEnvId] });
			toast({ title: 'Version check complete' });
		},
		onError: () =>
			toast({ title: 'Version check failed', variant: 'destructive' }),
	});

	const composerReadMutation = useMutation({
		mutationFn: () =>
			api.post<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/composer`,
				{},
			),
		onSuccess: data => {
			composerReadJobIdRef.current = data?.bullJobId ?? null;
			composerReadExecIdRef.current = data?.jobExecutionId ?? null;
			setComposerReadLoading(true);
			setComposerReadData(null);
			setComposerViewOpen(true);
		},
		onError: () =>
			toast({ title: 'Failed to read composer.json', variant: 'destructive' }),
	});

	const runBulkToggleStatus = async (slugs: string[], active: boolean, skipSafetyBackup: boolean) => {
		setBulkProcessing(true);
		setSelectedSlugs(new Set());
		try {
			let index = 1;
			for (const slug of slugs) {
				setBulkActionProgress(`Processing ${index}/${slugs.length}: ${active ? 'activating' : 'deactivating'} ${slug}...`);
				await toggleStatusMutation.mutateAsync({
					slug,
					status: active ? 'active' : 'inactive',
					skipSafetyBackup
				});
				index++;
			}
			toast({
				title: 'Bulk status update completed',
				description: `Successfully processed ${slugs.length} plugin(s).`,
			});
		} catch (err) {
			toast({
				title: 'Bulk status update encountered errors',
				description: 'Some status updates might have failed.',
				variant: 'destructive',
			});
		} finally {
			setBulkProcessing(false);
			setBulkActionProgress('');
			qc.invalidateQueries({ queryKey: ['env-custom-plugins', selectedEnvId] });
		}
	};

	const runBulkUpdate = async (slugs: string[], skipSafetyBackup: boolean) => {
		setBulkProcessing(true);
		setSelectedSlugs(new Set());
		try {
			let index = 1;
			for (const slug of slugs) {
				setBulkActionProgress(`Processing ${index}/${slugs.length}: updating ${slug}...`);
				await updatePluginMutation.mutateAsync({ slug, skipSafetyBackup });
				index++;
			}
			toast({
				title: 'Bulk update completed',
				description: `Successfully enqueued updates for ${slugs.length} plugin(s).`,
			});
		} catch (err) {
			toast({
				title: 'Bulk update encountered errors',
				description: 'Some updates might have failed.',
				variant: 'destructive',
			});
		} finally {
			setBulkProcessing(false);
			setBulkActionProgress('');
		}
	};

	const runBulkDelete = async (slugs: string[], skipSafetyBackup: boolean) => {
		setBulkProcessing(true);
		setSelectedSlugs(new Set());
		try {
			let index = 1;
			for (const slug of slugs) {
				setBulkActionProgress(`Processing ${index}/${slugs.length}: deleting ${slug}...`);
				await removePluginMutation.mutateAsync({ slug, skipSafetyBackup });
				index++;
			}
			toast({
				title: 'Bulk delete completed',
				description: `Successfully enqueued removal of ${slugs.length} plugin(s).`,
			});
		} catch (err) {
			toast({
				title: 'Bulk delete encountered errors',
				description: 'Some deletions might have failed.',
				variant: 'destructive',
			});
		} finally {
			setBulkProcessing(false);
			setBulkActionProgress('');
		}
	};

	if (environments.length === 0) {
		return (
			<div className='text-center py-12 text-muted-foreground'>
				<ScanLine className='h-10 w-10 mx-auto mb-3 opacity-40' />
				<p className='font-medium'>No environments configured</p>
				<p className='text-sm mt-1'>Add an environment first to scan plugins</p>
			</div>
		);
	}

	const { isBedrock, plugins, muPlugins } = parseScanPlugins(latestScan);
	const scanPluginBySlug = new Map(plugins.map(p => [p.slug, p]));
	const composerManaged = plugins.filter(p => p.managed_by_composer).length;
	const monorepoManaged = plugins.filter(p => !!p.managed_by_monorepo).length;
	const manualCount = plugins.filter(
		p => !p.managed_by_composer && !p.managed_by_monorepo,
	).length;
	const hasUpdate = (plugin: Plugin) => {
		const customEntry = envCustomBySlug.get(plugin.slug);
		if (
			plugin.managed_by_monorepo &&
			customEntry?.latest_version &&
			plugin.version !== customEntry.latest_version
		) {
			return true;
		}
		return plugin.update_available;
	};
	const updatesAvailable = plugins.filter(hasUpdate).length;
	const filtered = plugins.filter(p => {
		if (pluginFilter === 'wpackagist' && !p.managed_by_composer) return false;
		if (pluginFilter === 'monorepo' && !p.managed_by_monorepo) return false;
		if (
			pluginFilter === 'manual' &&
			(p.managed_by_composer || p.managed_by_monorepo)
		)
			return false;
		if (statusFilter === 'active' && p.status !== 'active') return false;
		if (statusFilter === 'inactive' && p.status !== 'inactive') return false;
		if (updateFilter === 'updates' && !hasUpdate(p)) return false;

		if (search) {
			const q = search.toLowerCase();
			return (
				p.name.toLowerCase().includes(q) ||
				(p.author?.toLowerCase().includes(q) ?? false) ||
				p.slug.toLowerCase().includes(q)
			);
		}
		return true;
	});
	const isBusy = scanMutation.isPending || scanning || bulkProcessing;
	const isManaging =
		!!managingJobId ||
		updateAllMutation.isPending ||
		removePluginMutation.isPending ||
		updatePluginMutation.isPending ||
		changeConstraintMutation.isPending ||
		toggleStatusMutation.isPending ||
		migrateToComposerMutation.isPending ||
		!!customJobId ||
		updateCustomMutation.isPending ||
		uninstallCustomMutation.isPending ||
		bulkProcessing;

	return (
		<div className='space-y-4'>
			{/* Top action bar */}
			<div className='flex flex-wrap items-center gap-3'>
				<Select
					value={selectedEnvId?.toString()}
					onValueChange={v => {
						const newEnvId = Number(v);
						setSelectedEnvId(newEnvId);
						setSearch('');
						if (scanningEnvIdRef.current !== newEnvId) setScanning(false);
					}}
				>
					<SelectTrigger className='w-56'>
						<SelectValue placeholder='Select environment\u2026' />
					</SelectTrigger>
					<SelectContent>
						{environments.map(e => (
							<SelectItem key={e.id} value={e.id.toString()}>
								<span className='capitalize'>{e.type}</span>
								<span className='text-muted-foreground ml-1.5 text-xs'>
									({e.server.name})
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Button
					size='sm'
					variant='outline'
					onClick={() => scanMutation.mutate()}
					disabled={!selectedEnvId || isBusy}
				>
					{isBusy ? (
						<Loader2 className='h-4 w-4 mr-1.5 animate-spin' />
					) : (
						<RefreshCw className='h-4 w-4 mr-1.5' />
					)}
					{scanning
						? 'Scanning\u2026'
						: scanMutation.isPending
							? 'Queuing\u2026'
							: 'Scan Now'}
				</Button>

				{isBedrock && (
					<>
						<Button
							size='sm'
							variant='outline'
							onClick={() => setShowAddDialog(true)}
							disabled={!selectedEnvId || isManaging}
						>
							<Plus className='h-4 w-4 mr-1.5' />
							Add Plugin
						</Button>
						<Button
							size='sm'
							variant='outline'
							onClick={() => setActionDialogState({ open: true, action: 'updateAll', slug: null })}
							disabled={!selectedEnvId || isManaging || updatesAvailable === 0}
						>
							{updateAllMutation.isPending ? (
								<Loader2 className='h-4 w-4 mr-1.5 animate-spin' />
							) : (
								<RotateCcw className='h-4 w-4 mr-1.5' />
							)}
							Update All
						</Button>
						{monorepoManaged > 0 && (
							<Button
								size='sm'
								variant='outline'
								onClick={() => checkVersionsMutation.mutate()}
								disabled={!selectedEnvId || checkVersionsMutation.isPending}
							>
								{checkVersionsMutation.isPending ? (
									<Loader2 className='h-4 w-4 mr-1.5 animate-spin' />
								) : (
									<RefreshCw className='h-4 w-4 mr-1.5' />
								)}
								Check GitHub Versions
							</Button>
						)}
					</>
				)}

				{latestScan && (
					<p className='text-xs text-muted-foreground ml-auto'>
						Last scanned: {new Date(latestScan.scanned_at).toLocaleString()}
					</p>
				)}
			</div>

			{/* Background job execution log panel */}
			{showLogPanel && lastJobExecutionId && (
				<Card className="border border-border/80 bg-card/60 backdrop-blur-sm shadow-sm transition-all duration-300 overflow-hidden">
					<CardHeader className="flex flex-row items-center justify-between space-y-0 py-3 px-4 bg-muted/40 border-b border-border/60">
						<div className="flex items-center gap-2">
							<Terminal className="h-4 w-4 text-purple-600 dark:text-purple-400 animate-pulse" />
							<CardTitle className="text-xs font-semibold text-foreground uppercase tracking-wider">
								Execution Progress & Log
							</CardTitle>
						</div>
						<div className="flex items-center gap-2">
							{lastJobStatus === 'running' && (
								<Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800 flex items-center gap-1 font-medium text-[10px]">
									<Loader2 className="h-3 w-3 animate-spin" />
									Running
								</Badge>
							)}
							{lastJobStatus === 'completed' && (
								<Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 font-medium text-[10px]">
									<CheckCircle2 className="h-3 w-3" />
									Success
								</Badge>
							)}
							{lastJobStatus === 'failed' && (
								<Badge variant="destructive" className="flex items-center gap-1 font-medium text-[10px]">
									<XCircle className="h-3 w-3" />
									Failed
								</Badge>
							)}
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6 text-muted-foreground hover:text-foreground"
								onClick={() => {
									setShowLogPanel(false);
								}}
							>
								<X className="h-4 w-4" />
							</Button>
						</div>
					</CardHeader>
					<CardContent className="p-4 max-h-[350px] overflow-y-auto font-mono text-sm">
						{lastJobStatus === 'failed' && lastJobError && (
							<div className="mb-3 p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 text-red-800 dark:text-red-300 flex items-start gap-2">
								<XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
								<div>
									<p className="font-semibold text-xs">Operation Failed</p>
									<p className="text-xs mt-0.5 font-mono break-all">{lastJobError}</p>
								</div>
							</div>
						)}
						<ExecutionLogPanel
							jobExecutionId={lastJobExecutionId}
							isActive={lastJobStatus === 'running'}
						/>
					</CardContent>
				</Card>
			)}

			{/* Bedrock indicator */}
			{isBedrock && (
				<div className='flex items-center gap-2 flex-wrap'>
					<Badge variant='secondary' className='gap-1.5'>
						<Package className='h-3 w-3' />
						Bedrock / Composer
					</Badge>
					<span className='text-xs text-muted-foreground'>
						{composerManaged} of {plugins.length} plugins managed by composer
					</span>
					<Button
						size='sm'
						variant='ghost'
						className='h-7 px-2 text-xs gap-1.5 text-muted-foreground'
						disabled={
							!selectedEnvId ||
							composerReadMutation.isPending ||
							composerReadLoading
						}
						onClick={() => composerReadMutation.mutate()}
						title='View composer.json'
					>
						<Code2 className='h-3 w-3' />
						composer.json
					</Button>
					{isManaging && (
						<span className='flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400'>
							<Loader2 className='h-3 w-3 animate-spin' />
							Running composer\u2026
						</span>
					)}
				</div>
			)}

			{isLoading ? (
				<div className='space-y-2'>
					{[1, 2, 3].map(i => (
						<Skeleton key={i} className='h-10 rounded-lg' />
					))}
				</div>
			) : !latestScan && !scanning ? (
				<div className='text-center py-12 border rounded-lg text-muted-foreground'>
					<ScanLine className='h-10 w-10 mx-auto mb-3 opacity-40' />
					<p className='font-medium'>No scan results yet</p>
					<p className='text-sm mt-1'>
						Run a plugin scan to see installed plugins
					</p>
					<Button
						className='mt-4'
						size='sm'
						onClick={() => scanMutation.mutate()}
						disabled={isBusy}
					>
						<ScanLine className='h-4 w-4 mr-1.5' />
						Run First Scan
					</Button>
				</div>
			) : scanning && !latestScan ? (
				<div className='text-center py-12 border rounded-lg text-muted-foreground'>
					<Loader2 className='h-10 w-10 mx-auto mb-3 opacity-40 animate-spin' />
					<p className='font-medium'>Scan in progress\u2026</p>
					<p className='text-sm mt-1'>
						Results will appear automatically when the scan completes
					</p>
				</div>
			) : (
				<>
					<div className='flex flex-wrap items-center gap-3'>
						<span className='text-sm text-muted-foreground'>
							{plugins.length} plugins total
						</span>
						{updatesAvailable > 0 ? (
							<span className='text-sm text-yellow-600 dark:text-yellow-400 font-medium'>
								{updatesAvailable} update{updatesAvailable !== 1 ? 's' : ''}{' '}
								available
							</span>
						) : plugins.length > 0 ? (
							<span className='text-sm text-green-600 dark:text-green-400'>
								All up to date
							</span>
						) : null}
						{scanning && (
							<span className='flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400'>
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
								Refreshing…
							</span>
						)}
						<div className='relative ml-auto'>
							<Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none' />
							<Input
								className='pl-8 h-8 text-xs w-48'
								placeholder='Search plugins…'
								value={search}
								onChange={e => setSearch(e.target.value)}
							/>
						</div>
					</div>

					<div className='flex flex-wrap items-center gap-4 bg-muted/20 p-2.5 rounded-lg border border-border/40'>
						{isBedrock && (
							<div className='flex flex-wrap items-center gap-1 border-r pr-4 border-border/60'>
								<span className='text-xs font-semibold text-muted-foreground mr-2 uppercase tracking-wider'>Source:</span>
								{(
									[
										['all', 'All', plugins.length],
										['wpackagist', 'Composer', composerManaged],
										['monorepo', 'GitHub', monorepoManaged],
										['manual', 'Manual', manualCount],
									] as [typeof pluginFilter, string, number][]
								).map(([key, label, count]) => (
									<button
										key={key}
										type='button'
										onClick={() => setPluginFilter(key)}
										className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
											pluginFilter === key
												? 'bg-primary text-primary-foreground shadow-sm'
												: 'text-muted-foreground hover:bg-muted hover:text-foreground'
										}`}
									>
										{label}
										<span className='ml-1 opacity-70'>({count})</span>
									</button>
								))}
							</div>
						)}

						<div className='flex flex-wrap items-center gap-1 border-r pr-4 border-border/60'>
							<span className='text-xs font-semibold text-muted-foreground mr-2 uppercase tracking-wider'>Status:</span>
							{(
								[
									['all', 'All', plugins.length],
									['active', 'Active', plugins.filter(p => p.status === 'active').length],
									['inactive', 'Inactive', plugins.filter(p => p.status === 'inactive').length],
								] as [typeof statusFilter, string, number][]
							).map(([key, label, count]) => (
								<button
									key={key}
									type='button'
									onClick={() => setStatusFilter(key)}
									className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
										statusFilter === key
											? 'bg-primary text-primary-foreground shadow-sm'
											: 'text-muted-foreground hover:bg-muted hover:text-foreground'
									}`}
								>
									{label}
									<span className='ml-1 opacity-70'>({count})</span>
								</button>
							))}
						</div>

						<div className='flex flex-wrap items-center gap-1'>
							<span className='text-xs font-semibold text-muted-foreground mr-2 uppercase tracking-wider'>Updates:</span>
							{(
								[
									['all', 'All', plugins.length],
									['updates', 'Update Available', updatesAvailable],
								] as [typeof updateFilter, string, number][]
							).map(([key, label, count]) => (
								<button
									key={key}
									type='button'
									onClick={() => setUpdateFilter(key)}
									className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 ${
										updateFilter === key
											? 'bg-primary text-primary-foreground shadow-sm'
											: 'text-muted-foreground hover:bg-muted hover:text-foreground'
									}`}
								>
									{label}
									{count > 0 && (
										<span className={`ml-1 px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
											updateFilter === key 
												? 'bg-primary-foreground text-primary' 
												: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400'
										}`}>
											{count}
										</span>
									)}
								</button>
							))}
						</div>
					</div>

					<div className='border rounded-lg overflow-hidden'>
						<table className='w-full text-sm'>
							<thead className='border-b bg-muted/40'>
								<tr>
									<th className='w-12 px-4 py-3 text-center'>
										<Checkbox
											checked={filtered.length > 0 && filtered.every(p => selectedSlugs.has(p.slug))}
											onCheckedChange={(checked) => {
												if (checked) {
													setSelectedSlugs(new Set(filtered.map(p => p.slug)));
												} else {
													setSelectedSlugs(new Set());
												}
											}}
										/>
									</th>
									<th className='w-10 px-0 py-3'></th>
									<th className='text-left px-4 py-3 font-medium'>Plugin</th>
									<th className='text-left px-4 py-3 font-medium'>Version</th>
									<th className='text-left px-4 py-3 font-medium'>Author</th>
									<th className='text-left px-4 py-3 font-medium'>WP Status</th>
									<th className='text-left px-4 py-3 font-medium'>Updates</th>
									{isBedrock && (
										<th className='text-left px-4 py-3 font-medium'>Source</th>
									)}
									<th className='w-48 px-4 py-3 font-medium text-right'>Actions</th>
								</tr>
							</thead>
							<tbody className='divide-y'>
								{filtered.map((p, i) => {
									const isSelected = selectedSlugs.has(p.slug);
									const isExpanded = expandedSlugs.has(p.slug);
									const customPlugin = customCatalogBySlug.get(p.slug);
									const customEntry = envCustomBySlug.get(p.slug);
									const customLatest = customEntry?.latest_version ?? null;
									const customUpdateAvailable =
										p.managed_by_monorepo &&
										!!customLatest &&
										p.version !== customLatest;
									const updateAvailable = p.update_available || customUpdateAvailable;
									return (
										<Fragment key={`${p.slug}-${i}`}>
											<tr className={`hover:bg-muted/20 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
												<td className='px-4 py-3 text-center'>
													<Checkbox
														checked={isSelected}
														onCheckedChange={(checked) => {
															setSelectedSlugs(prev => {
																const next = new Set(prev);
																if (checked) {
																	next.add(p.slug);
																} else {
																	next.delete(p.slug);
																}
																return next;
															});
														}}
													/>
												</td>
												<td className='px-0 py-3 text-center'>
													<Button
														variant='ghost'
														size='icon'
														className='h-7 w-7 text-muted-foreground hover:bg-muted'
														onClick={() => {
															setExpandedSlugs(prev => {
																const next = new Set(prev);
																if (isExpanded) {
																	next.delete(p.slug);
																} else {
																	next.add(p.slug);
																}
																return next;
															});
														}}
													>
														{isExpanded ? (
															<ChevronUp className='h-4 w-4 text-primary' />
														) : (
															<ChevronDown className='h-4 w-4' />
														)}
													</Button>
												</td>
												<td className='px-4 py-3 cursor-pointer' onClick={(e) => {
													if ((e.target as HTMLElement).closest('a, button, input')) return;
													setExpandedSlugs(prev => {
														const next = new Set(prev);
														if (isExpanded) {
															next.delete(p.slug);
														} else {
															next.add(p.slug);
														}
														return next;
													});
												}}>
													<span className='font-medium'>{p.name}</span>
													{p.plugin_uri && (
														<a
															href={p.plugin_uri}
															target='_blank'
															rel='noopener noreferrer'
															className='ml-1.5 text-muted-foreground hover:text-foreground'
														>
															<ExternalLink className='h-3 w-3 inline' />
														</a>
													)}
													<p className='text-xs text-muted-foreground font-mono'>
														{p.slug}
													</p>
												</td>
												<td className='px-4 py-3 text-muted-foreground font-mono text-xs'>
													{p.version}
													{p.composer_constraint && (
														<p className='text-muted-foreground/60'>
															{p.composer_constraint}
														</p>
													)}
												</td>
												<td className='px-4 py-3 text-muted-foreground'>
													{p.author ?? '\u2014'}
												</td>
												<td className='px-4 py-3'>
													{p.status === 'active' ? (
														<Badge
															variant='outline'
															className='bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800 text-xs font-semibold'
														>
															Active
														</Badge>
													) : (
														<Badge
															variant='outline'
															className='bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-950/30 dark:text-gray-400 dark:border-gray-800 text-xs font-medium'
														>
															Inactive
														</Badge>
													)}
												</td>
												<td className='px-4 py-3'>
													{updateAvailable ? (
														<span className='flex items-center gap-1 text-yellow-600 dark:text-yellow-400 text-xs font-medium'>
															<ArrowUpCircle className='h-3.5 w-3.5 shrink-0' />
															{customLatest ?? p.latest_version ?? 'Update available'}
														</span>
													) : (
														<span className='flex items-center gap-1 text-green-600 dark:text-green-400 text-xs'>
															<CheckCircle2 className='h-3.5 w-3.5 shrink-0' />
															Up to date
														</span>
													)}
												</td>
												{isBedrock && (
													<td className='px-4 py-3'>
														{p.managed_by_composer ? (
															<div className='flex flex-col gap-0.5'>
																<Badge
																	variant='outline'
																	className='text-xs gap-1 w-fit'
																>
																	<Package className='h-2.5 w-2.5' />
																	composer
																</Badge>
																{p.composer_constraint && (
																	<span className='text-xs text-muted-foreground/70 font-mono'>
																		{p.composer_constraint}
																	</span>
																)}
															</div>
														) : p.managed_by_monorepo ? (
															<Badge
																variant='outline'
																className='text-xs gap-1 w-fit bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-400 dark:border-purple-800'
															>
																<GitBranch className='h-2.5 w-2.5' />
																GitHub
															</Badge>
														) : (
															<span className='text-xs text-muted-foreground'>
																manual
															</span>
														)}
													</td>
												)}
												<td className='px-4 py-3 text-right'>
													<div className='flex items-center justify-end gap-1.5'>
														{/* Activation Toggle */}
														{p.status === 'active' ? (
															<Button
																size='sm'
																variant='ghost'
																className='h-7 px-2 text-xs text-muted-foreground hover:bg-muted'
																disabled={isManaging}
																onClick={() =>
																	setActionDialogState({ open: true, action: 'deactivate', slug: p.slug })
																}
															>
																Deactivate
															</Button>
														) : (
															<Button
																size='sm'
																variant='ghost'
																className='h-7 px-2 text-xs text-primary font-medium hover:bg-primary/5'
																disabled={isManaging}
																onClick={() =>
																	setActionDialogState({ open: true, action: 'activate', slug: p.slug })
																}
															>
																Activate
															</Button>
														)}

														{/* Composer Constraint Editing */}
														{isBedrock && p.managed_by_composer && (
															<Button
																size='sm'
																variant='ghost'
																className='h-7 px-2 text-xs text-muted-foreground hover:bg-muted'
																disabled={isManaging}
																onClick={() => {
																	setEditConstraintPlugin(p);
																}}
																title='Edit version constraint'
															>
																<Pencil className='h-3 w-3' />
															</Button>
														)}

														{/* Migrate Manual to Composer */}
														{isBedrock && !p.managed_by_composer && !p.managed_by_monorepo && p.latest_version !== null && (
															<Button
																size='sm'
																variant='ghost'
																className='h-7 px-2 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/20'
																disabled={isManaging}
																onClick={() =>
																	setActionDialogState({ open: true, action: 'migrate', slug: p.slug })
																}
																title='Migrate manual plugin to Composer dependency'
															>
																<ArrowUpCircle className='h-3 w-3 mr-1 inline' /> Migrate
															</Button>
														)}

														{/* Composer-specific Updates */}
														{isBedrock && p.managed_by_composer && p.update_available && (
															<Button
																size='sm'
																variant='ghost'
																className='h-7 px-2 text-xs hover:bg-muted'
																disabled={isManaging}
																onClick={() =>
																	setActionDialogState({ open: true, action: 'update', slug: p.slug })
																}
																title='Update via composer'
															>
																<RotateCcw className='h-3 w-3' />
															</Button>
														)}

														{/* GitHub custom plugin updates */}
														{isBedrock && p.managed_by_monorepo && customUpdateAvailable && (
															<Button
																size='sm'
																variant='ghost'
																className='h-7 px-2 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20'
																disabled={isManaging || updateCustomMutation.isPending}
																onClick={() => {
																	if (customPlugin) {
																		updateCustomMutation.mutate(customPlugin.id);
																	} else {
																		toast({
																			title: 'Cannot update plugin',
																			description: 'Matching custom plugin record not found in catalog.',
																			variant: 'destructive',
																		});
																	}
																}}
																title='Update custom plugin'
															>
																<RotateCcw className='h-3 w-3' />
															</Button>
														)}

														{/* Delete Action */}
														{p.managed_by_monorepo ? (
															<Button
																size='sm'
																variant='ghost'
																className='h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/5'
																disabled={isManaging}
																onClick={() => {
																	if (customPlugin) {
																		uninstallCustomMutation.mutate(customPlugin.id);
																	} else {
																		toast({
																			title: 'Cannot remove plugin',
																			description: 'Matching custom plugin record not found in catalog.',
																			variant: 'destructive',
																		});
																	}
																}}
																title='Remove custom plugin'
															>
																<Trash2 className='h-3 w-3' />
															</Button>
														) : (
															<Button
																size='sm'
																variant='ghost'
																className='h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/5'
																disabled={isManaging}
																onClick={() =>
																	setActionDialogState({ open: true, action: 'remove', slug: p.slug })
																}
																title={p.managed_by_composer ? 'Remove via Composer' : 'Delete plugin files'}
															>
																<Trash2 className='h-3 w-3' />
															</Button>
														)}
													</div>
												</td>
											</tr>
											{isExpanded && (
												<tr className='bg-muted/10 border-t-0'>
													<td colSpan={isBedrock ? 9 : 8} className='px-6 py-4 border-t-0'>
														<div className='grid grid-cols-1 md:grid-cols-2 gap-6 text-xs max-w-5xl'>
															<div className='space-y-2'>
																<h4 className='font-semibold text-foreground text-xs uppercase tracking-wider text-muted-foreground/80'>Description</h4>
																<p className='text-muted-foreground leading-relaxed text-sm'>
																	{p.description || 'No description available for this plugin.'}
																</p>
																{p.plugin_uri && (
																	<div className='pt-1.5'>
																		<a
																			href={p.plugin_uri}
																			target='_blank'
																			rel='noopener noreferrer'
																			className='inline-flex items-center gap-1 text-primary hover:underline font-medium text-xs'
																		>
																			Visit plugin site <ExternalLink className='h-3 w-3' />
																		</a>
																	</div>
																)}
															</div>
															<div className='space-y-2 md:border-l md:pl-6 border-border/40'>
																<h4 className='font-semibold text-foreground text-xs uppercase tracking-wider text-muted-foreground/80'>Metadata</h4>
																<div className='grid grid-cols-2 gap-y-2 gap-x-4 text-xs'>
																	<span className='font-medium text-muted-foreground'>Slug:</span>
																	<span className='font-mono font-semibold'>{p.slug}</span>
																	
																	<span className='font-medium text-muted-foreground'>Installed Version:</span>
																	<span className='font-mono'>{p.version}</span>
																	
																	{p.latest_version && (
																		<>
																			<span className='font-medium text-muted-foreground'>Latest Version:</span>
																			<span className={`font-mono ${p.update_available ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : ''}`}>
																				{p.latest_version}
																			</span>
																		</>
																	)}

																	{isBedrock && (
																		<>
																			<span className='font-medium text-muted-foreground'>Managed by:</span>
																			<span className='font-semibold text-foreground/80'>
																					{p.managed_by_composer ? 'Composer' : p.managed_by_monorepo ? 'GitHub' : 'Manual Upload'}
																			</span>
																		</>
																	)}

																	{p.composer_constraint && (
																		<>
																			<span className='font-medium text-muted-foreground'>Composer Constraint:</span>
																			<span className='font-mono text-foreground/70'>{p.composer_constraint}</span>
																		</>
																	)}
																</div>
															</div>
														</div>
													</td>
												</tr>
											)}
										</Fragment>
									);
								})}
							</tbody>
						</table>
						{filtered.length === 0 && (
							<p className='text-center text-muted-foreground py-8 text-sm'>
								{search ? 'No plugins match that search.' : 'No plugins found.'}
							</p>
						)}
					</div>
				</>
			)}

			{/* Must-Use Plugins section */}
			{muPlugins.length > 0 && (
				<div className='border rounded-lg overflow-hidden'>
					<div className='flex items-center gap-2 px-4 py-2.5 border-b bg-muted/20'>
						<span className='text-sm font-medium'>Must-Use Plugins</span>
						<Badge variant='secondary' className='text-xs'>
							{muPlugins.length}
						</Badge>
						<span className='text-xs text-muted-foreground'>
							(mu-plugins — auto-loaded, not manageable via composer)
						</span>
					</div>
					<table className='w-full text-sm'>
						<thead className='border-b bg-muted/30'>
							<tr>
								<th className='text-left px-4 py-2.5 font-medium text-xs'>
									Plugin
								</th>
								<th className='text-left px-4 py-2.5 font-medium text-xs'>
									Version
								</th>
								<th className='text-left px-4 py-2.5 font-medium text-xs'>
									Author
								</th>
							</tr>
						</thead>
						<tbody className='divide-y'>
							{muPlugins.map((p, i) => (
								<tr key={`mu-${p.slug}-${i}`} className='hover:bg-muted/10'>
									<td className='px-4 py-2.5'>
										<span className='font-medium'>{p.name}</span>
										<p className='text-xs text-muted-foreground font-mono'>
											{p.slug}
										</p>
									</td>
									<td className='px-4 py-2.5 text-muted-foreground font-mono text-xs'>
										{p.version}
									</td>
									<td className='px-4 py-2.5 text-muted-foreground text-xs'>
										{p.author ?? '—'}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{/* Composer.json viewer dialog */}
			<Dialog
				open={composerViewOpen}
				onOpenChange={open => {
					if (!open) {
						setComposerViewOpen(false);
						setComposerReadData(null);
					}
				}}
			>
				<DialogContent className='sm:max-w-2xl max-h-[80vh] flex flex-col'>
					<DialogHeader>
						<DialogTitle>composer.json</DialogTitle>
					</DialogHeader>
					<div className='flex-1 overflow-auto min-h-0 mt-2'>
						{composerReadLoading ? (
							<div className='flex items-center justify-center py-12'>
								<Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
								<span className='ml-2 text-sm text-muted-foreground'>
									Reading composer.json…
								</span>
							</div>
						) : composerReadData ? (
							<pre className='text-xs font-mono bg-muted/40 rounded-lg p-4 overflow-auto whitespace-pre-wrap'>
								{JSON.stringify(composerReadData, null, 2)}
							</pre>
						) : (
							<p className='text-sm text-muted-foreground text-center py-8'>
								No composer.json data available.
							</p>
						)}
					</div>
				</DialogContent>
			</Dialog>

			{editConstraintPlugin && selectedEnvId && (
				<EditConstraintDialog
					plugin={editConstraintPlugin}
					onClose={() => setEditConstraintPlugin(null)}
					onSave={(slug, constraint) =>
						changeConstraintMutation.mutate({ slug, constraint })
					}
					isPending={changeConstraintMutation.isPending}
				/>
			)}

			{selectedEnvId && (
				<AddPluginDialog
					envId={selectedEnvId}
					open={showAddDialog}
					onClose={() => setShowAddDialog(false)}
					isBedrock={isBedrock}
					onJobQueued={handleJobQueued}
				/>
			)}

			{/* Auto-update schedule (Bedrock only) */}
			{isBedrock && selectedEnvId && (
				<PluginUpdateScheduleCard envId={selectedEnvId} />
			)}

			{selectedEnvId && actionDialogState.open && (
				<ConfirmPluginActionDialog
					open={actionDialogState.open}
					onClose={() => setActionDialogState({ open: false, action: null, slug: null })}
					title={
						actionDialogState.action === 'updateAll'
							? 'Update All Composer Plugins'
							: actionDialogState.action === 'bulk-activate'
								? `Bulk Activate Plugins (${selectedSlugs.size})`
								: actionDialogState.action === 'bulk-deactivate'
									? `Bulk Deactivate Plugins (${selectedSlugs.size})`
									: actionDialogState.action === 'bulk-update'
										? `Bulk Update Plugins (${selectedSlugs.size})`
										: actionDialogState.action === 'bulk-remove'
											? `Bulk Delete Plugins (${selectedSlugs.size})`
											: actionDialogState.action === 'update'
												? `Update Plugin: ${actionDialogState.slug}`
												: actionDialogState.action === 'remove'
													? `Remove Plugin: ${actionDialogState.slug}`
													: actionDialogState.action === 'activate'
														? `Activate Plugin: ${actionDialogState.slug}`
														: actionDialogState.action === 'deactivate'
															? `Deactivate Plugin: ${actionDialogState.slug}`
															: `Migrate to Composer: ${actionDialogState.slug}`
					}
					description={
						actionDialogState.action === 'updateAll'
							? 'This will run `composer update` to update all plugins to their latest versions according to your composer.json constraints.'
							: actionDialogState.action === 'bulk-activate'
								? `This will activate ${selectedSlugs.size} selected plugins in your WordPress installation.`
								: actionDialogState.action === 'bulk-deactivate'
									? `This will deactivate ${selectedSlugs.size} selected plugins in your WordPress installation.`
									: actionDialogState.action === 'bulk-update'
										? `This will update the selected plugins that have available updates according to your composer.json constraints.`
										: actionDialogState.action === 'bulk-remove'
											? `This will permanently delete the selected ${selectedSlugs.size} plugins from your environment.`
											: actionDialogState.action === 'update'
												? `This will update ${actionDialogState.slug} to the latest version allowed by your constraints.`
												: actionDialogState.action === 'remove'
													? `This will permanently delete ${actionDialogState.slug} files and remove it from your environment.`
													: actionDialogState.action === 'activate'
														? `This will activate the plugin ${actionDialogState.slug} in your WordPress installation.`
														: actionDialogState.action === 'deactivate'
															? `This will deactivate the plugin ${actionDialogState.slug} in your WordPress installation.`
															: `This will convert ${actionDialogState.slug} into a composer-managed dependency. A backup of the directory will be kept during the process.`
					}
					isPending={
						actionDialogState.action === 'updateAll'
							? updateAllMutation.isPending
							: actionDialogState.action === 'update'
								? updatePluginMutation.isPending
								: actionDialogState.action === 'remove'
									? removePluginMutation.isPending
									: actionDialogState.action === 'activate' || actionDialogState.action === 'deactivate'
										? toggleStatusMutation.isPending
										: migrateToComposerMutation.isPending
					}
					onConfirm={(skipSafetyBackup) => {
						if (actionDialogState.action === 'updateAll') {
							updateAllMutation.mutate(skipSafetyBackup);
						} else if (actionDialogState.action === 'bulk-activate') {
							runBulkToggleStatus(Array.from(selectedSlugs), true, skipSafetyBackup);
						} else if (actionDialogState.action === 'bulk-deactivate') {
							runBulkToggleStatus(Array.from(selectedSlugs), false, skipSafetyBackup);
						} else if (actionDialogState.action === 'bulk-update') {
							runBulkUpdate(
								Array.from(selectedSlugs).filter(slug => {
									const p = scanPluginBySlug.get(slug);
									return p?.update_available && p?.managed_by_composer;
								}),
								skipSafetyBackup
							);
						} else if (actionDialogState.action === 'bulk-remove') {
							runBulkDelete(
								Array.from(selectedSlugs).filter(slug => {
									const p = scanPluginBySlug.get(slug);
									return p && !p.managed_by_monorepo;
								}),
								skipSafetyBackup
							);
						} else if (actionDialogState.action === 'update' && actionDialogState.slug) {
							updatePluginMutation.mutate({ slug: actionDialogState.slug, skipSafetyBackup });
						} else if (actionDialogState.action === 'remove' && actionDialogState.slug) {
							removePluginMutation.mutate({ slug: actionDialogState.slug, skipSafetyBackup });
						} else if ((actionDialogState.action === 'activate' || actionDialogState.action === 'deactivate') && actionDialogState.slug) {
							toggleStatusMutation.mutate({
								slug: actionDialogState.slug,
								status: actionDialogState.action === 'activate' ? 'active' : 'inactive',
								skipSafetyBackup
							});
						} else if (actionDialogState.action === 'migrate' && actionDialogState.slug) {
							migrateToComposerMutation.mutate({ slug: actionDialogState.slug, skipSafetyBackup });
						}
						setActionDialogState({ open: false, action: null, slug: null });
					}}
				/>
			)}

			{selectedSlugs.size > 0 && (
				<BulkActionsBar
					selectedCount={selectedSlugs.size}
					onClear={() => setSelectedSlugs(new Set())}
					actions={
						bulkProcessing
							? [
									{
										label: bulkActionProgress || 'Processing...',
										icon: Loader2,
										onClick: () => {},
										variant: 'ghost',
									},
								]
							: [
									{
										label: 'Activate',
										icon: CheckCircle2,
										onClick: () =>
											setActionDialogState({
												open: true,
												action: 'bulk-activate',
												slug: null,
											}),
									},
									{
										label: 'Deactivate',
										icon: RotateCcw,
										onClick: () =>
											setActionDialogState({
												open: true,
												action: 'bulk-deactivate',
												slug: null,
											}),
									},
									{
										label: 'Update',
										icon: ArrowUpCircle,
										onClick: () =>
											setActionDialogState({
												open: true,
												action: 'bulk-update',
												slug: null,
											}),
									},
									{
										label: 'Delete',
										icon: Trash2,
										variant: 'destructive',
										onClick: () =>
											setActionDialogState({
												open: true,
												action: 'bulk-remove',
												slug: null,
											}),
									},
								]
					}
				/>
			)}
		</div>
	);
}
