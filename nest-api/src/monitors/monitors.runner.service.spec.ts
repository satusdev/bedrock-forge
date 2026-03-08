import { MonitorsRunnerService } from './monitors.runner.service';

describe('MonitorsRunnerService', () => {
	it('claims and executes due monitors', async () => {
		const monitorsService = {
			claimDueMonitors: jest
				.fn()
				.mockResolvedValue([{ id: 31, created_by_id: 5 }]),
			runMonitorCheck: jest.fn().mockResolvedValue({ status: 'up' }),
			recordRunnerSnapshot: jest.fn(),
		};
		const service = new MonitorsRunnerService(
			monitorsService as unknown as any,
		);

		await service.processDueMonitors();

		expect(monitorsService.claimDueMonitors).toHaveBeenCalled();
		expect(monitorsService.runMonitorCheck).toHaveBeenCalledWith(31);
		expect(monitorsService.recordRunnerSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				claimed: 1,
				checks_succeeded: 1,
				checks_failed: 0,
			}),
		);
	});
});
