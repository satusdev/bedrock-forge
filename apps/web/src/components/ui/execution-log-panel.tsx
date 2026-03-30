import { useQuery } from '@tanstack/react-query';
import {
	ChevronDown,
	ChevronUp,
	Terminal,
	Clock,
	CheckCircle2,
	XCircle,
	AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { Skeleton } from '@/components/ui/skeleton';

export interface ExecutionLogEntry {
	ts: string;
	step: string;
	level: 'info' | 'warn' | 'error';
	detail?: string;
	command?: string;
	stdout?: string;
	stderr?: string;
	exitCode?: number;
	durationMs?: number;
}

interface JobExecutionLog {
	id: number;
	status: string;
	execution_log: ExecutionLogEntry[] | null;
}

function LevelIcon({ level }: { level: ExecutionLogEntry['level'] }) {
	if (level === 'error')
		return (
			<XCircle className='h-3.5 w-3.5 text-destructive flex-shrink-0 mt-0.5' />
		);
	if (level === 'warn')
		return (
			<AlertTriangle className='h-3.5 w-3.5 text-yellow-500 flex-shrink-0 mt-0.5' />
		);
	return (
		<CheckCircle2 className='h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5' />
	);
}

function EntryRow({
	entry,
	isLast,
}: {
	entry: ExecutionLogEntry;
	isLast: boolean;
}) {
	const ts = new Date(entry.ts).toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});

	return (
		<div className='flex gap-3'>
			{/* timeline spine */}
			<div className='flex flex-col items-center'>
				<LevelIcon level={entry.level} />
				{!isLast && <div className='w-px flex-1 bg-border mt-1' />}
			</div>

			<div className='pb-3 min-w-0 flex-1'>
				<div className='flex flex-wrap items-center gap-x-3 gap-y-0.5'>
					<span
						className={`text-xs font-medium ${
							entry.level === 'error'
								? 'text-destructive'
								: entry.level === 'warn'
									? 'text-yellow-600 dark:text-yellow-400'
									: 'text-foreground'
						}`}
					>
						{entry.step}
					</span>
					<span className='text-xs text-muted-foreground flex items-center gap-1'>
						<Clock className='h-2.5 w-2.5' />
						{ts}
					</span>
					{entry.durationMs !== undefined && (
						<span className='text-xs text-muted-foreground'>
							{entry.durationMs < 1000
								? `${entry.durationMs}ms`
								: `${(entry.durationMs / 1000).toFixed(1)}s`}
						</span>
					)}
					{entry.exitCode !== undefined && (
						<span
							className={`text-xs font-mono px-1 rounded ${
								entry.exitCode === 0
									? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
									: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
							}`}
						>
							exit {entry.exitCode}
						</span>
					)}
				</div>

				{entry.detail && (
					<p className='text-xs text-muted-foreground mt-0.5 break-all'>
						{entry.detail}
					</p>
				)}

				{entry.command && (
					<div className='mt-1 flex items-start gap-1.5'>
						<Terminal className='h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5' />
						<code className='text-xs font-mono bg-muted rounded px-1.5 py-0.5 break-all'>
							{entry.command}
						</code>
					</div>
				)}

				{(entry.stdout || entry.stderr) && (
					<div className='mt-1.5 space-y-1'>
						{entry.stdout && (
							<pre className='text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-24 overflow-y-auto'>
								{entry.stdout}
							</pre>
						)}
						{entry.stderr && (
							<pre className='text-xs bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-24 overflow-y-auto'>
								{entry.stderr}
							</pre>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * ExecutionLogPanel
 *
 * Lazy-fetches and renders the execution_log timeline for a given
 * JobExecution. Pass `jobExecutionId=null` to render nothing.
 * Pass `isActive=true` while a job is running to poll every 2 s.
 */
export function ExecutionLogPanel({
	jobExecutionId,
	isActive = false,
}: {
	jobExecutionId: number | null;
	isActive?: boolean;
}) {
	const { data, isLoading } = useQuery({
		queryKey: ['execution-log', jobExecutionId],
		queryFn: () =>
			api.get<JobExecutionLog>(`/job-executions/${jobExecutionId}/log`),
		enabled: jobExecutionId != null,
		staleTime: isActive ? 0 : 10_000,
		refetchInterval: isActive ? 2_000 : false,
	});

	if (!jobExecutionId) return null;

	if (isLoading) {
		return (
			<div className='space-y-2 py-3'>
				<Skeleton className='h-4 w-48' />
				<Skeleton className='h-4 w-64' />
				<Skeleton className='h-4 w-56' />
			</div>
		);
	}

	const entries = data?.execution_log ?? [];

	if (entries.length === 0) {
		return (
			<p className='text-xs text-muted-foreground py-2'>
				No execution log available for this job.
			</p>
		);
	}

	return (
		<div className='pt-2'>
			{entries.map((entry, i) => (
				<EntryRow key={i} entry={entry} isLast={i === entries.length - 1} />
			))}
		</div>
	);
}

/**
 * ExpandLogButton
 *
 * Toggle button that controls whether the ExecutionLogPanel is shown.
 */
export function ExpandLogButton({
	expanded,
	onToggle,
	disabled,
}: {
	expanded: boolean;
	onToggle: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			onClick={onToggle}
			disabled={disabled}
			className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none'
			title={expanded ? 'Hide execution log' : 'Show execution log'}
		>
			{expanded ? (
				<ChevronUp className='h-3.5 w-3.5' />
			) : (
				<ChevronDown className='h-3.5 w-3.5' />
			)}
			Log
		</button>
	);
}
