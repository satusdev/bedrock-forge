import { useState } from 'react';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	ExecutionLogPanel,
	ExpandLogButton,
} from '@/components/ui/execution-log-panel';
import { JobExecutionRow } from '../types';
import { durationLabel, jobTypeLabel } from '../utils';
import { StatusIcon } from './EnvCard';

export function SyncHistoryRow({
	row,
	onCancel,
	isCancelling,
}: {
	row: JobExecutionRow;
	onCancel?: (id: number) => void;
	isCancelling?: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const isActive = row.status === 'active' || row.status === 'pending';

	return (
		<>
			<tr className='border-b last:border-0 hover:bg-muted/30 transition-colors'>
				<td className='py-2.5 pl-4 pr-2 whitespace-nowrap'>
					<div className='flex items-center gap-1.5 text-xs font-medium capitalize'>
						<StatusIcon status={row.status} />
						{row.status}
					</div>
				</td>
				<td className='py-2.5 px-2 text-xs text-muted-foreground'>
					{jobTypeLabel(row)}
				</td>
				<td className='py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap'>
					{row.started_at
						? new Date(row.started_at).toLocaleString([], {
								dateStyle: 'short',
								timeStyle: 'short',
							})
						: new Date(row.created_at).toLocaleString([], {
								dateStyle: 'short',
								timeStyle: 'short',
							})}
				</td>
				<td className='py-2.5 px-2 text-xs text-muted-foreground whitespace-nowrap'>
					{durationLabel(row.started_at, row.completed_at)}
				</td>
				<td className='py-2.5 px-2 text-xs'>
					{row.status === 'active' && row.progress != null ? (
						<div className='flex items-center gap-2'>
							<div className='w-16 bg-muted rounded-full h-1.5'>
								<div
									className='bg-primary h-1.5 rounded-full'
									style={{ width: `${row.progress}%` }}
								/>
							</div>
							<span className='text-muted-foreground'>{row.progress}%</span>
						</div>
					) : row.status === 'failed' && row.last_error ? (
						<span
							className='text-destructive truncate max-w-[200px] block'
							title={row.last_error}
						>
							{row.last_error}
						</span>
					) : null}
				</td>
				<td className='py-2.5 pr-4 pl-2 text-right whitespace-nowrap'>
					<div className='flex items-center gap-1 justify-end'>
						<ExpandLogButton
							expanded={expanded}
							onToggle={() => setExpanded(v => !v)}
						/>
						{row.status === 'active' && (
							<Button
								variant='ghost'
								size='icon'
								disabled={isCancelling}
								onClick={() => onCancel?.(row.id)}
								title='Force stop job'
							>
								<XCircle className='h-4 w-4 text-destructive' />
							</Button>
						)}
					</div>
				</td>
			</tr>
			{expanded && (
				<tr className='bg-muted/20 border-b last:border-0'>
					<td colSpan={6} className='px-4 pb-4 pt-2'>
						<ExecutionLogPanel jobExecutionId={row.id} isActive={isActive} />
					</td>
				</tr>
			)}
		</>
	);
}
