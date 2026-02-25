import { ImportProjectsController } from './import-projects.controller';
import { ImportProjectsService } from './import-projects.service';
import { AuthService } from '../auth/auth.service';

describe('ImportProjectsController', () => {
	let controller: ImportProjectsController;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;
	let service: jest.Mocked<
		Pick<
			ImportProjectsService,
			'listServerWebsites' | 'importWebsite' | 'importAllWebsites'
		>
	>;

	beforeEach(() => {
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest
				.fn()
				.mockResolvedValue(undefined),
		};

		service = {
			listServerWebsites: jest.fn(),
			importWebsite: jest.fn(),
			importAllWebsites: jest.fn(),
		};

		controller = new ImportProjectsController(
			service as unknown as ImportProjectsService,
			authService as unknown as AuthService,
		);
	});

	it('delegates import-projects endpoints', async () => {
		service.listServerWebsites.mockResolvedValueOnce([]);
		service.importWebsite.mockResolvedValueOnce({
			success: true,
		} as never);
		service.importAllWebsites.mockResolvedValueOnce({
			total_websites: 0,
			imported: 0,
			skipped: 0,
			results: [],
		} as never);

		await controller.listServerWebsites(7);
		await controller.importWebsite(7, {
			domain: 'acme.test',
			environment: 'production',
			create_monitor: true,
		});
		await controller.importAllWebsites(7, 'staging', 'false', 'true');

		expect(service.listServerWebsites).toHaveBeenCalledWith(7, undefined);
		expect(service.importWebsite).toHaveBeenCalledWith(
			7,
			{
				domain: 'acme.test',
				environment: 'production',
				create_monitor: true,
			},
			undefined,
		);
		expect(service.importAllWebsites).toHaveBeenCalledWith(
			7,
			{
				environment: 'staging',
				create_monitors: false,
				wordpress_only: true,
			},
			undefined,
		);
	});
});
