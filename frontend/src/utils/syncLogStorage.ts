export type SyncTaskSnapshot = {
	task_id: string;
	status: string;
	message: string;
	progress: number;
	logs: string;
	updated_at: string;
};

const MAX_SYNC_HISTORY = 50;

function getHistoryKey(projectId: number) {
	return `sync-task-history:${projectId}`;
}

export function readSyncTaskHistory(projectId: number): SyncTaskSnapshot[] {
	try {
		const raw = window.localStorage.getItem(getHistoryKey(projectId));
		if (!raw) {
			return [];
		}
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [];
		}

		return parsed
			.filter((entry): entry is SyncTaskSnapshot => {
				return (
					typeof entry?.task_id === 'string' &&
					typeof entry?.status === 'string' &&
					typeof entry?.message === 'string' &&
					typeof entry?.progress === 'number' &&
					typeof entry?.logs === 'string' &&
					typeof entry?.updated_at === 'string'
				);
			})
			.sort(
				(a, b) =>
					Date.parse(b.updated_at || '') - Date.parse(a.updated_at || ''),
			);
	} catch {
		return [];
	}
}

export function upsertSyncTaskHistory(
	projectId: number,
	snapshot: SyncTaskSnapshot,
) {
	const current = readSyncTaskHistory(projectId);
	const next = [
		snapshot,
		...current.filter(entry => entry.task_id !== snapshot.task_id),
	]
		.sort(
			(a, b) => Date.parse(b.updated_at || '') - Date.parse(a.updated_at || ''),
		)
		.slice(0, MAX_SYNC_HISTORY);

	window.localStorage.setItem(getHistoryKey(projectId), JSON.stringify(next));
	return next;
}
