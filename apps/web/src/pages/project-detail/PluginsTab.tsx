import { useState, useRef, useEffect, FormEvent } from 'react';
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
	Github,
	Download,
	AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
}: {
	envId: number;
	open: boolean;
	onClose: () => void;
}) {
	const qc = useQueryClient();
	const [slug, setSlug] = useState('');
	const [version, setVersion] = useState('');

	const mutation = useMutation({
		mutationFn: () =>
			api.post<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${envId}/plugins`,
				{ slug: slug.trim(), version: version.trim() || undefined },
			),
		onSuccess: () => {
			toast({
				title: 'Plugin install queued',
				description: `wpackagist-plugin/${slug} will be added via composer.`,
			});
			qc.invalidateQueries({ queryKey: ['plugin-scans', envId] });
			setSlug('');
			setVersion('');
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
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle>Add Plugin via Composer</DialogTitle>
				</DialogHeader>
				<form onSubmit={handleSubmit} className='space-y-4 py-2'>
					<div className='space-y-1.5'>
						<label className='text-sm font-medium'>Plugin Slug</label>
						<Input
							placeholder='e.g. woocommerce'
							value={slug}
							onChange={e => setSlug(e.target.value)}
							disabled={mutation.isPending}
							autoFocus
						/>
						<p className='text-xs text-muted-foreground'>
							Slug from wordpress.org/plugins — will be required as{' '}
							<code className='bg-muted px-1 rounded'>
								wpackagist-plugin/slug
							</code>
						</p>
					</div>
					<div className='space-y-1.5'>
						<label className='text-sm font-medium'>
							Version constraint{' '}
							<span className='text-muted-foreground font-normal'>
								(optional)
							</span>
						</label>
						<Input
							placeholder='e.g. ^8.0 or 8.1.2'
							value={version}
							onChange={e => setVersion(e.target.value)}
							disabled={mutation.isPending}
						/>
					</div>
					<DialogFooter>
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
	const [selectedEnvId, setSelectedEnvId] = useState<number | null>(
		environments[0]?.id ?? null,
	);
	const [search, setSearch] = useState('');
	const [scanning, setScanning] = useState(false);
	const [managingJobId, setManagingJobId] = useState<string | null>(null);
	const [showAddDialog, setShowAddDialog] = useState(false);
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

	useWebSocketEvent('job:completed', data => {
		const event = data as {
			queueName: string;
			jobId?: string;
			environmentId?: number;
		};

		// Handle custom-plugins queue separately before the plugin-scans guard
		if (event.queueName === 'custom-plugins') {
			if (event.jobId != null && event.jobId === customJobIdRef.current) {
				setCustomJobId(null);
				customJobIdRef.current = null;
				qc.invalidateQueries({
					queryKey: ['env-custom-plugins', selectedEnvId],
				});
			}
			return;
		}

		if (event.queueName !== 'plugin-scans') return;

		const isScanJob =
			event.environmentId === scanningEnvIdRef.current ||
			(event.jobId != null && event.jobId === scanJobIdRef.current);
		if (isScanJob) {
			const envId = event.environmentId ?? scanningEnvIdRef.current;
			setScanning(false);
			scanningEnvIdRef.current = null;
			scanJobIdRef.current = null;
			qc.invalidateQueries({ queryKey: ['plugin-scans', envId] });
		}

		const isManageJob =
			event.jobId != null && event.jobId === managingJobIdRef.current;
		if (isManageJob) {
			setManagingJobId(null);
			managingJobIdRef.current = null;
			const envId = event.environmentId ?? selectedEnvId;
			qc.invalidateQueries({ queryKey: ['plugin-scans', envId] });
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
				setCustomJobId(null);
				customJobIdRef.current = null;
				toast({
					title: 'Custom plugin operation failed',
					description: event.error ?? 'An unexpected error occurred',
					variant: 'destructive',
				});
			}
			return;
		}

		if (event.queueName !== 'plugin-scans') return;

		const isScanJob =
			event.environmentId === scanningEnvIdRef.current ||
			(event.jobId != null && event.jobId === scanJobIdRef.current);
		if (isScanJob) {
			setScanning(false);
			scanningEnvIdRef.current = null;
			scanJobIdRef.current = null;
			toast({
				title: 'Plugin scan failed',
				description: event.error ?? 'An unexpected error occurred',
				variant: 'destructive',
			});
		}

		const isManageJob =
			event.jobId != null && event.jobId === managingJobIdRef.current;
		if (isManageJob) {
			setManagingJobId(null);
			managingJobIdRef.current = null;
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

	const { data: customCatalog = [] } = useQuery<CustomPlugin[]>({
		queryKey: ['custom-plugins'],
		queryFn: () => api.get<CustomPlugin[]>('/custom-plugins'),
	});

	const { data: envCustomPlugins = [], isLoading: isLoadingCustom } = useQuery<
		EnvironmentCustomPlugin[]
	>({
		queryKey: ['env-custom-plugins', selectedEnvId],
		enabled: !!selectedEnvId,
		queryFn: () =>
			api.get<EnvironmentCustomPlugin[]>(
				`/plugin-scans/environment/${selectedEnvId}/custom-plugins`,
			),
	});

	const installedCustomIds = new Set(
		envCustomPlugins.map(e => e.custom_plugin_id),
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
			toast({
				title: 'Plugin scan queued',
				description:
					'Results will appear automatically when the scan completes.',
			});
		},
		onError: () => toast({ title: 'Scan failed', variant: 'destructive' }),
	});

	const updateAllMutation = useMutation({
		mutationFn: () =>
			api.put<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/plugins`,
				{},
			),
		onSuccess: data => {
			const jobId = data?.bullJobId ?? null;
			setManagingJobId(jobId);
			managingJobIdRef.current = jobId;
			toast({
				title: 'Update all queued',
				description: 'All composer-managed plugins will be updated.',
			});
		},
		onError: () =>
			toast({ title: 'Failed to queue update-all', variant: 'destructive' }),
	});

	const removePluginMutation = useMutation({
		mutationFn: (slug: string) =>
			api.delete<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/plugins/${slug}`,
			),
		onSuccess: (data, slug) => {
			const jobId = data?.bullJobId ?? null;
			setManagingJobId(jobId);
			managingJobIdRef.current = jobId;
			toast({
				title: 'Remove queued',
				description: `${slug} will be removed via composer.`,
			});
		},
		onError: () =>
			toast({ title: 'Failed to queue removal', variant: 'destructive' }),
	});

	const updatePluginMutation = useMutation({
		mutationFn: (slug: string) =>
			api.put<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/plugins/${slug}`,
				{},
			),
		onSuccess: (data, slug) => {
			const jobId = data?.bullJobId ?? null;
			setManagingJobId(jobId);
			managingJobIdRef.current = jobId;
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
			toast({
				title: 'Constraint update queued',
				description: `${slug} constraint will be updated.`,
			});
		},
		onError: () =>
			toast({ title: 'Failed to update constraint', variant: 'destructive' }),
	});

	const installCustomMutation = useMutation({
		mutationFn: (customPluginId: number) =>
			api.post<{ jobExecutionId: number; bullJobId: string }>(
				`/plugin-scans/environment/${selectedEnvId}/custom-plugins/${customPluginId}`,
				{},
			),
		onSuccess: (data, id) => {
			const jobId = data?.bullJobId ?? null;
			setCustomJobId(jobId);
			customJobIdRef.current = jobId;
			toast({
				title: 'Install queued',
				description: 'Plugin will be installed via monorepo-fetcher.',
			});
		},
		onError: () => toast({ title: 'Install failed', variant: 'destructive' }),
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
			toast({
				title: 'Uninstall queued',
				description: 'Plugin will be removed via monorepo-fetcher.',
			});
		},
		onError: () => toast({ title: 'Uninstall failed', variant: 'destructive' }),
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
	const filtered = search
		? plugins.filter(
				p =>
					p.name.toLowerCase().includes(search.toLowerCase()) ||
					p.author?.toLowerCase().includes(search.toLowerCase()) ||
					p.slug.toLowerCase().includes(search.toLowerCase()),
			)
		: plugins;

	const updatesAvailable = plugins.filter(p => p.update_available).length;
	const composerManaged = plugins.filter(p => p.managed_by_composer).length;
	const isBusy = scanMutation.isPending || scanning;
	const isManaging =
		!!managingJobId ||
		updateAllMutation.isPending ||
		removePluginMutation.isPending ||
		updatePluginMutation.isPending ||
		changeConstraintMutation.isPending;

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
							onClick={() => updateAllMutation.mutate()}
							disabled={!selectedEnvId || isManaging || updatesAvailable === 0}
						>
							{updateAllMutation.isPending ? (
								<Loader2 className='h-4 w-4 mr-1.5 animate-spin' />
							) : (
								<RotateCcw className='h-4 w-4 mr-1.5' />
							)}
							Update All
						</Button>
					</>
				)}

				{latestScan && (
					<p className='text-xs text-muted-foreground ml-auto'>
						Last scanned: {new Date(latestScan.scanned_at).toLocaleString()}
					</p>
				)}
			</div>

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
					<div className='flex items-center gap-4 text-sm text-muted-foreground'>
						<span>{plugins.length} plugins total</span>
						{updatesAvailable > 0 ? (
							<span className='text-yellow-600 dark:text-yellow-400 font-medium'>
								{updatesAvailable} update{updatesAvailable !== 1 ? 's' : ''}{' '}
								available
							</span>
						) : (
							<span className='text-green-600 dark:text-green-400'>
								{plugins.length - updatesAvailable} up to date
							</span>
						)}
						{scanning && (
							<span className='flex items-center gap-1.5 text-blue-600 dark:text-blue-400'>
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
								Refreshing\u2026
							</span>
						)}
						<input
							className='ml-auto border rounded px-2 py-1 text-xs bg-background'
							placeholder='Filter plugins\u2026'
							value={search}
							onChange={e => setSearch(e.target.value)}
						/>
					</div>

					<div className='border rounded-lg overflow-hidden'>
						<table className='w-full text-sm'>
							<thead className='border-b bg-muted/40'>
								<tr>
									<th className='text-left px-4 py-3 font-medium'>Plugin</th>
									<th className='text-left px-4 py-3 font-medium'>Version</th>
									<th className='text-left px-4 py-3 font-medium'>Author</th>
									<th className='text-left px-4 py-3 font-medium'>Status</th>
									{isBedrock && (
										<th className='text-left px-4 py-3 font-medium'>
											Composer
										</th>
									)}
									{isBedrock && <th className='w-24 px-4 py-3 font-medium' />}
								</tr>
							</thead>
							<tbody className='divide-y'>
								{filtered.map((p, i) => (
									<tr key={`${p.slug}-${i}`} className='hover:bg-muted/20'>
										<td className='px-4 py-3'>
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
											{p.update_available ? (
												<span className='flex items-center gap-1 text-yellow-600 dark:text-yellow-400 text-xs font-medium'>
													<ArrowUpCircle className='h-3.5 w-3.5 shrink-0' />
													{p.latest_version ?? 'Update available'}
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
												) : (
													<span className='text-xs text-muted-foreground'>
														manual
													</span>
												)}
											</td>
										)}
										{isBedrock && (
											<td className='px-4 py-3'>
												{p.managed_by_composer && (
													<div className='flex items-center gap-1'>
														<Button
															size='sm'
															variant='ghost'
															className='h-7 px-2 text-xs text-muted-foreground'
															disabled={isManaging}
															onClick={() => {
																setEditConstraintPlugin(p);
															}}
															title='Edit version constraint'
														>
															<Pencil className='h-3 w-3' />
														</Button>
														{p.update_available && (
															<Button
																size='sm'
																variant='ghost'
																className='h-7 px-2 text-xs'
																disabled={isManaging}
																onClick={() =>
																	updatePluginMutation.mutate(p.slug)
																}
																title='Update via composer'
															>
																<RotateCcw className='h-3 w-3' />
															</Button>
														)}
														<Button
															size='sm'
															variant='ghost'
															className='h-7 px-2 text-xs text-destructive hover:text-destructive'
															disabled={isManaging}
															onClick={() =>
																removePluginMutation.mutate(p.slug)
															}
															title='Remove via composer'
														>
															<Trash2 className='h-3 w-3' />
														</Button>
													</div>
												)}
											</td>
										)}
									</tr>
								))}
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

			{/* Custom GitHub Plugins section */}
			{(customCatalog.length > 0 || envCustomPlugins.length > 0) && (
				<div className='border rounded-lg overflow-hidden'>
					<div className='flex items-center gap-2 px-4 py-2.5 border-b bg-muted/20'>
						<Github className='h-4 w-4 text-muted-foreground' />
						<span className='text-sm font-medium'>Custom GitHub Plugins</span>
						{envCustomPlugins.length > 0 && (
							<Badge variant='secondary' className='text-xs'>
								{envCustomPlugins.length}
							</Badge>
						)}
						<Button
							size='sm'
							variant='ghost'
							className='ml-auto h-7 px-2 text-xs'
							onClick={() => checkVersionsMutation.mutate()}
							disabled={
								checkVersionsMutation.isPending ||
								isLoadingCustom ||
								envCustomPlugins.length === 0
							}
							title='Check latest versions on GitHub'
						>
							{checkVersionsMutation.isPending ? (
								<Loader2 className='h-3 w-3 mr-1.5 animate-spin' />
							) : (
								<RefreshCw className='h-3 w-3 mr-1.5' />
							)}
							Check Versions
						</Button>
					</div>
					<table className='w-full text-sm'>
						<thead className='border-b bg-muted/30'>
							<tr>
								<th className='text-left px-4 py-2.5 font-medium text-xs'>
									Plugin
								</th>
								<th className='text-left px-4 py-2.5 font-medium text-xs'>
									Installed
								</th>
								<th className='text-left px-4 py-2.5 font-medium text-xs'>
									Latest
								</th>
								<th className='w-24 px-4 py-2.5' />
							</tr>
						</thead>
						<tbody className='divide-y'>
							{customCatalog.map(cp => {
								const envEntry = envCustomPlugins.find(
									e => e.custom_plugin_id === cp.id,
								);
								const isInstalled = !!envEntry;
								const isOutdated =
									envEntry?.installed_version != null &&
									envEntry?.latest_version != null &&
									envEntry.installed_version !== envEntry.latest_version;
								const isThisJobPending = !!customJobId;
								return (
									<tr key={cp.id} className='hover:bg-muted/10'>
										<td className='px-4 py-2.5'>
											<div className='flex items-center gap-2'>
												<span className='font-medium'>{cp.name}</span>
												<Badge variant='outline' className='text-xs capitalize'>
													{cp.type}
												</Badge>
												{isOutdated && (
													<Badge className='text-xs bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30'>
														<AlertTriangle className='h-2.5 w-2.5 mr-1' />
														Update available
													</Badge>
												)}
											</div>
											<p className='text-xs text-muted-foreground font-mono mt-0.5'>
												{cp.slug}
											</p>
										</td>
										<td className='px-4 py-2.5 font-mono text-xs text-muted-foreground'>
											{isInstalled
												? (envEntry.installed_version ?? 'dev')
												: '—'}
										</td>
										<td className='px-4 py-2.5 font-mono text-xs text-muted-foreground'>
											{isInstalled ? (envEntry.latest_version ?? '—') : '—'}
										</td>
										<td className='px-4 py-2.5'>
											{isInstalled ? (
												<Button
													size='sm'
													variant='ghost'
													className='h-7 px-2 text-xs text-destructive hover:text-destructive'
													disabled={isThisJobPending}
													onClick={() => uninstallCustomMutation.mutate(cp.id)}
													title='Uninstall'
												>
													{isThisJobPending ? (
														<Loader2 className='h-3 w-3 animate-spin' />
													) : (
														<Trash2 className='h-3 w-3' />
													)}
												</Button>
											) : (
												<Button
													size='sm'
													variant='ghost'
													className='h-7 px-2 text-xs'
													disabled={isThisJobPending}
													onClick={() => installCustomMutation.mutate(cp.id)}
													title='Install'
												>
													{isThisJobPending ? (
														<Loader2 className='h-3 w-3 animate-spin' />
													) : (
														<Download className='h-3 w-3' />
													)}
												</Button>
											)}
										</td>
									</tr>
								);
							})}
							{customCatalog.length === 0 && (
								<tr>
									<td
										colSpan={4}
										className='px-4 py-6 text-center text-sm text-muted-foreground'
									>
										No custom plugins registered. Add them in Settings → Custom
										GitHub Plugins.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
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
				/>
			)}

			{/* Auto-update schedule (Bedrock only) */}
			{isBedrock && selectedEnvId && (
				<PluginUpdateScheduleCard envId={selectedEnvId} />
			)}
		</div>
	);
}
