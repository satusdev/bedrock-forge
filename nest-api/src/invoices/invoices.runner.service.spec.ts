import { InvoicesRunnerService } from './invoices.runner.service';

describe('InvoicesRunnerService', () => {
	it('runs overdue invoice sweep', async () => {
		const invoicesService = {
			markOverdueInvoices: jest.fn().mockResolvedValue({ updated: 3 }),
		};
		const service = new InvoicesRunnerService(
			invoicesService as unknown as any,
		);

		await service.markOverdueInvoices();

		expect(invoicesService.markOverdueInvoices).toHaveBeenCalled();
	});
});
