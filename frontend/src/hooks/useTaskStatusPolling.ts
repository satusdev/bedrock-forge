import { useEffect, useState } from 'react';
import { dashboardApi } from '../services/api';

export interface TaskStatusResult {
	status?: string;
	message?: string;
	progress?: number;
	result?: any;
}

interface UseTaskStatusPollingOptions {
	intervalMs?: number;
	enabled?: boolean;
	onComplete?: (status: TaskStatusResult) => void;
}

export const useTaskStatusPolling = (
	taskId: string | null | undefined,
	options: UseTaskStatusPollingOptions = {}
) => {
	const { intervalMs = 2000, enabled = true, onComplete } = options;
	const [taskStatus, setTaskStatus] = useState<TaskStatusResult | null>(null);
	const [isPolling, setIsPolling] = useState(false);

	useEffect(() => {
		if (!taskId || !enabled) return;
		let active = true;
		setIsPolling(true);
		const interval = setInterval(async () => {
			try {
				const response = await dashboardApi.getTaskStatus(taskId);
				if (!active) return;
				setTaskStatus(response.data);
				if (['completed', 'failed'].includes(response.data.status)) {
					clearInterval(interval);
					setIsPolling(false);
					if (onComplete) onComplete(response.data);
				}
			} catch {
				if (!active) return;
				setIsPolling(false);
				clearInterval(interval);
			}
		}, intervalMs);

		return () => {
			active = false;
			setIsPolling(false);
			clearInterval(interval);
		};
	}, [taskId, enabled, intervalMs, onComplete]);

	return { taskStatus, isPolling };
};
