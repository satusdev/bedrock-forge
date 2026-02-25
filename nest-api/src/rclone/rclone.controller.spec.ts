import { RcloneController } from './rclone.controller';
import { RcloneService } from './rclone.service';

describe('RcloneController', () => {
	let controller: RcloneController;
	let service: jest.Mocked<
		Pick<
			RcloneService,
			| 'listRemotes'
			| 'authorize'
			| 'configureS3Remote'
			| 'deleteRemote'
			| 'getInstallInstructions'
		>
	>;

	beforeEach(() => {
		service = {
			listRemotes: jest.fn(),
			authorize: jest.fn(),
			configureS3Remote: jest.fn(),
			deleteRemote: jest.fn(),
			getInstallInstructions: jest.fn(),
		};
		controller = new RcloneController(service as unknown as RcloneService);
	});

	it('delegates all rclone operations', async () => {
		service.listRemotes.mockResolvedValueOnce({ remotes: [] } as never);
		service.authorize.mockResolvedValueOnce({ success: true } as never);
		service.configureS3Remote.mockResolvedValueOnce({ success: true } as never);
		service.deleteRemote.mockResolvedValueOnce({ success: true } as never);
		service.getInstallInstructions.mockReturnValue({
			instructions: {},
		} as never);

		await controller.listRemotes();
		await controller.authorize({ token: '{}', remote_name: 'gdrive' });
		await controller.configureS3Remote({
			access_key_id: 'a',
			secret_access_key: 'b',
		});
		await controller.deleteRemote('gdrive');
		controller.getInstallInstructions();

		expect(service.listRemotes).toHaveBeenCalled();
		expect(service.authorize).toHaveBeenCalled();
		expect(service.configureS3Remote).toHaveBeenCalled();
		expect(service.deleteRemote).toHaveBeenCalledWith('gdrive');
		expect(service.getInstallInstructions).toHaveBeenCalled();
	});
});
