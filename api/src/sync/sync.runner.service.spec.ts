import { SyncRunnerService } from './sync.runner.service';

describe('SyncRunnerService', () => {
	it('claims and processes pending sync tasks', async () => {
		const syncService = {
			claimPendingTasks: jest
				.fn()
				.mockReturnValue([
					{ task_id: 'task-1', kind: 'sync.pull_database', payload: {} },
				]),
			processPendingTask: jest.fn().mockReturnValue({ status: 'completed' }),
		};
		const service = new SyncRunnerService(syncService as unknown as any);

		await service.processPendingTasks();

		expect(syncService.claimPendingTasks).toHaveBeenCalled();
		expect(syncService.processPendingTask).toHaveBeenCalledWith(
			expect.objectContaining({ task_id: 'task-1' }),
		);
	});
});
