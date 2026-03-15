import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
	let controller: UsersController;
	let service: jest.Mocked<
		Pick<
			UsersService,
			| 'listUsers'
			| 'getUser'
			| 'createUser'
			| 'updateUser'
			| 'deleteUser'
			| 'resetPassword'
			| 'getCurrentUserPermissions'
		>
	>;

	beforeEach(() => {
		service = {
			listUsers: jest.fn(),
			getUser: jest.fn(),
			createUser: jest.fn(),
			updateUser: jest.fn(),
			deleteUser: jest.fn(),
			resetPassword: jest.fn(),
			getCurrentUserPermissions: jest.fn(),
		};

		controller = new UsersController(service as unknown as UsersService);
	});

	it('delegates list and permission retrieval', async () => {
		service.listUsers.mockResolvedValueOnce([] as never);
		service.listUsers.mockResolvedValueOnce([] as never);
		service.getCurrentUserPermissions.mockResolvedValueOnce({
			permissions: ['*'],
		} as never);
		service.updateUser.mockResolvedValueOnce({ id: 1 } as never);

		await controller.listUsers('admin');
		await controller.listUsersSlash('admin');
		await controller.getCurrentUserPermissions('Bearer token');
		await controller.updateUserLegacy(1, { full_name: 'Admin' });

		expect(service.listUsers).toHaveBeenCalledTimes(2);
		expect(service.listUsers).toHaveBeenCalledWith('admin');
		expect(service.getCurrentUserPermissions).toHaveBeenCalledWith(
			'Bearer token',
		);
		expect(service.updateUser).toHaveBeenCalledWith(1, {
			full_name: 'Admin',
		});
	});
});
