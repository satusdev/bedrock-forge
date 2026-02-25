import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

describe('SettingsController', () => {
	let controller: SettingsController;
	let service: jest.Mocked<
		Pick<SettingsService, 'getSystemSSHKey' | 'updateSystemSSHKey'>
	>;

	beforeEach(() => {
		service = {
			getSystemSSHKey: jest.fn(),
			updateSystemSSHKey: jest.fn(),
		};
		controller = new SettingsController(service as unknown as SettingsService);
	});

	it('delegates ssh key routes', async () => {
		service.getSystemSSHKey.mockResolvedValueOnce({
			configured: false,
		} as never);
		service.updateSystemSSHKey.mockResolvedValueOnce({
			configured: true,
		} as never);

		await controller.getSystemSSHKey();
		await controller.updateSystemSSHKey({ private_key: 'key' });

		expect(service.getSystemSSHKey).toHaveBeenCalled();
		expect(service.updateSystemSSHKey).toHaveBeenCalledWith('key');
	});
});
