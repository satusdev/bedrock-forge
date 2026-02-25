import { TaskStatusController } from './task-status.controller';
import { TaskStatusService } from './task-status.service';

describe('TaskStatusController', () => {
	let controller: TaskStatusController;
	let service: jest.Mocked<
		Pick<TaskStatusService, 'getTaskStatus' | 'upsertTaskStatus'>
	>;

	beforeEach(() => {
		service = {
			getTaskStatus: jest.fn(),
			upsertTaskStatus: jest.fn(),
		};

		controller = new TaskStatusController(
			service as unknown as TaskStatusService,
		);
	});

	it('delegates get and upsert to service', () => {
		service.getTaskStatus.mockReturnValueOnce({ task_id: 't1' } as never);
		service.upsertTaskStatus.mockReturnValueOnce({ task_id: 't1' } as never);

		controller.getTaskStatus('t1', {});
		controller.upsertTaskStatus('t1', {}, { status: 'running', progress: 25 });

		expect(service.getTaskStatus).toHaveBeenCalledWith('t1', {
			status: 'pending',
			message: 'Task is queued',
			progress: 0,
		});
		expect(service.upsertTaskStatus).toHaveBeenCalledWith('t1', {
			status: 'running',
			progress: 25,
		});
	});
});
