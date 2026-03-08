import { TaskStatusRunnerService } from './task-status.runner.service';

describe('TaskStatusRunnerService', () => {
	it('prunes terminal task statuses during cleanup', () => {
		const taskStatusService = {
			pruneTerminalStatuses: jest.fn().mockReturnValue(2),
		};
		const service = new TaskStatusRunnerService(
			taskStatusService as unknown as any,
		);

		service.runCleanup();

		expect(taskStatusService.pruneTerminalStatuses).toHaveBeenCalled();
	});
});
