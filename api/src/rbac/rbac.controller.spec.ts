import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';

describe('RbacController', () => {
	let controller: RbacController;
	let service: jest.Mocked<
		Pick<
			RbacService,
			| 'listPermissions'
			| 'seedPermissions'
			| 'listRoles'
			| 'getRole'
			| 'createRole'
			| 'updateRole'
			| 'deleteRole'
			| 'seedRoles'
		>
	>;

	beforeEach(() => {
		service = {
			listPermissions: jest.fn(),
			seedPermissions: jest.fn(),
			listRoles: jest.fn(),
			getRole: jest.fn(),
			createRole: jest.fn(),
			updateRole: jest.fn(),
			deleteRole: jest.fn(),
			seedRoles: jest.fn(),
		};

		controller = new RbacController(service as unknown as RbacService);
	});

	it('delegates list operations', async () => {
		service.listPermissions.mockResolvedValueOnce([] as never);
		service.listRoles.mockResolvedValueOnce([] as never);

		await controller.listPermissions();
		await controller.listRoles();

		expect(service.listPermissions).toHaveBeenCalled();
		expect(service.listRoles).toHaveBeenCalled();
	});
});
