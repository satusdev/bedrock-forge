import { SchedulesRunnerService } from './schedules.runner.service';

describe('SchedulesRunnerService', () => {
	it('claims and executes due schedules', async () => {
		const schedulesService = {
			claimDueSchedules: jest.fn().mockResolvedValue([
				{
					id: 21,
					created_by_id: 4,
					claim_token: 'schedule-lease-abc',
				},
			]),
			runScheduleNow: jest.fn().mockResolvedValue({ status: 'accepted' }),
		};
		const service = new SchedulesRunnerService(
			schedulesService as unknown as any,
		);

		await service.runDueSchedules();

		expect(schedulesService.claimDueSchedules).toHaveBeenCalled();
		expect(schedulesService.runScheduleNow).toHaveBeenCalledWith(
			21,
			4,
			'schedule-lease-abc',
		);
	});
});
