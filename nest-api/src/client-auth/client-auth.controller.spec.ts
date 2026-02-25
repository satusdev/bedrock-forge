import { UnauthorizedException } from '@nestjs/common';
import { ClientAuthController } from './client-auth.controller';
import { ClientAuthService } from './client-auth.service';

describe('ClientAuthController', () => {
	let controller: ClientAuthController;
	let service: jest.Mocked<Pick<ClientAuthService, 'login' | 'me' | 'refresh'>>;

	beforeEach(() => {
		service = {
			login: jest.fn(),
			me: jest.fn(),
			refresh: jest.fn(),
		};

		controller = new ClientAuthController(
			service as unknown as ClientAuthService,
		);
	});

	it('delegates login payload to clientAuthService.login', async () => {
		const payload = {
			email: 'client@example.com',
			password: 'ClientPassword123!',
		};
		service.login.mockResolvedValueOnce({
			access_token: 'access-token',
			token_type: 'bearer',
			client_id: 501,
			client_name: 'Acme Corp',
			role: 'owner',
		});

		const result = await controller.login(payload);

		expect(service.login).toHaveBeenCalledWith(payload);
		expect(result.client_name).toBe('Acme Corp');
	});

	it('uses token query param for me when provided', async () => {
		service.me.mockResolvedValueOnce({
			id: 11,
			email: 'client@example.com',
			full_name: 'Client User',
			client_id: 501,
			client_name: 'Acme Corp',
			company: 'Acme',
			role: 'owner',
		});

		await controller.me('query-token', 'Bearer header-token');

		expect(service.me).toHaveBeenCalledWith('query-token');
	});

	it('uses bearer header token for me when query token is absent', async () => {
		service.me.mockResolvedValueOnce({
			id: 11,
			email: 'client@example.com',
			full_name: 'Client User',
			client_id: 501,
			client_name: 'Acme Corp',
			company: 'Acme',
			role: 'owner',
		});

		await controller.me(undefined, 'Bearer header-token');

		expect(service.me).toHaveBeenCalledWith('header-token');
	});

	it('throws unauthorized for me when no credentials are present', async () => {
		await expect(controller.me(undefined, undefined)).rejects.toBeInstanceOf(
			UnauthorizedException,
		);
	});

	it('uses bearer header token for refresh', async () => {
		service.refresh.mockResolvedValueOnce({
			access_token: 'new-access-token',
			token_type: 'bearer',
			client_id: 501,
			client_name: 'Acme Corp',
			role: 'owner',
		});

		const result = await controller.refresh('Bearer refresh-token');

		expect(service.refresh).toHaveBeenCalledWith('refresh-token');
		expect(result.access_token).toBe('new-access-token');
	});

	it('throws unauthorized for refresh when header is missing', async () => {
		await expect(controller.refresh(undefined)).rejects.toBeInstanceOf(
			UnauthorizedException,
		);
	});

	it('returns static success payload for logout', async () => {
		const result = await controller.logout();

		expect(result).toEqual({ message: 'Logged out successfully' });
	});
});
