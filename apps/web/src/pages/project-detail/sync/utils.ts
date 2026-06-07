import { JobExecutionRow } from './types';

export function durationLabel(
	started?: string | null,
	completed?: string | null,
): string {
	if (!started) return '\u2014';
	const diff =
		(completed ? new Date(completed).getTime() : Date.now()) -
		new Date(started).getTime();
	if (diff < 0) return '\u2014';
	if (diff < 1000) return `${diff}ms`;
	if (diff < 60_000) return `${(diff / 1000).toFixed(1)}s`;
	const mins = Math.floor(diff / 60_000);
	const secs = Math.floor((diff % 60_000) / 1000);
	return `${mins}m ${secs}s`;
}

export function jobTypeLabel(row: JobExecutionRow): string {
	if (row.job_type === 'sync:push') return 'Push';
	if (row.job_type === 'sync:clone') return 'Clone';
	return row.environment?.type ?? '\u2014';
}
