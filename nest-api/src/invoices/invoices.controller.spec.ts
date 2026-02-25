import { Response } from 'express';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

describe('InvoicesController', () => {
	let controller: InvoicesController;
	let service: jest.Mocked<
		Pick<
			InvoicesService,
			| 'listInvoices'
			| 'getInvoice'
			| 'createInvoice'
			| 'updateInvoice'
			| 'deleteInvoice'
			| 'sendInvoice'
			| 'recordPayment'
			| 'getInvoicePdfMetadata'
			| 'getInvoiceStats'
		>
	>;

	beforeEach(() => {
		service = {
			listInvoices: jest.fn(),
			getInvoice: jest.fn(),
			createInvoice: jest.fn(),
			updateInvoice: jest.fn(),
			deleteInvoice: jest.fn(),
			sendInvoice: jest.fn(),
			recordPayment: jest.fn(),
			getInvoicePdfMetadata: jest.fn(),
			getInvoiceStats: jest.fn(),
		};

		controller = new InvoicesController(service as unknown as InvoicesService);
	});

	it('delegates listing and stats', async () => {
		service.listInvoices.mockResolvedValueOnce({
			invoices: [],
			total: 0,
			limit: 50,
			offset: 0,
		} as never);
		service.getInvoiceStats.mockResolvedValueOnce({ period_days: 30 } as never);

		await controller.listInvoices('draft', '1', '10', '0');
		await controller.getInvoiceStats('30');

		expect(service.listInvoices).toHaveBeenCalledWith({
			status: 'draft',
			client_id: 1,
			limit: 10,
			offset: 0,
		});
		expect(service.getInvoiceStats).toHaveBeenCalledWith(30);
	});

	it('delegates lifecycle operations', async () => {
		service.getInvoice.mockResolvedValueOnce({ id: 1 } as never);
		service.createInvoice.mockResolvedValueOnce({ id: 2 } as never);
		service.updateInvoice.mockResolvedValueOnce({ status: 'success' } as never);
		service.deleteInvoice.mockResolvedValueOnce({ status: 'success' } as never);

		await controller.getInvoice(1);
		await controller.createInvoice({ client_id: 1, items: [] } as never);
		await controller.updateInvoice(1, { status: 'pending' } as never);
		await controller.deleteInvoice(1);

		expect(service.getInvoice).toHaveBeenCalledWith(1);
		expect(service.createInvoice).toHaveBeenCalled();
		expect(service.updateInvoice).toHaveBeenCalledWith(1, {
			status: 'pending',
		});
		expect(service.deleteInvoice).toHaveBeenCalledWith(1);
	});

	it('delegates send/payment/pdf operations', async () => {
		service.sendInvoice.mockResolvedValueOnce({ status: 'success' } as never);
		service.recordPayment.mockResolvedValueOnce({ status: 'success' } as never);
		service.getInvoicePdfMetadata.mockResolvedValueOnce({
			filename: 'invoice.pdf',
			content: Buffer.from('pdf'),
		} as never);

		const res = {
			setHeader: jest.fn(),
			send: jest.fn(),
		} as unknown as Response;

		await controller.sendInvoice(1);
		await controller.recordPayment(1, {
			amount: 10,
			payment_method: 'cash',
		} as never);
		await controller.downloadInvoicePdf(1, res);

		expect(service.sendInvoice).toHaveBeenCalledWith(1);
		expect(service.recordPayment).toHaveBeenCalledWith(1, {
			amount: 10,
			payment_method: 'cash',
		});
		expect(res.setHeader).toHaveBeenCalled();
		expect(res.send).toHaveBeenCalled();
	});
});
