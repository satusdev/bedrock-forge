import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import type {
	ServerSummary,
	EnvironmentSummary,
	FindingRow,
	FindingsResponse,
	Severity,
	SecurityFinding,
} from '../types';
import { SEVERITY_LEVELS, SCAN_TYPE_LABELS } from '../constants';
import { FindingItem, AcknowledgeFindingDialog } from '../components';
import { HardenDialog } from '../dialogs';

export function FindingsTab({
	servers,
	environments,
}: {
	servers: ServerSummary[];
	environments: EnvironmentSummary[];
}) {
	const queryClient = useQueryClient();
	const [sevFilter, setSevFilter] = useState<Severity[]>([]);
	const [sourceFilter, setSourceFilter] = useState('');
	const [scanTypeFilter, setScanTypeFilter] = useState('all');
	const [showAcked, setShowAcked] = useState(false);
	const [page, setPage] = useState(1);
	const [ackDialog, setAckDialog] = useState<FindingRow | null>(null);
	const [fixDialog, setFixDialog] = useState<{
		targetType: 'server' | 'environment';
		targetId: number;
		targetName: string;
		initialActions: string[];
	} | null>(null);

	const params = new URLSearchParams({ page: String(page), limit: '50' });
	if (sevFilter.length > 0) params.set('severity', sevFilter.join(','));
	if (sourceFilter.startsWith('server:'))
		params.set('server_id', sourceFilter.slice(7));
	if (sourceFilter.startsWith('environment:'))
		params.set('environment_id', sourceFilter.slice(12));
	if (scanTypeFilter !== 'all') params.set('scan_type', scanTypeFilter);
	if (showAcked) params.set('acknowledged', 'true');

	const { data, isFetching } = useQuery<FindingsResponse>({
		queryKey: [
			'security',
			'findings',
			sevFilter,
			sourceFilter,
			scanTypeFilter,
			showAcked,
			page,
		],
		queryFn: () => api.get(`/security/findings?${params}`),
	});

	const unAckMutation = useMutation({
		mutationFn: (row: FindingRow) =>
			api.delete('/security/findings/ack', {
				scope_key: row.scope_key,
				category: row.category,
				title: row.title,
			}),
		onSuccess: () => {
			toast({ title: 'Acknowledgement removed' });
			void queryClient.invalidateQueries({
				queryKey: ['security', 'findings'],
			});
		},
		onError: () =>
			toast({
				title: 'Failed to remove acknowledgement',
				variant: 'destructive',
			}),
	});

	const toggleSev = (s: Severity) => {
		setSevFilter(prev =>
			prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s],
		);
		setPage(1);
	};

	const sevColors: Record<Severity, string> = {
		critical:
			'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300',
		high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-300',
		medium:
			'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-300',
		low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300',
		info: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-gray-300',
	};

	return (
		<div className='space-y-4'>
			<div className='flex flex-wrap gap-3 items-end'>
				<div className='space-y-1'>
					<Label className='text-xs'>Severity</Label>
					<div className='flex gap-1 flex-wrap'>
						{SEVERITY_LEVELS.map(s => (
							<button
								key={s}
								onClick={() => toggleSev(s)}
								className={`px-2 py-0.5 rounded text-xs font-semibold border transition-opacity ${sevColors[s]} ${sevFilter.length > 0 && !sevFilter.includes(s) ? 'opacity-40' : ''}`}
							>
								{s.toUpperCase()}
							</button>
						))}
						{sevFilter.length > 0 && (
							<button
								onClick={() => {
									setSevFilter([]);
									setPage(1);
								}}
								className='px-2 py-0.5 rounded text-xs border border-muted text-muted-foreground hover:text-foreground'
							>
								Clear
							</button>
						)}
					</div>
				</div>

				<div className='space-y-1'>
					<Label className='text-xs'>Source</Label>
					<Select
						value={sourceFilter || 'all'}
						onValueChange={v => {
							setSourceFilter(v === 'all' ? '' : v);
							setPage(1);
						}}
					>
						<SelectTrigger className='w-52 h-8 text-xs'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='all'>All sources</SelectItem>
							{servers.length > 0 && (
								<>
									<div className='px-2 pt-1.5 pb-0.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide'>
										Servers
									</div>
									{servers.map(s => (
										<SelectItem key={`server:${s.id}`} value={`server:${s.id}`}>
											{s.name}
										</SelectItem>
									))}
								</>
							)}
							{environments.length > 0 && (
								<>
									<div className='px-2 pt-1.5 pb-0.5 text-[10px] text-muted-foreground font-semibold uppercase tracking-wide'>
										Environments
									</div>
									{environments.map(e => (
										<SelectItem
											key={`environment:${e.id}`}
											value={`environment:${e.id}`}
										>
											{e.project.name} / {e.type}
										</SelectItem>
									))}
								</>
							)}
						</SelectContent>
					</Select>
				</div>

				<div className='space-y-1'>
					<Label className='text-xs'>Scan type</Label>
					<Select
						value={scanTypeFilter}
						onValueChange={v => {
							setScanTypeFilter(v);
							setPage(1);
						}}
					>
						<SelectTrigger className='w-44 h-8 text-xs'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='all'>All types</SelectItem>
							{Object.entries(SCAN_TYPE_LABELS).map(([v, label]) => (
								<SelectItem key={v} value={v}>
									{label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className='flex items-center gap-2 pb-1'>
					<Switch
						checked={showAcked}
						onCheckedChange={v => {
							setShowAcked(v);
							setPage(1);
						}}
						id='show-acked'
					/>
					<Label htmlFor='show-acked' className='text-xs cursor-pointer'>
						Include reviewed
					</Label>
				</div>
			</div>

			<div className='flex items-center justify-between text-xs text-muted-foreground'>
				<span>
					{isFetching
						? 'Loading…'
						: `${data?.total ?? 0} finding${(data?.total ?? 0) !== 1 ? 's' : ''}${showAcked ? ' (including reviewed)' : ''}`}
				</span>
			</div>

			{data?.data.length === 0 && !isFetching && (
				<div className='text-center py-16 text-muted-foreground'>
					<ShieldCheck className='h-12 w-12 mx-auto mb-3 opacity-30 text-green-500' />
					<p className='font-medium'>No open findings</p>
					<p className='text-sm mt-1'>
						All findings have been reviewed or no scans have been run yet.
					</p>
				</div>
			)}

			<div className='space-y-2'>
				{data?.data.map(row => (
					<FindingItem
						key={`${row.scan_id}-${row.finding_id}`}
						finding={{
							id: row.finding_id,
							severity: row.severity,
							category: row.category as SecurityFinding['category'],
							title: row.title,
							description: row.description,
							remediation: row.remediation,
							resource: row.resource,
							metadata: row.metadata,
						}}
						row={row}
						targetType={row.server_id ? 'server' : 'environment'}
						onFix={actionId =>
							setFixDialog(
								row.server_id
									? {
											targetType: 'server',
											targetId: row.server_id,
											targetName: row.server_name ?? '',
											initialActions: [actionId],
										}
									: {
											targetType: 'environment',
											targetId: row.environment_id!,
											targetName: `${row.project_name ?? ''} / ${row.environment_type ?? ''}`,
											initialActions: [actionId],
										},
							)
						}
						onAck={r => setAckDialog(r)}
						onUnAck={r => unAckMutation.mutate(r)}
					/>
				))}
			</div>

			{data && data.totalPages > 1 && (
				<div className='flex items-center justify-between text-xs text-muted-foreground'>
					<span>
						Page {page} of {data.totalPages}
					</span>
					<div className='flex gap-2'>
						<Button
							variant='outline'
							size='sm'
							className='h-7 text-xs'
							disabled={page <= 1}
							onClick={() => setPage(p => p - 1)}
						>
							Previous
						</Button>
						<Button
							variant='outline'
							size='sm'
							className='h-7 text-xs'
							disabled={page >= data.totalPages}
							onClick={() => setPage(p => p + 1)}
						>
							Next
						</Button>
					</div>
				</div>
			)}

			{fixDialog && (
				<HardenDialog
					open
					onClose={() => setFixDialog(null)}
					targetType={fixDialog.targetType}
					targetId={fixDialog.targetId}
					targetName={fixDialog.targetName}
					initialActions={fixDialog.initialActions}
				/>
			)}
			<AcknowledgeFindingDialog
				open={ackDialog !== null}
				onClose={() => setAckDialog(null)}
				finding={ackDialog}
			/>
		</div>
	);
}
