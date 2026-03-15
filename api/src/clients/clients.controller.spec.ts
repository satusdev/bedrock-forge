import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

describe('ClientsController', () => {
	let controller: ClientsController;
	let service: jest.Mocked<
		Pick<
			ClientsService,
			| 'getAllClients'
			| 'getUserPreferences'
			| 'updateUserPreferences'
			| 'getClient'
			| 'createClient'
			| 'updateClient'
			| 'deleteClient'
			| 'getClientProjects'
			| 'getClientInvoices'
			| 'assignProjectToClient'
			| 'unassignProjectFromClient'
		>
	>;

	beforeEach(() => {
		service = {
			getAllClients: jest.fn(),
			getUserPreferences: jest.fn(),
			updateUserPreferences: jest.fn(),
			getClient: jest.fn(),
			createClient: jest.fn(),
			updateClient: jest.fn(),
			deleteClient: jest.fn(),
			getClientProjects: jest.fn(),
			getClientInvoices: jest.fn(),
			assignProjectToClient: jest.fn(),
			unassignProjectFromClient: jest.fn(),
		};

		controller = new ClientsController(service as unknown as ClientsService);
	});

	it('delegates getAllClients query', async () => {
		const query = { search: 'acme', limit: 10, offset: 0 };
		service.getAllClients.mockResolvedValueOnce({
			clients: [],
			total: 0,
			limit: 10,
			offset: 0,
		});

		await controller.getAllClients(query);
		await controller.getAllClientsSlash(query);

		expect(service.getAllClients).toHaveBeenCalledWith(query);
		expect(service.getAllClients).toHaveBeenCalledTimes(2);
	});

	it('delegates user preferences routes', async () => {
		service.getUserPreferences.mockReturnValueOnce({
			user_id: 'u1',
			timezone: 'UTC',
		} as never);
		service.updateUserPreferences.mockReturnValueOnce({
			status: 'success',
			message: 'User preferences updated',
		} as never);

		await controller.getUserPreferences('u1');
		await controller.updateUserPreferences('u1', { timezone: 'Europe/London' });

		expect(service.getUserPreferences).toHaveBeenCalledWith('u1');
		expect(service.updateUserPreferences).toHaveBeenCalledWith('u1', {
			timezone: 'Europe/London',
		});
	});

	it('delegates getClient id', async () => {
		service.getClient.mockResolvedValueOnce({ id: 1, name: 'Acme' } as never);

		await controller.getClient(1);

		expect(service.getClient).toHaveBeenCalledWith(1);
	});

	it('delegates createClient payload', async () => {
		const payload = { name: 'Acme', email: 'team@acme.com' };
		service.createClient.mockResolvedValueOnce({
			status: 'success',
			message: 'ok',
			client_id: 1,
		});

		await controller.createClient(payload as never);
		await controller.createClientSlash(payload as never);

		expect(service.createClient).toHaveBeenCalledWith(payload);
		expect(service.createClient).toHaveBeenCalledTimes(2);
	});

	it('delegates updateClient params', async () => {
		const payload = { name: 'Acme Updated' };
		service.updateClient.mockResolvedValueOnce({
			status: 'success',
			message: 'updated',
		});

		await controller.updateClient(5, payload as never);

		expect(service.updateClient).toHaveBeenCalledWith(5, payload);
	});

	it('delegates deleteClient id', async () => {
		service.deleteClient.mockResolvedValueOnce({
			status: 'success',
			message: 'deactivated',
		});

		await controller.deleteClient(5);

		expect(service.deleteClient).toHaveBeenCalledWith(5);
	});

	it('delegates project and invoice nested routes', async () => {
		service.getClientProjects.mockResolvedValueOnce({
			client_id: 1,
			client_name: 'Acme',
			projects: [],
		});
		service.getClientInvoices.mockResolvedValueOnce({
			client_id: 1,
			client_name: 'Acme',
			invoices: [],
		} as never);

		await controller.getClientProjects(1);
		await controller.getClientInvoices(1);

		expect(service.getClientProjects).toHaveBeenCalledWith(1);
		expect(service.getClientInvoices).toHaveBeenCalledWith(1);
	});

	it('delegates assign and unassign routes', async () => {
		service.assignProjectToClient.mockResolvedValueOnce({
			status: 'success',
			message: 'assigned',
		});
		service.unassignProjectFromClient.mockResolvedValueOnce({
			status: 'success',
			message: 'unassigned',
		});

		await controller.assignProjectToClient(1, 9);
		await controller.unassignProjectFromClient(1, 9);

		expect(service.assignProjectToClient).toHaveBeenCalledWith(1, 9);
		expect(service.unassignProjectFromClient).toHaveBeenCalledWith(1, 9);
	});
});
