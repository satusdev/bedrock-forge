import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api-client';
import { useWebSocketEvent } from '@/lib/websocket';
import { WS_EVENTS } from '@bedrock-forge/shared';

interface Environment {
	id: number;
	name: string;
	project: { name: string };
}
interface Backup {
	id: number;
	type: string;
	status: string;
	file_size: number | null;
	label: string | null;
	created_at: string;
}

function fmt(bytes: number | null) {
	if (!bytes) return '—';
	if (bytes > 1024 * 1024 * 1024)
		return `${(bytes / 1073741824).toFixed(1)} GB`;
	return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function BackupsPage() {
	const qc = useQueryClient();
	const [envId, setEnvId] = useState<number | null>(null);
	const [jobProgress, setJobProgress] = useState<Record<string, number>>({});

	const { data: envs } = useQuery({
		queryKey: ['environments-all'],
		queryFn: () => api.get<Environment[]>('/environments'),
	});

	const { data: backups, isLoading } = useQuery({
		queryKey: ['backups', envId],
		queryFn: () => api.get<Backup[]>(`/backups?environmentId=${envId}`),
		enabled: !!envId,
	});

	const createBackup = useMutation({
		mutationFn: () =>
			api.post('/backups/create', { environmentId: envId, type: 'full' }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['backups', envId] }),
	});

	const restoreBackup = useMutation({
		mutationFn: (backupId: number) =>
			api.post('/backups/restore', { backupId }),
	});

	useWebSocketEvent(
		WS_EVENTS.JOB_PROGRESS,
		(data: { jobId: string; progress: number }) => {
			setJobProgress(p => ({ ...p, [data.jobId]: data.progress }));
		},
	);

	useWebSocketEvent(WS_EVENTS.JOB_COMPLETED, () => {
		qc.invalidateQueries({ queryKey: ['backups', envId] });
	});

	return (
		<div className='space-y-4'>
			<div className='flex items-center justify-between'>
				<h1 className='text-2xl font-bold'>Backups</h1>
				{envId && (
					<button
						onClick={() => createBackup.mutate()}
						disabled={createBackup.isPending}
						className='bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50'
					>
						{createBackup.isPending ? 'Creating…' : 'Create Backup'}
					</button>
				)}
			</div>

			<div className='flex items-center gap-3'>
				<label className='text-sm font-medium'>Environment:</label>
				<select
					className='border rounded-md px-3 py-1.5 text-sm bg-background'
					value={envId ?? ''}
					onChange={e =>
						setEnvId(e.target.value ? Number(e.target.value) : null)
					}
				>
					<option value=''>Select environment…</option>
					{envs?.map(e => (
						<option key={e.id} value={e.id}>
							{e.project.name} — {e.name}
						</option>
					))}
				</select>
			</div>

			{isLoading && <p className='text-muted-foreground'>Loading…</p>}

			{Object.keys(jobProgress).length > 0 && (
				<div className='space-y-2'>
					{Object.entries(jobProgress).map(([jobId, progress]) => (
						<div key={jobId}>
							<div className='flex justify-between text-xs mb-1'>
								<span className='font-mono'>{jobId}</span>
								<span>{progress}%</span>
							</div>
							<div className='h-1.5 bg-muted rounded-full'>
								<div
									className='h-1.5 bg-primary rounded-full transition-all'
									style={{ width: `${progress}%` }}
								/>
							</div>
						</div>
					))}
				</div>
			)}

			{backups && backups.length > 0 && (
				<div className='overflow-x-auto'>
					<table className='w-full text-sm'>
						<thead>
							<tr className='border-b text-left text-muted-foreground'>
								<th className='pb-2 pr-4 font-medium'>Type</th>
								<th className='pb-2 pr-4 font-medium'>Label</th>
								<th className='pb-2 pr-4 font-medium'>Size</th>
								<th className='pb-2 pr-4 font-medium'>Status</th>
								<th className='pb-2 pr-4 font-medium'>Created</th>
								<th className='pb-2 font-medium' />
							</tr>
						</thead>
						<tbody className='divide-y'>
							{backups.map(b => (
								<tr key={b.id}>
									<td className='py-3 pr-4 capitalize'>{b.type}</td>
									<td className='py-3 pr-4 text-muted-foreground'>
										{b.label ?? '—'}
									</td>
									<td className='py-3 pr-4 font-mono'>{fmt(b.file_size)}</td>
									<td className='py-3 pr-4'>
										<span
											className={`text-xs px-2 py-0.5 rounded-full ${b.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : b.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}
										>
											{b.status}
										</span>
									</td>
									<td className='py-3 pr-4 text-muted-foreground'>
										{new Date(b.created_at).toLocaleString()}
									</td>
									<td className='py-3'>
										<button
											onClick={() => restoreBackup.mutate(b.id)}
											disabled={
												b.status !== 'completed' || restoreBackup.isPending
											}
											className='text-xs text-primary underline disabled:opacity-40'
										>
											Restore
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{!envId && (
				<p className='text-muted-foreground text-sm'>
					Select an environment to view backups.
				</p>
			)}
			{envId && backups?.length === 0 && (
				<p className='text-muted-foreground text-sm'>No backups yet.</p>
			)}
		</div>
	);
}
