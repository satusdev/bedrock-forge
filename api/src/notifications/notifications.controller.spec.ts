import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { AuthService } from '../auth/auth.service';

describe('NotificationsController', () => {
	let controller: NotificationsController;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;
	let service: jest.Mocked<
		Pick<
			NotificationsService,
			| 'getChannels'
			| 'getChannel'
			| 'createChannel'
			| 'updateChannel'
			| 'deleteChannel'
			| 'testChannel'
		>
	>;

	beforeEach(() => {
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest
				.fn()
				.mockResolvedValue(undefined),
		};

		service = {
			getChannels: jest.fn(),
			getChannel: jest.fn(),
			createChannel: jest.fn(),
			updateChannel: jest.fn(),
			deleteChannel: jest.fn(),
			testChannel: jest.fn(),
		};

		controller = new NotificationsController(
			service as unknown as NotificationsService,
			authService as unknown as AuthService,
		);
	});

	it('delegates channel operations', async () => {
		service.getChannels.mockResolvedValueOnce([] as never);
		service.testChannel.mockResolvedValueOnce({ status: 'success' } as never);

		await controller.getChannels();
		await controller.testChannel({ channel_type: 'email', config: {} });

		expect(service.getChannels).toHaveBeenCalledWith(undefined);
		expect(service.testChannel).toHaveBeenCalledWith(
			{
				channel_type: 'email',
				config: {},
			},
			undefined,
		);
	});
});
