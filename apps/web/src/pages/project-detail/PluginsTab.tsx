import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	ScanLine,
	RefreshCw,
	ArrowUpCircle,
	CheckCircle2,
	ExternalLink,
	Loader2,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useWebSocketEvent, useSubscribeEnvironment } from '@/lib/websocket';

interface Environment {
	id: number;
	type: string;
	server: { name: string };
}

/**
 * Matches the exact JSON output of apps/worker/scripts/plugin-scan.php.
 * `active` is absent — the PHP script cannot determine activation status
 * without WordPress DB access.
 */
interface Plugin {
	slug: string;
	name: string;
	version: string;
	latest_version: string | null;
	update_available: boolean;
	author: string | null;
	plugin_uri: string | null;
	description: string | null;
}

interface PluginScan {
	id: number;
	plugins: Plugin[];
	scanned_at: string;
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
	// Track whether a scan is in-flight so we can show a persistent spinner
	const [scanning, setScanning] = useState(false);
	// Track which env the in-flight scan belongs to (user may switch envs)
	const scanningEnvIdRef = useRef<number | null>(null);
	// Track the BullMQ job ID so we can match WS events even if environmentId is missing
	const scanJobIdRef = useRef<string | null>(null);

	// Subscribe to the selected environment's WebSocket room
	useSubscribeEnvironment(selectedEnvId);

	// When a plugin-scan job completes via WebSocket, refresh results immediately
	useWebSocketEvent('job:completed', data => {
		const event = data as {
			queueName: string;
			jobId?: string;
			environmentId?: number;
		};
		const isOurJob =
			event.queueName === 'plugin-scans' &&
			(event.environmentId === scanningEnvIdRef.current ||
				(event.jobId != null && event.jobId === scanJobIdRef.current));
		if (isOurJob) {
			const envId = event.environmentId ?? scanningEnvIdRef.current;
			setScanning(false);
			scanningEnvIdRef.current = null;
			scanJobIdRef.current = null;
			qc.invalidateQueries({ queryKey: ['plugin-scans', envId] });
		}
	});

	useWebSocketEvent('job:failed', data => {
		const event = data as {
			queueName: string;
			jobId?: string;
			environmentId?: number;
			error?: string;
		};
		const isOurJob =
			event.queueName === 'plugin-scans' &&
			(event.environmentId === scanningEnvIdRef.current ||
				(event.jobId != null && event.jobId === scanJobIdRef.current));
		if (isOurJob) {
			setScanning(false);
			scanningEnvIdRef.current = null;
			scanJobIdRef.current = null;
			toast({
				title: 'Plugin scan failed',
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
		// Polling fallback: recover if a WS event was missed or the socket dropped
		refetchInterval: 15_000,
	});

	const latestScan = scans?.items[0];
	// Timestamp set when a scan is enqueued — used to detect newer results via polling
	const scanStartedAtRef = useRef<number>(0);

	// Polling fallback: if scanning state is stuck and a newer scan result arrived
	// (from the 15s poll), clear the spinner. Handles missed WS events.
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

	if (environments.length === 0) {
		return (
			<div className='text-center py-12 text-muted-foreground'>
				<ScanLine className='h-10 w-10 mx-auto mb-3 opacity-40' />
				<p className='font-medium'>No environments configured</p>
				<p className='text-sm mt-1'>Add an environment first to scan plugins</p>
			</div>
		);
	}

	const plugins: Plugin[] = Array.isArray(latestScan?.plugins)
		? (latestScan.plugins as Plugin[])
		: [];
	const filtered = search
		? plugins.filter(
				p =>
					p.name.toLowerCase().includes(search.toLowerCase()) ||
					p.author?.toLowerCase().includes(search.toLowerCase()) ||
					p.slug.toLowerCase().includes(search.toLowerCase()),
			)
		: plugins;

	const updatesAvailable = plugins.filter(p => p.update_available).length;
	const upToDate = plugins.length - updatesAvailable;
	const isBusy = scanMutation.isPending || scanning;

	return (
		<div className='space-y-4'>
			<div className='flex flex-wrap items-center gap-3'>
				<Select
					value={selectedEnvId?.toString()}
					onValueChange={v => {
						const newEnvId = Number(v);
						setSelectedEnvId(newEnvId);
						setSearch('');
						// Hide spinner when leaving the scanned env; keep refs so WS handler
						// can still invalidate the cache when the job finishes.
						if (scanningEnvIdRef.current !== newEnvId) {
							setScanning(false);
						}
					}}
				>
					<SelectTrigger className='w-56'>
						<SelectValue placeholder='Select environment…' />
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
						? 'Scanning…'
						: scanMutation.isPending
							? 'Queuing…'
							: 'Scan Now'}
				</Button>

				{latestScan && (
					<p className='text-xs text-muted-foreground'>
						Last scanned: {new Date(latestScan.scanned_at).toLocaleString()}
					</p>
				)}
			</div>

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
					<p className='font-medium'>Scan in progress…</p>
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
								{upToDate} up to date
							</span>
						)}
						{scanning && (
							<span className='flex items-center gap-1.5 text-blue-600 dark:text-blue-400'>
								<Loader2 className='h-3.5 w-3.5 animate-spin' />
								Refreshing…
							</span>
						)}
						<input
							className='ml-auto border rounded px-2 py-1 text-xs bg-background'
							placeholder='Filter plugins…'
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
									<th className='text-left px-4 py-3 font-medium'>Updates</th>
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
										</td>
										<td className='px-4 py-3 text-muted-foreground font-mono text-xs'>
											{p.version}
										</td>
										<td className='px-4 py-3 text-muted-foreground'>
											{p.author ?? '—'}
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
		</div>
	);
}
