import { MigrationsController } from './migrations.controller';
import { MigrationsService } from './migrations.service';
import { AuthService } from '../auth/auth.service';

describe('MigrationsController', () => {
	let controller: MigrationsController;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;
	let service: jest.Mocked<
		Pick<MigrationsService, 'migrateUrlReplace' | 'cloneFromDrive'>
	>;

	beforeEach(() => {
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest
				.fn()
				.mockResolvedValue(undefined),
		};

		service = {
			migrateUrlReplace: jest.fn(),
			cloneFromDrive: jest.fn(),
		};
		controller = new MigrationsController(
			service as unknown as MigrationsService,
			authService as unknown as AuthService,
		);
	});

	it('delegates migrations routes', async () => {
		service.migrateUrlReplace.mockResolvedValueOnce({
			status: 'accepted',
		} as never);
		service.cloneFromDrive.mockResolvedValueOnce({
			status: 'accepted',
		} as never);

		await controller.migrateUrlReplace({
			project_server_id: 4,
			source_url: 'https://old.test',
			target_url: 'https://new.test',
		});
		await controller.cloneFromDrive({
			project_id: 1,
			target_server_id: 2,
			target_domain: 'clone.test',
			environment: 'production',
			backup_timestamp: '2026-02-18T00:00:00Z',
		});

		expect(service.migrateUrlReplace).toHaveBeenCalledWith(
			{
				project_server_id: 4,
				source_url: 'https://old.test',
				target_url: 'https://new.test',
			},
			undefined,
		);
		expect(service.cloneFromDrive).toHaveBeenCalledWith(
			{
				project_id: 1,
				target_server_id: 2,
				target_domain: 'clone.test',
				environment: 'production',
				backup_timestamp: '2026-02-18T00:00:00Z',
			},
			undefined,
		);
	});
});
