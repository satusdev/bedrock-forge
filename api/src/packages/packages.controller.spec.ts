import { PackagesController } from './packages.controller';
import { PackagesService } from './packages.service';

describe('PackagesController', () => {
	let controller: PackagesController;
	let service: jest.Mocked<
		Pick<
			PackagesService,
			| 'listPackages'
			| 'getPackage'
			| 'createPackage'
			| 'updatePackage'
			| 'deactivatePackage'
		>
	>;

	beforeEach(() => {
		service = {
			listPackages: jest.fn(),
			getPackage: jest.fn(),
			createPackage: jest.fn(),
			updatePackage: jest.fn(),
			deactivatePackage: jest.fn(),
		};
		controller = new PackagesController(service as unknown as PackagesService);
	});

	it('delegates package routes', async () => {
		service.listPackages.mockResolvedValueOnce({ packages: [] } as never);
		service.getPackage.mockResolvedValueOnce({ id: 1 } as never);
		service.createPackage.mockResolvedValueOnce({ status: 'success' } as never);
		service.updatePackage.mockResolvedValueOnce({ status: 'success' } as never);
		service.deactivatePackage.mockResolvedValueOnce({
			status: 'success',
		} as never);

		await controller.listPackages('true');
		await controller.getPackage(1);
		await controller.createPackage({ name: 'Starter', slug: 'starter' });
		await controller.updatePackage(1, { is_featured: true });
		await controller.deactivatePackage(1);

		expect(service.listPackages).toHaveBeenCalledWith(true, undefined);
		expect(service.getPackage).toHaveBeenCalledWith(1);
		expect(service.createPackage).toHaveBeenCalledWith({
			name: 'Starter',
			slug: 'starter',
		});
		expect(service.updatePackage).toHaveBeenCalledWith(1, {
			is_featured: true,
		});
		expect(service.deactivatePackage).toHaveBeenCalledWith(1);
	});
});
