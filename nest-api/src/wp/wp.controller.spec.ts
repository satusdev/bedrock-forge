import { WpController } from './wp.controller';
import { WpService } from './wp.service';
import { AuthService } from '../auth/auth.service';

describe('WpController', () => {
	let controller: WpController;
	let service: jest.Mocked<
		Pick<
			WpService,
			| 'runCommand'
			| 'getSiteState'
			| 'triggerSiteScan'
			| 'triggerBulkUpdate'
			| 'getPendingUpdates'
			| 'getUpdateHistory'
		>
	>;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;

	beforeEach(() => {
		service = {
			runCommand: jest.fn(),
			getSiteState: jest.fn(),
			triggerSiteScan: jest.fn(),
			triggerBulkUpdate: jest.fn(),
			getPendingUpdates: jest.fn(),
			getUpdateHistory: jest.fn(),
		};
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
		};
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);

		controller = new WpController(
			service as unknown as WpService,
			authService as unknown as AuthService,
		);
	});

	it('delegates command execution', async () => {
		service.runCommand.mockResolvedValueOnce({ status: 'queued' } as never);
		service.getSiteState.mockResolvedValueOnce({
			project_server_id: 3,
		} as never);
		service.triggerSiteScan.mockResolvedValueOnce({
			status: 'queued',
		} as never);
		service.triggerBulkUpdate.mockResolvedValueOnce({
			task_id: 'bulk-1',
			sites_queued: 2,
			message: 'Update queued for 2 sites',
		} as never);
		service.getPendingUpdates.mockResolvedValueOnce({
			total_sites: 1,
			sites_with_updates: 1,
			total_updates: 1,
			updates: [],
		} as never);
		service.getUpdateHistory.mockResolvedValueOnce({
			total: 1,
			updates: [],
		} as never);

		await controller.getWpSiteState(3, undefined);
		await controller.triggerWpScan(3, undefined);

		await controller.runWpCommand(
			{
				project_server_id: 3,
				command: 'plugin',
				args: ['list'],
			},
			undefined,
		);
		await controller.runWpCommandLegacy(
			{
				project_server_id: 3,
				command: 'plugin',
				args: ['list'],
			},
			undefined,
		);
		await controller.getPendingUpdates(undefined);
		await controller.triggerBulkUpdate({ update_type: 'core' }, undefined);
		await controller.getUpdateHistory('3', '25', undefined);

		expect(service.getSiteState).toHaveBeenCalledWith(3, undefined);
		expect(service.triggerSiteScan).toHaveBeenCalledWith(3, undefined);

		expect(service.runCommand).toHaveBeenCalledWith(
			{
				project_server_id: 3,
				command: 'plugin',
				args: ['list'],
			},
			undefined,
		);
		expect(service.runCommand).toHaveBeenCalledTimes(2);
		expect(service.getPendingUpdates).toHaveBeenCalledWith(undefined);
		expect(service.triggerBulkUpdate).toHaveBeenCalledWith(
			{
				update_type: 'core',
			},
			undefined,
		);
		expect(service.getUpdateHistory).toHaveBeenCalledWith(3, 25, undefined);
	});
});
