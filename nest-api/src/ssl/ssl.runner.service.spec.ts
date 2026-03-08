import { SslRunnerService } from './ssl.runner.service';

describe('SslRunnerService', () => {
	it('claims and executes due certificate renewals', async () => {
		const sslService = {
			claimDueRenewals: jest.fn().mockResolvedValue([{ id: 13 }]),
			runAutoRenewal: jest.fn().mockResolvedValue({ status: 'renewed' }),
		};
		const service = new SslRunnerService(sslService as unknown as any);

		await service.runDueRenewals();

		expect(sslService.claimDueRenewals).toHaveBeenCalled();
		expect(sslService.runAutoRenewal).toHaveBeenCalledWith(13);
	});
});
