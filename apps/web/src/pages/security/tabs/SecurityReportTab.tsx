import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import {
	ExecutionLogPanel,
	ExpandLogButton,
} from '@/components/ui/execution-log-panel';
import type {
	ServerSummary,
	EnvironmentSummary,
	ReportChannel,
	SecurityReportExecution,
} from '../types';

function ReportStatusBadge({ status }: { status: string }) {
	if (status === 'completed')
		return (
			<Badge variant='success' className='gap-1'>
				<CheckCircle2 className='h-3 w-3' />
				Completed
			</Badge>
		);
	if (status === 'failed')
		return (
			<Badge variant='destructive' className='gap-1'>
				<XCircle className='h-3 w-3' />
				Failed
			</Badge>
		);
	if (status === 'active')
		return (
			<Badge variant='info' className='gap-1'>
				<Loader2 className='h-3 w-3 animate-spin' />
				Running
			</Badge>
		);
	return (
		<Badge variant='secondary' className='gap-1'>
			<Clock className='h-3 w-3' />
			Queued
		</Badge>
	);
}

export function SecurityReportTab({
	servers,
	environments,
}: {
	servers: ServerSummary[];
	environments: EnvironmentSummary[];
}) {
	const queryClient = useQueryClient();
	const [selectedServerIds, setSelectedServerIds] = useState<Set<number>>(
		new Set(),
	);
	const [selectedEnvIds, setSelectedEnvIds] = useState<Set<number>>(new Set());
	const [selectedChannelIds, setSelectedChannelIds] = useState<Set<number>>(
		new Set(),
	);
	const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

	const { data: channels = [] } = useQuery<ReportChannel[]>({
		queryKey: ['reports', 'channels'],
		queryFn: () => api.get('/reports/channels'),
	});

	const { data: history = [] } = useQuery<SecurityReportExecution[]>({
		queryKey: ['security', 'report', 'history'],
		queryFn: () => api.get('/security/report/history'),
		refetchInterval: 8_000,
	});

	const generateMutation = useMutation({
		mutationFn: (payload: {
			serverIds?: number[];
			environmentIds?: number[];
			channelIds?: number[];
		}) => api.post('/security/report', payload),
		onSuccess: () => {
			toast({ title: 'Security report queued' });
			void queryClient.invalidateQueries({
				queryKey: ['security', 'report', 'history'],
			});
		},
		onError: () =>
			toast({ title: 'Failed to queue report', variant: 'destructive' }),
	});

	const toggle = (set: Set<number>, id: number): Set<number> => {
		const next = new Set(set);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		return next;
	};

	const handleGenerate = () => {
		generateMutation.mutate({
			serverIds:
				selectedServerIds.size > 0 ? [...selectedServerIds] : undefined,
			environmentIds: selectedEnvIds.size > 0 ? [...selectedEnvIds] : undefined,
			channelIds:
				selectedChannelIds.size > 0 ? [...selectedChannelIds] : undefined,
		});
	};

	const activeChannels = channels.filter(c => c.active && c.has_token);

	return (
		<div className='space-y-6'>
			<div className='grid gap-4 md:grid-cols-2'>
				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm'>Servers</CardTitle>
					</CardHeader>
					<CardContent>
						{servers.length === 0 ? (
							<p className='text-sm text-muted-foreground'>
								No servers available
							</p>
						) : (
							<div className='flex flex-wrap gap-2'>
								{servers.map(s => (
									<button
										key={s.id}
										onClick={() =>
											setSelectedServerIds(prev => toggle(prev, s.id))
										}
										className={`text-xs px-2 py-1 rounded border transition-colors ${
											selectedServerIds.has(s.id)
												? 'bg-primary text-primary-foreground border-primary'
												: 'border-border bg-background hover:bg-muted'
										}`}
									>
										{s.name}
									</button>
								))}
							</div>
						)}
						{selectedServerIds.size === 0 && servers.length > 0 && (
							<p className='text-xs text-muted-foreground mt-2'>
								Leave empty to include all servers
							</p>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader className='pb-2'>
						<CardTitle className='text-sm'>Environments</CardTitle>
					</CardHeader>
					<CardContent>
						{environments.length === 0 ? (
							<p className='text-sm text-muted-foreground'>
								No environments available
							</p>
						) : (
							<div className='flex flex-wrap gap-2'>
								{environments.map(e => (
									<button
										key={e.id}
										onClick={() =>
											setSelectedEnvIds(prev => toggle(prev, e.id))
										}
										className={`text-xs px-2 py-1 rounded border transition-colors ${
											selectedEnvIds.has(e.id)
												? 'bg-primary text-primary-foreground border-primary'
												: 'border-border bg-background hover:bg-muted'
										}`}
									>
										{e.project.name} · {e.type}
									</button>
								))}
							</div>
						)}
						{selectedEnvIds.size === 0 && environments.length > 0 && (
							<p className='text-xs text-muted-foreground mt-2'>
								Leave empty to include all environments
							</p>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader className='pb-2'>
					<CardTitle className='text-sm'>Slack Channels</CardTitle>
				</CardHeader>
				<CardContent>
					{activeChannels.length === 0 ? (
						<p className='text-sm text-muted-foreground'>
							No active Slack channels configured
						</p>
					) : (
						<div className='flex flex-wrap gap-2'>
							{activeChannels.map(c => (
								<button
									key={c.id}
									onClick={() =>
										setSelectedChannelIds(prev => toggle(prev, c.id))
									}
									className={`text-xs px-2 py-1 rounded border transition-colors ${
										selectedChannelIds.has(c.id)
											? 'bg-primary text-primary-foreground border-primary'
											: 'border-border bg-background hover:bg-muted'
									}`}
								>
									{c.name}
								</button>
							))}
						</div>
					)}
					{selectedChannelIds.size === 0 && activeChannels.length > 0 && (
						<p className='text-xs text-muted-foreground mt-2'>
							Leave empty to send to all active channels
						</p>
					)}
				</CardContent>
			</Card>

			<div className='flex justify-end'>
				<Button
					onClick={handleGenerate}
					disabled={generateMutation.isPending}
					className='gap-2'
				>
					{generateMutation.isPending ? (
						<Loader2 className='h-4 w-4 animate-spin' />
					) : (
						<FileText className='h-4 w-4' />
					)}
					Generate Security Report
				</Button>
			</div>

			{history.length > 0 && (
				<div className='space-y-2'>
					<h3 className='text-sm font-medium'>Recent Reports</h3>
					<div className='space-y-2'>
						{history.map(row => (
							<div
								key={row.id}
								className='border rounded-lg p-3 space-y-1 bg-card'
							>
								<div className='flex items-center justify-between gap-2'>
									<div className='flex items-center gap-2'>
										<ReportStatusBadge status={row.status} />
										<span className='text-xs text-muted-foreground'>
											{row.started_at
												? new Date(row.started_at).toLocaleString()
												: new Date(row.created_at).toLocaleString()}
										</span>
										{row.payload?.serverIds?.length ? (
											<span className='text-xs text-muted-foreground'>
												{row.payload.serverIds.length} server(s)
											</span>
										) : row.payload?.environmentIds?.length ? (
											<span className='text-xs text-muted-foreground'>
												{row.payload.environmentIds.length} environment(s)
											</span>
										) : (
											<span className='text-xs text-muted-foreground'>
												All scope
											</span>
										)}
									</div>
									<ExpandLogButton
										expanded={expandedRows.has(row.id)}
										onToggle={() =>
											setExpandedRows(prev => {
												const next = new Set(prev);
												if (next.has(row.id)) next.delete(row.id);
												else next.add(row.id);
												return next;
											})
										}
									/>
								</div>
								{row.last_error && (
									<p className='text-xs text-destructive truncate'>
										{row.last_error}
									</p>
								)}
								{expandedRows.has(row.id) && (
									<ExecutionLogPanel jobExecutionId={Number(row.id)} />
								)}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
