import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	GitBranch,
	CheckCircle2,
	XCircle,
	AlertTriangle,
	RefreshCw,
	Loader2,
	Shield,
	Info,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
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
import { Skeleton } from '@/components/ui/skeleton';

interface Environment {
	id: number;
	type: string;
	url?: string;
	is_baseline?: boolean;
}

interface PluginDiff {
	slug: string;
	name?: string;
	baselineVersion: string | null;
	envVersion: string | null;
	status: 'match' | 'mismatch' | 'missing' | 'extra';
}

interface PhpDiff {
	key: string;
	baselineValue: string;
	envValue: string;
}

interface EnvDiff {
	environmentId: number;
	type: string;
	url: string;
	scannedAt: string | null;
	pluginDiffs: PluginDiff[];
	phpDiffs: PhpDiff[];
	warnWpDebugEnabled: boolean;
}

interface DriftResult {
	baselineEnvId: number | null;
	baselineType?: string;
	baselineUrl?: string;
	baselineScannedAt?: string | null;
	message?: string;
	diffs: EnvDiff[];
}

const STATUS_ICON = {
	match: <CheckCircle2 className='h-3.5 w-3.5 text-green-500' />,
	mismatch: <AlertTriangle className='h-3.5 w-3.5 text-amber-500' />,
	missing: <XCircle className='h-3.5 w-3.5 text-red-500' />,
	extra: <Info className='h-3.5 w-3.5 text-blue-500' />,
};

const STATUS_BADGE_CLASS = {
	match: 'border-green-500 text-green-600',
	mismatch: 'border-amber-500 text-amber-600',
	missing: 'border-red-500 text-red-600',
	extra: 'border-blue-500 text-blue-600',
};

function DiffSummary({ diffs }: { diffs: PluginDiff[] }) {
	const counts = { mismatch: 0, missing: 0, extra: 0, match: 0 };
	for (const d of diffs) counts[d.status]++;
	return (
		<div className='flex items-center gap-2 flex-wrap'>
			{counts.mismatch > 0 && (
				<Badge
					variant='outline'
					className='border-amber-500 text-amber-600 text-xs'
				>
					{counts.mismatch} mismatch
				</Badge>
			)}
			{counts.missing > 0 && (
				<Badge
					variant='outline'
					className='border-red-500 text-red-600 text-xs'
				>
					{counts.missing} missing
				</Badge>
			)}
			{counts.extra > 0 && (
				<Badge
					variant='outline'
					className='border-blue-500 text-blue-600 text-xs'
				>
					{counts.extra} extra
				</Badge>
			)}
			{counts.mismatch === 0 && counts.missing === 0 && counts.extra === 0 && (
				<Badge
					variant='outline'
					className='border-green-500 text-green-600 text-xs'
				>
					All match
				</Badge>
			)}
		</div>
	);
}

export function DriftTab({
	projectId,
	environments,
}: {
	projectId: number;
	environments: Environment[];
}) {
	const qc = useQueryClient();
	const [expandedEnv, setExpandedEnv] = useState<number | null>(null);
	const [showMatchingPlugins, setShowMatchingPlugins] = useState(false);

	const {
		data: drift,
		isLoading,
		refetch,
	} = useQuery<DriftResult>({
		queryKey: ['project-drift', projectId],
		queryFn: () => api.get(`/projects/${projectId}/drift`),
		staleTime: 30_000,
	});

	const setBaselineMutation = useMutation({
		mutationFn: (environmentId: number) =>
			api.post(`/projects/${projectId}/drift/set-baseline`, { environmentId }),
		onSuccess: () => {
			toast({ title: 'Baseline updated' });
			void refetch();
			qc.invalidateQueries({ queryKey: ['project', projectId] });
		},
		onError: () =>
			toast({ title: 'Failed to set baseline', variant: 'destructive' }),
	});

	const clearBaselineMutation = useMutation({
		mutationFn: () => api.delete(`/projects/${projectId}/drift/baseline`),
		onSuccess: () => {
			toast({ title: 'Baseline cleared' });
			void refetch();
		},
		onError: () =>
			toast({ title: 'Failed to clear baseline', variant: 'destructive' }),
	});

	const baselineEnv = environments.find(e => e.id === drift?.baselineEnvId);

	if (isLoading) {
		return (
			<div className='space-y-4'>
				<Skeleton className='h-32 w-full' />
				<Skeleton className='h-48 w-full' />
			</div>
		);
	}

	return (
		<div className='space-y-6'>
			{/* Baseline Controls */}
			<Card>
				<CardHeader className='pb-3'>
					<CardTitle className='flex items-center gap-2 text-base'>
						<Shield className='h-4 w-4' />
						Baseline Environment
					</CardTitle>
					<CardDescription>
						Designate one environment as the canonical reference for plugin
						versions and PHP settings. All other environments are compared
						against it.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='flex flex-wrap items-center gap-3'>
						<Select
							value={drift?.baselineEnvId ? String(drift.baselineEnvId) : ''}
							onValueChange={v => setBaselineMutation.mutate(Number(v))}
							disabled={setBaselineMutation.isPending}
						>
							<SelectTrigger className='w-56'>
								<SelectValue placeholder='Pick baseline environment' />
							</SelectTrigger>
							<SelectContent>
								{environments.map(e => (
									<SelectItem key={e.id} value={String(e.id)}>
										<span className='capitalize'>{e.type}</span>
										<span className='text-muted-foreground text-xs ml-1'>
											— {e.url}
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{baselineEnv && (
							<>
								<Badge
									variant='outline'
									className='border-green-500 text-green-600'
								>
									<CheckCircle2 className='h-3 w-3 mr-1' />
									{baselineEnv.type} is baseline
								</Badge>
								{drift?.baselineScannedAt && (
									<span className='text-xs text-muted-foreground'>
										Scanned{' '}
										{new Date(drift.baselineScannedAt).toLocaleDateString()}
									</span>
								)}
								<Button
									variant='ghost'
									size='sm'
									onClick={() => clearBaselineMutation.mutate()}
									disabled={clearBaselineMutation.isPending}
									className='text-muted-foreground'
								>
									Clear baseline
								</Button>
							</>
						)}

						<Button
							variant='ghost'
							size='sm'
							onClick={() => void refetch()}
							disabled={isLoading}
						>
							<RefreshCw className='h-3.5 w-3.5 mr-1' />
							Refresh
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* No baseline message */}
			{!drift?.baselineEnvId && (
				<p className='text-sm text-muted-foreground text-center py-8'>
					{drift?.message ??
						'Select a baseline environment above to start comparing.'}
				</p>
			)}

			{/* Drift Results */}
			{drift?.baselineEnvId != null && drift.diffs.length === 0 && (
				<p className='text-sm text-muted-foreground text-center py-8'>
					No other environments to compare against the baseline.
				</p>
			)}

			{drift?.diffs.map(envDiff => {
				const nonMatchPlugins = envDiff.pluginDiffs.filter(
					p => p.status !== 'match',
				);
				const isExpanded = expandedEnv === envDiff.environmentId;

				return (
					<Card
						key={envDiff.environmentId}
						className={isExpanded ? 'ring-1 ring-primary' : ''}
					>
						<CardHeader className='pb-2'>
							<div className='flex items-start justify-between gap-3'>
								<div className='flex items-center gap-2 min-w-0'>
									<GitBranch className='h-4 w-4 shrink-0 text-muted-foreground' />
									<div>
										<span className='font-medium capitalize text-sm'>
											{envDiff.type}
										</span>
										<span className='text-xs text-muted-foreground ml-2'>
											{envDiff.url}
										</span>
										{envDiff.scannedAt && (
											<span className='text-xs text-muted-foreground ml-2'>
												(scanned{' '}
												{new Date(envDiff.scannedAt).toLocaleDateString()})
											</span>
										)}
									</div>
								</div>
								<div className='flex items-center gap-2 shrink-0'>
									{envDiff.warnWpDebugEnabled && (
										<Badge variant='destructive' className='text-xs'>
											WP_DEBUG ON
										</Badge>
									)}
									<DiffSummary diffs={envDiff.pluginDiffs} />
									<Button
										variant='ghost'
										size='sm'
										onClick={() =>
											setExpandedEnv(isExpanded ? null : envDiff.environmentId)
										}
									>
										{isExpanded ? 'Collapse' : 'Details'}
									</Button>
								</div>
							</div>
						</CardHeader>

						{isExpanded && (
							<CardContent className='space-y-4 pt-0'>
								{/* Plugin Diff Table */}
								{envDiff.pluginDiffs.length > 0 && (
									<div>
										<div className='flex items-center justify-between mb-2'>
											<h4 className='text-sm font-medium'>
												Plugins ({envDiff.pluginDiffs.length})
											</h4>
											<Button
												variant='ghost'
												size='sm'
												className='text-xs h-6'
												onClick={() => setShowMatchingPlugins(v => !v)}
											>
												{showMatchingPlugins ? 'Hide matching' : 'Show all'}
											</Button>
										</div>
										<div className='border rounded-md overflow-auto max-h-64'>
											<table className='w-full text-xs'>
												<thead className='bg-muted'>
													<tr>
														<th className='text-left px-3 py-2 font-medium'>
															Plugin
														</th>
														<th className='text-left px-3 py-2 font-medium'>
															Baseline
														</th>
														<th className='text-left px-3 py-2 font-medium'>
															This Env
														</th>
														<th className='text-left px-3 py-2 font-medium'>
															Status
														</th>
													</tr>
												</thead>
												<tbody>
													{envDiff.pluginDiffs
														.filter(
															p => showMatchingPlugins || p.status !== 'match',
														)
														.map(p => (
															<tr
																key={p.slug}
																className='border-t hover:bg-muted/30'
															>
																<td className='px-3 py-1.5 font-mono break-all'>
																	{p.name || p.slug}
																	{p.name && (
																		<span className='text-muted-foreground ml-1 text-[10px]'>
																			({p.slug})
																		</span>
																	)}
																</td>
																<td className='px-3 py-1.5 font-mono'>
																	{p.baselineVersion ?? '—'}
																</td>
																<td className='px-3 py-1.5 font-mono'>
																	{p.envVersion ?? '—'}
																</td>
																<td className='px-3 py-1.5'>
																	<span className='flex items-center gap-1'>
																		{STATUS_ICON[p.status]}
																		<Badge
																			variant='outline'
																			className={`text-[10px] ${STATUS_BADGE_CLASS[p.status]}`}
																		>
																			{p.status}
																		</Badge>
																	</span>
																</td>
															</tr>
														))}
												</tbody>
											</table>
										</div>
									</div>
								)}

								{/* PHP Settings diff */}
								{envDiff.phpDiffs.length > 0 && (
									<div>
										<h4 className='text-sm font-medium mb-2'>
											PHP Settings ({envDiff.phpDiffs.length} difference
											{envDiff.phpDiffs.length !== 1 ? 's' : ''})
										</h4>
										<div className='border rounded-md overflow-auto'>
											<table className='w-full text-xs'>
												<thead className='bg-muted'>
													<tr>
														<th className='text-left px-3 py-2 font-medium'>
															Setting
														</th>
														<th className='text-left px-3 py-2 font-medium'>
															Baseline
														</th>
														<th className='text-left px-3 py-2 font-medium'>
															This Env
														</th>
													</tr>
												</thead>
												<tbody>
													{envDiff.phpDiffs.map(d => (
														<tr
															key={d.key}
															className='border-t hover:bg-muted/30'
														>
															<td className='px-3 py-1.5 font-mono'>{d.key}</td>
															<td className='px-3 py-1.5 font-mono text-green-600 dark:text-green-400'>
																{d.baselineValue || '—'}
															</td>
															<td className='px-3 py-1.5 font-mono text-amber-600 dark:text-amber-400'>
																{d.envValue || '—'}
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									</div>
								)}

								{nonMatchPlugins.length === 0 &&
									envDiff.phpDiffs.length === 0 &&
									!envDiff.warnWpDebugEnabled && (
										<p className='text-sm text-muted-foreground py-2 flex items-center gap-2'>
											<CheckCircle2 className='h-4 w-4 text-green-500' />
											No differences found — this environment matches the
											baseline.
										</p>
									)}
							</CardContent>
						)}
					</Card>
				);
			})}
		</div>
	);
}
