import { GdriveController } from './gdrive.controller';
import { GdriveService } from './gdrive.service';

describe('GdriveController', () => {
	let controller: GdriveController;
	let service: jest.Mocked<
		Pick<GdriveService, 'getStatus' | 'getStorageUsage' | 'listFolders'>
	>;

	beforeEach(() => {
		service = {
			getStatus: jest.fn(),
			getStorageUsage: jest.fn(),
			listFolders: jest.fn(),
		};
		controller = new GdriveController(service as unknown as GdriveService);
	});

	it('delegates gdrive endpoints', async () => {
		service.getStatus.mockResolvedValueOnce({ configured: true } as never);
		service.getStorageUsage.mockResolvedValueOnce({
			storage_usage: {},
		} as never);
		service.listFolders.mockResolvedValueOnce({ folders: [] } as never);

		await controller.getStatus();
		await controller.getStorage();
		await controller.listFolders({
			query: 'acme',
			path: 'WebDev/Projects',
			shared_with_me: 'false',
			max_results: '25',
		});

		expect(service.getStatus).toHaveBeenCalled();
		expect(service.getStorageUsage).toHaveBeenCalled();
		expect(service.listFolders).toHaveBeenCalledWith({
			query: 'acme',
			path: 'WebDev/Projects',
			shared_with_me: false,
			max_results: 25,
		});
	});
});
