import { TaskStatusRunnerService } from './task-status.runner.service';

describe('TaskStatusRunnerService', () => {
	it('prunes terminal task statuses during cleanup', async () => {
		const taskStatusService = {
			pruneTerminalStatuses: jest.fn().mockResolvedValue(2),
		};
		const service = new TaskStatusRunnerService(
			taskStatusService as unknown as any,
		);

		await service.runCleanup();

		expect(taskStatusService.pruneTerminalStatuses).toHaveBeenCalled();
	});
});
