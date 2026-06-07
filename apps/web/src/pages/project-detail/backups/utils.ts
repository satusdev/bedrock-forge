export const BACKUP_TYPE_LABELS: Record<string, string> = {
	full: 'Full',
	db_only: 'Database',
	files_only: 'Files',
};

export const STATUS_VARIANT: Record<
	string,
	'success' | 'secondary' | 'warning' | 'destructive'
> = {
	pending: 'secondary',
	running: 'warning',
	completed: 'success',
	failed: 'destructive',
};

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
