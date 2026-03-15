import { DomainsRunnerService } from './domains.runner.service';

describe('DomainsRunnerService', () => {
	it('claims and executes domain maintenance', async () => {
		const domainsService = {
			claimWhoisDueDomains: jest
				.fn()
				.mockResolvedValue([{ id: 9, domain_name: 'example.com' }]),
			runWhoisRefresh: jest.fn().mockResolvedValue({ status: 'active' }),
			processExpiryReminders: jest
				.fn()
				.mockResolvedValue({ processed: 1, reminders_sent: 1 }),
			recordRunnerSnapshot: jest.fn(),
		};
		const service = new DomainsRunnerService(domainsService as unknown as any);

		await service.runDomainMaintenance();

		expect(domainsService.claimWhoisDueDomains).toHaveBeenCalled();
		expect(domainsService.runWhoisRefresh).toHaveBeenCalledWith(9);
		expect(domainsService.processExpiryReminders).toHaveBeenCalled();
		expect(domainsService.recordRunnerSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				claimed: 1,
				whois_succeeded: 1,
				whois_failed: 0,
				reminders_processed: 1,
				reminders_sent: 1,
			}),
		);
	});
});
