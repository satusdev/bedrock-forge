import { StatusController } from './status.controller';
import { StatusService } from './status.service';
import { AuthService } from '../auth/auth.service';

describe('StatusController', () => {
	let controller: StatusController;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;
	let service: jest.Mocked<
		Pick<StatusService, 'getStatusPage' | 'getStatusHistory'>
	>;

	beforeEach(() => {
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest
				.fn()
				.mockResolvedValue(undefined),
		};

		service = {
			getStatusPage: jest.fn(),
			getStatusHistory: jest.fn(),
		};
		controller = new StatusController(
			service as unknown as StatusService,
			authService as unknown as AuthService,
		);
	});

	it('delegates status page and history lookups', async () => {
		service.getStatusPage.mockResolvedValueOnce({} as never);
		service.getStatusHistory.mockResolvedValueOnce({} as never);

		await controller.getStatusPage(3, '2', '15');
		await controller.getStatusHistory(3, '45');

		expect(service.getStatusPage).toHaveBeenCalledWith(3, 2, 15, undefined);
		expect(service.getStatusHistory).toHaveBeenCalledWith(3, 45, undefined);
	});
});
