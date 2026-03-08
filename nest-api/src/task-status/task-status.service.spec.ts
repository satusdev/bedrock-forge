import { TaskStatusService } from './task-status.service';

describe('TaskStatusService', () => {
	let service: TaskStatusService;

	beforeEach(() => {
		service = new TaskStatusService();
	});

	it('returns fallback payload when task is missing', () => {
		const result = service.getTaskStatus('task-1', {
			status: 'pending',
			message: 'queued',
			progress: 0,
		});

		expect(result.task_id).toBe('task-1');
		expect(result.status).toBe('pending');
		expect(result.message).toBe('queued');
	});

	it('stores updates and auto-populates timestamps', () => {
		const running = service.upsertTaskStatus('task-2', {
			status: 'running',
			message: 'started',
			progress: 10,
		});
		expect(running.started_at).toBeTruthy();
		expect(running.completed_at).toBeNull();

		const completed = service.upsertTaskStatus('task-2', {
			status: 'completed',
			progress: 100,
			result: { ok: true },
		});

		expect(completed.completed_at).toBeTruthy();
		expect(completed.result).toEqual({ ok: true });
	});

	it('normalizes out-of-range progress values', () => {
		const result = service.upsertTaskStatus('task-3', {
			status: 'running',
			progress: 999,
		});

		expect(result.progress).toBe(100);
	});

	it('prunes completed and failed task records older than retention threshold', () => {
		const oldTimestamp = new Date(Date.now() - 5 * 60_000).toISOString();
		(service as any).store.set('task-completed', {
			task_id: 'task-completed',
			status: 'completed',
			message: '',
			progress: 100,
			result: null,
			started_at: oldTimestamp,
			completed_at: oldTimestamp,
			updated_at: oldTimestamp,
		});
		(service as any).store.set('task-failed', {
			task_id: 'task-failed',
			status: 'failed',
			message: '',
			progress: 100,
			result: null,
			started_at: oldTimestamp,
			completed_at: oldTimestamp,
			updated_at: oldTimestamp,
		});
		service.upsertTaskStatus('task-running', {
			status: 'running',
			progress: 50,
		});

		const removed = service.pruneTerminalStatuses(1);

		expect(removed).toBe(2);
		expect(service.getTaskStatus('task-running').status).toBe('running');
		expect(service.getTaskStatus('task-completed').status).toBe('pending');
	});
});
