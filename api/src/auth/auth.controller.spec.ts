import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
	let controller: AuthController;
	let service: jest.Mocked<
		Pick<
			AuthService,
			'login' | 'register' | 'refresh' | 'me' | 'updateMe' | 'changePassword'
		>
	>;

	beforeEach(() => {
		service = {
			login: jest.fn(),
			register: jest.fn(),
			refresh: jest.fn(),
			me: jest.fn(),
			updateMe: jest.fn(),
			changePassword: jest.fn(),
		};

		controller = new AuthController(service as unknown as AuthService);
	});

	it('delegates login payload to authService.login', async () => {
		const payload = { username: 'admin', password: 'Password123!' };
		service.login.mockResolvedValueOnce({
			access_token: 'access',
			refresh_token: 'refresh',
			token_type: 'bearer',
		});

		const result = await controller.login(payload);

		expect(service.login).toHaveBeenCalledWith(payload);
		expect(result.token_type).toBe('bearer');
	});

	it('delegates register payload to authService.register', async () => {
		const payload = {
			username: 'newadmin',
			email: 'newadmin@example.com',
			password: 'Password123!',
		};
		service.register.mockResolvedValueOnce({
			id: 10,
			email: payload.email,
			username: payload.username,
			full_name: null,
			is_active: true,
			is_superuser: false,
			created_at: new Date(),
			updated_at: new Date(),
		});

		const result = await controller.register(payload);

		expect(service.register).toHaveBeenCalledWith(payload);
		expect(result.email).toBe(payload.email);
	});

	it('delegates refresh payload to authService.refresh', async () => {
		const payload = { refresh_token: 'refresh-token-value' };
		service.refresh.mockResolvedValueOnce({
			access_token: 'new-access',
			refresh_token: 'new-refresh',
			token_type: 'bearer',
		});

		const result = await controller.refresh(payload);

		expect(service.refresh).toHaveBeenCalledWith(payload);
		expect(result.access_token).toBe('new-access');
	});

	it('delegates current user context to authService.me', async () => {
		const currentUser = {
			id: 1,
			email: 'admin@example.com',
			username: 'admin',
			full_name: null,
			is_active: true,
			is_superuser: false,
		};
		service.me.mockResolvedValueOnce({
			id: 1,
			email: 'admin@example.com',
			username: 'admin',
			full_name: null,
			is_active: true,
			is_superuser: false,
			created_at: new Date(),
			updated_at: new Date(),
		});

		const result = await controller.me(currentUser);

		expect(service.me).toHaveBeenCalledWith(currentUser);
		expect(result.username).toBe('admin');
	});

	it('delegates payload + current user to authService.updateMe', async () => {
		const payload = { full_name: 'Updated User' };
		const currentUser = {
			id: 1,
			email: 'admin@example.com',
			username: 'admin',
			full_name: null,
			is_active: true,
			is_superuser: false,
		};
		service.updateMe.mockResolvedValueOnce({
			id: 1,
			email: 'admin@example.com',
			username: 'admin',
			full_name: 'Updated User',
			is_active: true,
			is_superuser: false,
			created_at: new Date(),
			updated_at: new Date(),
		});

		const result = await controller.updateMe(payload, currentUser);

		expect(service.updateMe).toHaveBeenCalledWith(payload, currentUser);
		expect(result.full_name).toBe('Updated User');
	});

	it('delegates payload + current user to authService.changePassword', async () => {
		const payload = {
			current_password: 'Current123!',
			new_password: 'NewPassword123!',
		};
		const currentUser = {
			id: 1,
			email: 'admin@example.com',
			username: 'admin',
			full_name: null,
			is_active: true,
			is_superuser: false,
		};
		service.changePassword.mockResolvedValueOnce({
			message: 'Password changed successfully',
		});

		const result = await controller.changePassword(payload, currentUser);

		expect(service.changePassword).toHaveBeenCalledWith(payload, currentUser);
		expect(result.message).toBe('Password changed successfully');
	});
});
