import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientPortalService } from './client-portal.service';

describe('ClientPortalService', () => {
	let service: ClientPortalService;

	beforeEach(() => {
		service = new ClientPortalService();
	});

	it('returns empty collections for portal resources', async () => {
		expect(await service.getClientProjects('Bearer 1')).toEqual([]);
		expect(await service.getClientInvoices('Bearer 1')).toEqual([]);
		expect(await service.getClientSubscriptions('Bearer 1')).toEqual([]);
		expect(await service.getClientBackups('Bearer 1')).toEqual([]);
	});

	it('creates ticket and supports detail + reply flow', async () => {
		const ticket = await service.createTicket(
			{ subject: 'Portal issue', message: 'Need help' },
			'Bearer 1',
		);
		const detail = await service.getTicketDetail(ticket.id, 'Bearer 1');
		const reply = await service.replyToTicket(
			ticket.id,
			{ message: 'More details' },
			'Bearer 1',
		);

		expect(detail.id).toBe(ticket.id);
		expect(reply.message).toBe('Reply added successfully');
	});

	it('throws on invalid ticket operations', async () => {
		await expect(
			service.createTicket({ subject: '', message: '' }, 'Bearer 1'),
		).rejects.toBeInstanceOf(BadRequestException);
		await expect(
			service.getTicketDetail(999, 'Bearer 1'),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('returns invoice detail payload', async () => {
		const invoice = await service.getClientInvoiceDetail(10, 'Bearer 1');
		expect(invoice.id).toBe(10);
		expect(invoice.items).toEqual([]);
	});
});
