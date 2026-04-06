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
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

	useSubscribeEnvironment(selectedEnvId);

	useWebSocketEvent('job:completed', data => {
		const event = data as {
			queueName: string;
			jobId?: string;
			environmentId?: number;
		};
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
		</div>
	);
}
