import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { AuthService } from '../auth/auth.service';

describe('SyncController', () => {
	let controller: SyncController;
	let service: jest.Mocked<
		Pick<
			SyncService,
			| 'pullDatabase'
			| 'pushDatabase'
			| 'pullFiles'
			| 'pushFiles'
			| 'getStatus'
			| 'getProjectTaskHistory'
			| 'fullSync'
			| 'runRemoteComposer'
		>
	>;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;

	beforeEach(() => {
		service = {
			pullDatabase: jest.fn(),
			pushDatabase: jest.fn(),
			pullFiles: jest.fn(),
			pushFiles: jest.fn(),
			getStatus: jest.fn(),
			getProjectTaskHistory: jest.fn(),
			fullSync: jest.fn(),
			runRemoteComposer: jest.fn(),
		};
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
		};
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		controller = new SyncController(
			service as unknown as SyncService,
			authService as unknown as AuthService,
		);
	});

	it('delegates sync endpoints', async () => {
		service.pullDatabase.mockResolvedValueOnce({ status: 'accepted' } as never);
		service.pushDatabase.mockResolvedValueOnce({ status: 'accepted' } as never);
		service.pullFiles.mockResolvedValueOnce({ status: 'accepted' } as never);
		service.pushFiles.mockResolvedValueOnce({ status: 'accepted' } as never);
		service.getStatus.mockResolvedValueOnce({ status: 'pending' } as never);
		service.getProjectTaskHistory.mockResolvedValueOnce({
			project_id: 10,
			tasks: [],
		} as never);
		service.fullSync.mockResolvedValueOnce({ status: 'accepted' } as never);
		service.runRemoteComposer.mockResolvedValueOnce({
			status: 'accepted',
		} as never);

		await controller.pullDatabase({ source_project_server_id: 1 }, undefined);
		await controller.pushDatabase({ target_project_server_id: 2 }, undefined);
		await controller.pullFiles({ source_project_server_id: 1 }, undefined);
		await controller.pushFiles({ target_project_server_id: 2 }, undefined);
		await controller.getStatus('task-1');
		await controller.getHistory(10, undefined, undefined);
		await controller.fullSync(
			1,
			'2',
			'true',
			'true',
			'false',
			'false',
			'false',
			undefined,
		);
		await controller.runRemoteComposer(
			{
				project_server_id: 2,
				command: 'update',
			},
			undefined,
		);

		expect(service.pullDatabase).toHaveBeenCalledWith(
			{
				source_project_server_id: 1,
			},
			undefined,
		);
		expect(service.pushDatabase).toHaveBeenCalledWith(
			{
				target_project_server_id: 2,
			},
			undefined,
		);
		expect(service.pullFiles).toHaveBeenCalledWith(
			{
				source_project_server_id: 1,
			},
			undefined,
		);
		expect(service.pushFiles).toHaveBeenCalledWith(
			{
				target_project_server_id: 2,
			},
			undefined,
		);
		expect(service.getStatus).toHaveBeenCalledWith('task-1');
		expect(service.getProjectTaskHistory).toHaveBeenCalledWith(
			10,
			undefined,
			undefined,
		);
		expect(service.fullSync).toHaveBeenCalledWith(
			{
				source_project_server_id: 1,
				target_project_server_id: 2,
				sync_database: true,
				sync_uploads: true,
				sync_plugins: false,
				sync_themes: false,
				dry_run: false,
			},
			undefined,
		);
		expect(service.runRemoteComposer).toHaveBeenCalledWith(
			{
				project_server_id: 2,
				command: 'update',
			},
			undefined,
		);
	});
});
