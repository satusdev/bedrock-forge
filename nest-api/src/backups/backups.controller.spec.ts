import { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

describe('BackupsController', () => {
	let controller: BackupsController;
	let service: jest.Mocked<
		Pick<
			BackupsService,
			| 'listBackups'
			| 'createBackup'
			| 'runBackup'
			| 'pullRemoteBackup'
			| 'scheduleBackup'
			| 'getBackupSchedule'
			| 'getBackupStatsSummary'
			| 'getMaintenanceSnapshot'
			| 'bulkCreateBackups'
			| 'bulkDeleteBackups'
			| 'getBackup'
			| 'deleteBackup'
			| 'getBackupDownloadMetadata'
			| 'restoreBackup'
			| 'restoreBackupRemote'
		>
	>;
	let authService: jest.Mocked<
		Pick<AuthService, 'resolveOptionalUserIdFromAuthorizationHeader'>
	>;

	beforeEach(() => {
		service = {
			listBackups: jest.fn(),
			createBackup: jest.fn(),
			runBackup: jest.fn(),
			pullRemoteBackup: jest.fn(),
			scheduleBackup: jest.fn(),
			getBackupSchedule: jest.fn(),
			getBackupStatsSummary: jest.fn(),
			getMaintenanceSnapshot: jest.fn(),
			bulkCreateBackups: jest.fn(),
			bulkDeleteBackups: jest.fn(),
			getBackup: jest.fn(),
			deleteBackup: jest.fn(),
			getBackupDownloadMetadata: jest.fn(),
			restoreBackup: jest.fn(),
			restoreBackupRemote: jest.fn(),
		};
		authService = {
			resolveOptionalUserIdFromAuthorizationHeader: jest.fn(),
		};
		authService.resolveOptionalUserIdFromAuthorizationHeader.mockResolvedValue(
			undefined,
		);
		controller = new BackupsController(
			service as unknown as BackupsService,
			authService as unknown as AuthService,
		);
	});

	it('delegates list/create/get/delete/restore', async () => {
		service.listBackups.mockResolvedValueOnce([]);
		service.createBackup.mockResolvedValueOnce({ status: 'pending' } as never);
		service.runBackup.mockResolvedValueOnce({ status: 'accepted' } as never);
		service.pullRemoteBackup.mockResolvedValueOnce({
			status: 'accepted',
		} as never);
		service.scheduleBackup.mockResolvedValueOnce({
			schedule_type: 'daily',
		} as never);
		service.getBackupSchedule.mockResolvedValueOnce({
			project_id: 1,
		} as never);
		service.getBackupStatsSummary.mockResolvedValueOnce({
			total_backups: 0,
		} as never);
		service.getMaintenanceSnapshot.mockReturnValueOnce({
			runs_total: 1,
			last_run_at: '2026-03-04T13:25:00.000Z',
		} as never);
		service.getBackup.mockResolvedValueOnce({ id: 1 } as never);
		service.deleteBackup.mockResolvedValueOnce(undefined);
		service.restoreBackup.mockResolvedValueOnce({ status: 'pending' } as never);
		service.restoreBackupRemote.mockResolvedValueOnce({
			status: 'accepted',
		} as never);
		service.bulkCreateBackups.mockResolvedValueOnce({
			total_requested: 1,
		} as never);
		service.bulkDeleteBackups.mockResolvedValueOnce({
			total_requested: 1,
		} as never);

		await controller.listBackups(
			'1',
			'full',
			'completed',
			'0',
			'10',
			'1',
			'10',
			undefined,
		);
		await controller.createBackup({ project_id: 1 } as never, undefined);
		await controller.createBackupSlash({ project_id: 1 } as never, undefined);
		await controller.runBackup(1, { project_id: 1 }, undefined);
		await controller.pullRemoteBackup({ project_server_id: 5 }, undefined);
		await controller.scheduleBackup({ project_id: 1 }, undefined);
		await controller.getBackupSchedule(1, undefined);
		await controller.getBackupStatsSummary(undefined);
		controller.getMaintenanceStatus();
		await controller.getBackup(1, undefined);
		await controller.deleteBackup(1, 'true', 'true', undefined);
		await controller.restoreBackup(
			1,
			{ database: true, files: true },
			undefined,
		);
		await controller.restoreBackupRemote(
			1,
			{
				project_server_id: 5,
				database: true,
				files: true,
			},
			undefined,
		);
		await controller.bulkCreateBackups({ project_ids: [1] }, undefined);
		await controller.bulkDeleteBackups(
			{ backup_ids: [1], force: true },
			undefined,
		);

		expect(service.listBackups).toHaveBeenCalledWith(
			expect.objectContaining({ owner_id: undefined }),
		);
		expect(service.createBackup).toHaveBeenCalledTimes(2);
		expect(service.createBackup).toHaveBeenCalledWith(
			{ project_id: 1 },
			undefined,
		);
		expect(service.runBackup).toHaveBeenCalledWith(
			1,
			{ project_id: 1 },
			undefined,
		);
		expect(service.pullRemoteBackup).toHaveBeenCalledWith(
			{
				project_server_id: 5,
			},
			undefined,
		);
		expect(service.scheduleBackup).toHaveBeenCalledWith(
			{ project_id: 1 },
			undefined,
		);
		expect(service.getBackupSchedule).toHaveBeenCalledWith(1, undefined);
		expect(service.getBackupStatsSummary).toHaveBeenCalledWith(undefined);
		expect(service.getMaintenanceSnapshot).toHaveBeenCalled();
		expect(service.getBackup).toHaveBeenCalledWith(1, undefined);
		expect(service.deleteBackup).toHaveBeenCalledWith(1, true, undefined, true);

		await controller.deleteBackup(2, 'false', 'false', undefined);
		expect(service.deleteBackup).toHaveBeenCalledWith(
			2,
			false,
			undefined,
			false,
		);
		expect(service.restoreBackup).toHaveBeenCalledWith(
			1,
			{
				database: true,
				files: true,
			},
			undefined,
		);
		expect(service.restoreBackupRemote).toHaveBeenCalledWith(
			1,
			{
				project_server_id: 5,
				database: true,
				files: true,
			},
			undefined,
		);
		expect(service.bulkCreateBackups).toHaveBeenCalledWith(
			{
				project_ids: [1],
			},
			undefined,
		);
		expect(service.bulkDeleteBackups).toHaveBeenCalledWith(
			{
				backup_ids: [1],
				force: true,
			},
			undefined,
		);
	});

	it('writes download payload to response', async () => {
		const setHeader = jest.fn();
		const send = jest.fn();
		const response = { setHeader, send } as unknown as Response;
		service.getBackupDownloadMetadata.mockResolvedValueOnce({
			filename: 'backup.tar.gz',
			content: 'abc',
		});

		await controller.downloadBackup(5, response, undefined);

		expect(setHeader).toHaveBeenCalledWith(
			'Content-Type',
			'application/octet-stream',
		);
		expect(send).toHaveBeenCalled();
	});
});
