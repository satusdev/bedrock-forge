import { LocalController } from './local.controller';
import { LocalService } from './local.service';

describe('LocalController', () => {
	let controller: LocalController;
	let service: jest.Mocked<
		Pick<
			LocalService,
			| 'checkLocalAvailability'
			| 'getBaseDirectory'
			| 'ensureBaseDirectory'
			| 'discoverLocalProjects'
			| 'importDiscoveredProject'
			| 'runComposerUpdate'
			| 'runComposerInstall'
		>
	>;

	beforeEach(() => {
		service = {
			checkLocalAvailability: jest.fn(),
			getBaseDirectory: jest.fn(),
			ensureBaseDirectory: jest.fn(),
			discoverLocalProjects: jest.fn(),
			importDiscoveredProject: jest.fn(),
			runComposerUpdate: jest.fn(),
			runComposerInstall: jest.fn(),
		};

		controller = new LocalController(service as unknown as LocalService);
	});

	it('delegates composer commands', async () => {
		service.checkLocalAvailability.mockResolvedValueOnce({
			ddev_installed: true,
		} as never);
		service.getBaseDirectory.mockResolvedValueOnce({
			base_directory: '/tmp',
		} as never);
		service.ensureBaseDirectory.mockResolvedValueOnce({
			status: 'exists',
		} as never);
		service.discoverLocalProjects.mockResolvedValueOnce({
			discovered: [],
		} as never);
		service.importDiscoveredProject.mockResolvedValueOnce({
			status: 'imported',
		} as never);
		service.runComposerUpdate.mockResolvedValueOnce({
			status: 'success',
		} as never);
		service.runComposerInstall.mockResolvedValueOnce({
			status: 'success',
		} as never);

		await controller.checkLocalAvailability();
		await controller.getBaseDirectory();
		await controller.ensureBaseDirectory();
		await controller.discoverLocalProjects();
		await controller.importDiscoveredProject('acme');
		await controller.runComposerUpdate('acme');
		await controller.runComposerInstall('acme');

		expect(service.importDiscoveredProject).toHaveBeenCalledWith('acme');
		expect(service.runComposerUpdate).toHaveBeenCalledWith('acme');
		expect(service.runComposerInstall).toHaveBeenCalledWith('acme');
	});
});
