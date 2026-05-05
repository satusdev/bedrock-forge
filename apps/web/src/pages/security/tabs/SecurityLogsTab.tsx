import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api-client';
import type { ServerSummary, LogsResponse } from '../types';
import { SeverityBadge } from '../components';

export function SecurityLogsTab({ servers }: { servers: ServerSummary[] }) {
	const [serverId, setServerId] = useState<string>('all');
	const [dateFrom, setDateFrom] = useState('');
	const [dateTo, setDateTo] = useState('');
	const [page, setPage] = useState(1);

	const params = new URLSearchParams({ page: String(page), limit: '50' });
	if (serverId !== 'all') params.set('server_id', serverId);
	if (dateFrom) params.set('date_from', dateFrom);
	if (dateTo) params.set('date_to', dateTo);

	const { data, isFetching } = useQuery<LogsResponse>({
		queryKey: ['security', 'logs', serverId, dateFrom, dateTo, page],
		queryFn: () => api.get(`/security/logs?${params}`),
	});

	const categoryColors: Record<string, string> = {
		FAILED_LOGINS: 'text-red-500',
		SUCCESSFUL_LOGINS: 'text-green-600',
		AUTHORIZED_KEYS: 'text-orange-500',
	};

	return (
		<div className='space-y-4'>
			<div className='flex gap-3 flex-wrap items-end'>
				<div className='space-y-1'>
					<Label className='text-xs'>Server</Label>
					<Select
						value={serverId}
						onValueChange={v => {
							setServerId(v);
							setPage(1);
						}}
					>
						<SelectTrigger className='w-48 h-8 text-xs'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='all'>All servers</SelectItem>
							{servers.map(s => (
								<SelectItem key={s.id} value={String(s.id)}>
									{s.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className='space-y-1'>
					<Label className='text-xs'>From</Label>
					<Input
						type='date'
						value={dateFrom}
						onChange={e => {
							setDateFrom(e.target.value);
							setPage(1);
						}}
						className='h-8 text-xs w-36'
					/>
				</div>
				<div className='space-y-1'>
					<Label className='text-xs'>To</Label>
					<Input
						type='date'
						value={dateTo}
						onChange={e => {
							setDateTo(e.target.value);
							setPage(1);
						}}
						className='h-8 text-xs w-36'
					/>
				</div>
			</div>

			<div className='border rounded-md overflow-auto'>
				<table className='w-full text-sm'>
					<thead>
						<tr className='border-b bg-muted/50'>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground w-40'>
								Scanned at
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Server
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground w-28'>
								Category
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground w-20'>
								Severity
							</th>
							<th className='text-left px-3 py-2 text-xs font-medium text-muted-foreground'>
								Finding
							</th>
						</tr>
					</thead>
					<tbody className='divide-y'>
						{isFetching && (
							<tr>
								<td
									colSpan={5}
									className='text-center py-6 text-muted-foreground text-xs'
								>
									Loading…
								</td>
							</tr>
						)}
						{!isFetching && data?.data.length === 0 && (
							<tr>
								<td
									colSpan={5}
									className='text-center py-10 text-muted-foreground'
								>
									No SSH/auth events found. Run an SSH_AUDIT scan to populate
									this log.
								</td>
							</tr>
						)}
						{data?.data.map((log, i) => (
							<tr
								key={i}
								className={`hover:bg-muted/30 ${log.severity === 'critical' ? 'bg-red-50/40 dark:bg-red-950/20' : ''}`}
							>
								<td className='px-3 py-2 text-xs text-muted-foreground whitespace-nowrap'>
									{log.scanned_at
										? new Date(log.scanned_at).toLocaleString()
										: '—'}
								</td>
								<td className='px-3 py-2 text-xs'>
									<p className='font-medium'>{log.server_name ?? '—'}</p>
									{log.server_ip && (
										<p className='text-muted-foreground'>{log.server_ip}</p>
									)}
								</td>
								<td className='px-3 py-2'>
									<span
										className={`text-xs font-medium ${categoryColors[log.category] ?? 'text-muted-foreground'}`}
									>
										{log.category.replace(/_/g, ' ')}
									</span>
								</td>
								<td className='px-3 py-2'>
									<SeverityBadge severity={log.severity} />
								</td>
								<td className='px-3 py-2 text-xs'>
									<p className='font-medium'>{log.title}</p>
									<p className='text-muted-foreground line-clamp-1'>
										{log.description}
									</p>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{data && data.totalPages > 1 && (
				<div className='flex items-center justify-between text-xs text-muted-foreground'>
					<span>
						{data.total} result{data.total !== 1 ? 's' : ''}
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
						<span className='flex items-center px-2'>
							{page} / {data.totalPages}
						</span>
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
		</div>
	);
}
