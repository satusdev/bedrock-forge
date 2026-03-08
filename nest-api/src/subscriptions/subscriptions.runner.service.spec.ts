import { SubscriptionsRunnerService } from './subscriptions.runner.service';

describe('SubscriptionsRunnerService', () => {
	it('claims and processes due subscription maintenance', async () => {
		const subscriptionsService = {
			claimDueAutoRenewals: jest.fn().mockResolvedValue([{ id: 17 }]),
			processAutoRenewal: jest.fn().mockResolvedValue({ status: 'renewed' }),
			processRenewalReminders: jest
				.fn()
				.mockResolvedValue({ reminders_sent: 2 }),
			recordRunnerSnapshot: jest.fn(),
		};
		const service = new SubscriptionsRunnerService(
			subscriptionsService as unknown as any,
		);

		await service.runSubscriptionMaintenance();

		expect(subscriptionsService.claimDueAutoRenewals).toHaveBeenCalled();
		expect(subscriptionsService.processAutoRenewal).toHaveBeenCalledWith(17);
		expect(subscriptionsService.processRenewalReminders).toHaveBeenCalled();
		expect(subscriptionsService.recordRunnerSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				claimed: 1,
				renewals_succeeded: 1,
				renewals_failed: 0,
				reminders_sent: 2,
			}),
		);
	});
});
