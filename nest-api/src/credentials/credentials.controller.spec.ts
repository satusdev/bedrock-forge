import { CredentialsController } from './credentials.controller';
import { CredentialsService } from './credentials.service';
import { AuthService } from '../auth/auth.service';

describe('CredentialsController', () => {
	let controller: CredentialsController;
	let service: jest.Mocked<
		Pick<
			CredentialsService,
			| 'listCredentials'
			| 'createCredential'
			| 'getCredential'
			| 'updateCredential'
			| 'deleteCredential'
			| 'generateQuickLogin'
			| 'validateQuickLoginToken'
			| 'validateAutologinToken'
		>
	>;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;

	beforeEach(() => {
		service = {
			listCredentials: jest.fn(),
			createCredential: jest.fn(),
			getCredential: jest.fn(),
			updateCredential: jest.fn(),
			deleteCredential: jest.fn(),
			generateQuickLogin: jest.fn(),
			validateQuickLoginToken: jest.fn(),
			validateAutologinToken: jest.fn(),
		};
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
		};
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		controller = new CredentialsController(
			service as unknown as CredentialsService,
			authService as unknown as AuthService,
		);
	});

	it('delegates credentials routes', async () => {
		service.listCredentials.mockResolvedValueOnce([]);
		service.createCredential.mockResolvedValueOnce({ id: 1 } as never);
		service.getCredential.mockResolvedValueOnce({ id: 1 } as never);
		service.updateCredential.mockResolvedValueOnce({ id: 1 } as never);
		service.deleteCredential.mockResolvedValueOnce(undefined);
		service.generateQuickLogin.mockResolvedValueOnce({
			method: 'auto',
		} as never);
		service.validateQuickLoginToken.mockResolvedValueOnce({
			status: 'valid',
		} as never);
		service.validateAutologinToken.mockResolvedValueOnce({
			valid: true,
		} as never);

		await controller.listCredentials(2, undefined);
		await controller.createCredential(
			2,
			{
				username: 'admin',
				password: 'secret',
			},
			undefined,
		);
		await controller.getCredential(2, 1, undefined);
		await controller.updateCredential(2, 1, { notes: 'updated' }, undefined);
		await controller.deleteCredential(2, 1, undefined);
		await controller.generateQuickLogin(
			2,
			1,
			{
				method: 'manual',
			},
			undefined,
		);
		await controller.validateQuickLoginToken('tok');
		await controller.validateAutologinToken('tok');

		expect(service.listCredentials).toHaveBeenCalledWith(2, undefined);
		expect(service.createCredential).toHaveBeenCalledWith(
			2,
			{
				username: 'admin',
				password: 'secret',
			},
			undefined,
		);
		expect(service.getCredential).toHaveBeenCalledWith(2, 1, undefined);
		expect(service.updateCredential).toHaveBeenCalledWith(
			2,
			1,
			{
				notes: 'updated',
			},
			undefined,
		);
		expect(service.deleteCredential).toHaveBeenCalledWith(2, 1, undefined);
		expect(service.generateQuickLogin).toHaveBeenCalledWith(
			2,
			1,
			{
				method: 'manual',
			},
			undefined,
		);
		expect(service.validateQuickLoginToken).toHaveBeenCalledWith('tok');
		expect(service.validateAutologinToken).toHaveBeenCalledWith('tok');
	});
});
