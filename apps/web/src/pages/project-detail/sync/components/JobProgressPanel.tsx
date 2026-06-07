import { useState } from 'react';
import { XCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
	ExecutionLogPanel,
} from '@/components/ui/execution-log-panel';
import { JobProgress, JobResult } from '../types';

export function JobProgressPanel({
	progress,
	jobDone,
	jobExecutionId,
	isBusy,
	onCancel,
	isCancelling,
}: {
	progress: JobProgress | null;
	jobDone: JobResult | null;
	jobExecutionId: number | null;
	isBusy: boolean;
	onCancel?: () => void;
	isCancelling?: boolean;
}) {
	const [logExpanded, setLogExpanded] = useState(false);

	if (!progress && !jobDone) return null;

	return (
		<div className='border rounded-lg p-4 space-y-3'>
			{progress && !jobDone && (
				<>
					<div className='flex justify-between items-start text-sm gap-2'>
						<span className='text-muted-foreground flex-1'>
							{progress.step ?? progress.message}
						</span>
						<div className='flex items-center gap-2 shrink-0'>
							<span className='font-medium'>{progress.progress}%</span>
							{onCancel && (
								<Button
									variant='outline'
									size='sm'
									className='h-7 text-xs gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10'
									disabled={isCancelling}
									onClick={onCancel}
								>
									<XCircle className='h-3.5 w-3.5' />
									{isCancelling ? 'Stopping…' : 'Stop'}
								</Button>
							)}
						</div>
					</div>
					<div className='w-full bg-muted rounded-full h-2'>
						<div
							className='bg-primary h-2 rounded-full transition-all'
							style={{ width: `${progress.progress}%` }}
						/>
					</div>
				</>
			)}
			{jobDone && (
				<div className='flex items-center gap-2'>
					<Badge
						variant={jobDone.status === 'completed' ? 'default' : 'destructive'}
					>
						{jobDone.status === 'completed' ? 'Completed' : 'Failed'}
					</Badge>
					{jobDone.message && (
						<span className='text-sm text-muted-foreground'>
							{jobDone.message}
						</span>
					)}
				</div>
			)}

			{jobExecutionId && (
				<div className='pt-2 border-t'>
					<button
						type='button'
						className='flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors'
						onClick={() => setLogExpanded(v => !v)}
					>
						{logExpanded ? (
							<ChevronUp className='h-3 w-3' />
						) : (
							<ChevronDown className='h-3 w-3' />
						)}
						{logExpanded ? 'Hide' : 'Show'} execution log
					</button>
					{logExpanded && (
						<div className='mt-2'>
							<ExecutionLogPanel
								jobExecutionId={jobExecutionId}
								isActive={isBusy}
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
