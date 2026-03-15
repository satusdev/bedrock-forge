import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { AuthService } from '../auth/auth.service';

describe('SchedulesController', () => {
	let controller: SchedulesController;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;
	let service: jest.Mocked<
		Pick<
			SchedulesService,
			| 'listSchedules'
			| 'getSchedule'
			| 'createSchedule'
			| 'updateSchedule'
			| 'deleteSchedule'
			| 'pauseSchedule'
			| 'resumeSchedule'
			| 'runScheduleNow'
		>
	>;

	beforeEach(() => {
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest
				.fn()
				.mockResolvedValue(undefined),
		};

		service = {
			listSchedules: jest.fn(),
			getSchedule: jest.fn(),
			createSchedule: jest.fn(),
			updateSchedule: jest.fn(),
			deleteSchedule: jest.fn(),
			pauseSchedule: jest.fn(),
			resumeSchedule: jest.fn(),
			runScheduleNow: jest.fn(),
		};

		controller = new SchedulesController(
			service as unknown as SchedulesService,
			authService as unknown as AuthService,
		);
	});

	it('delegates listing and single fetch', async () => {
		service.listSchedules.mockResolvedValueOnce([]);
		service.getSchedule.mockResolvedValueOnce({ id: 1 } as never);

		await controller.getSchedules('1', 'active', '1', '10');
		await controller.getSchedule(1);

		expect(service.listSchedules).toHaveBeenCalledWith({
			project_id: 1,
			status: 'active',
			page: 1,
			page_size: 10,
			owner_id: undefined,
		});
		expect(service.getSchedule).toHaveBeenCalledWith(1, undefined);
	});

	it('delegates create/update/delete', async () => {
		service.createSchedule.mockResolvedValueOnce({ id: 2 } as never);
		service.updateSchedule.mockResolvedValueOnce({ id: 2 } as never);
		service.deleteSchedule.mockResolvedValueOnce(undefined);

		await controller.createSchedule({ name: 'Daily', project_id: 1 } as never);
		await controller.updateSchedule(2, { name: 'Nightly' } as never);
		await controller.deleteSchedule(2);

		expect(service.createSchedule).toHaveBeenCalledWith(
			{ name: 'Daily', project_id: 1 },
			undefined,
		);
		expect(service.updateSchedule).toHaveBeenCalledWith(
			2,
			{ name: 'Nightly' },
			undefined,
		);
		expect(service.deleteSchedule).toHaveBeenCalledWith(2, undefined);
	});

	it('delegates pause/resume/run actions', async () => {
		service.pauseSchedule.mockResolvedValueOnce({ status: 'paused' } as never);
		service.resumeSchedule.mockResolvedValueOnce({ status: 'active' } as never);
		service.runScheduleNow.mockResolvedValueOnce({
			status: 'accepted',
		} as never);

		await controller.pauseSchedule(3);
		await controller.resumeSchedule(3);
		await controller.runScheduleNow(3);

		expect(service.pauseSchedule).toHaveBeenCalledWith(3, undefined);
		expect(service.resumeSchedule).toHaveBeenCalledWith(3, undefined);
		expect(service.runScheduleNow).toHaveBeenCalledWith(3, undefined);
	});

	it('throws for invalid numeric query values', async () => {
		await expect(controller.getSchedules('abc')).rejects.toMatchObject({
			status: 400,
		});
		await expect(
			controller.getSchedules(undefined, undefined, '0'),
		).rejects.toMatchObject({
			status: 400,
		});
	});
});
