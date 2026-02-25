import { ClientPortalController } from './client-portal.controller';
import { ClientPortalService } from './client-portal.service';

describe('ClientPortalController', () => {
	let controller: ClientPortalController;
	let service: jest.Mocked<ClientPortalService>;

	beforeEach(() => {
		service = {
			getClientProjects: jest.fn(),
			getClientInvoices: jest.fn(),
			getClientInvoiceDetail: jest.fn(),
			getClientTickets: jest.fn(),
			createTicket: jest.fn(),
			getTicketDetail: jest.fn(),
			replyToTicket: jest.fn(),
			getClientSubscriptions: jest.fn(),
			getClientBackups: jest.fn(),
		} as unknown as jest.Mocked<ClientPortalService>;

		controller = new ClientPortalController(service);
	});

	it('delegates all client portal routes', async () => {
		service.getClientProjects.mockResolvedValueOnce([] as never);
		service.getClientInvoices.mockResolvedValueOnce([] as never);
		service.getClientInvoiceDetail.mockResolvedValueOnce({ id: 2 } as never);
		service.getClientTickets.mockResolvedValueOnce([] as never);
		service.createTicket.mockResolvedValueOnce({ id: 1 } as never);
		service.getTicketDetail.mockResolvedValueOnce({ id: 1 } as never);
		service.replyToTicket.mockResolvedValueOnce({ message: 'ok' } as never);
		service.getClientSubscriptions.mockResolvedValueOnce([] as never);
		service.getClientBackups.mockResolvedValueOnce([] as never);

		await controller.getClientProjects('Bearer 1');
		await controller.getClientInvoices('Bearer 1');
		await controller.getClientInvoiceDetail(2, 'Bearer 1');
		await controller.getClientTickets('Bearer 1');
		await controller.createTicket(
			{ subject: 'Help', message: 'Please assist' },
			'Bearer 1',
		);
		await controller.getTicketDetail(1, 'Bearer 1');
		await controller.replyToTicket(1, { message: 'update' }, 'Bearer 1');
		await controller.getClientSubscriptions('Bearer 1');
		await controller.getClientBackups('Bearer 1');

		expect(service.getClientProjects).toHaveBeenCalledWith('Bearer 1');
		expect(service.getClientBackups).toHaveBeenCalledWith('Bearer 1');
	});
});
