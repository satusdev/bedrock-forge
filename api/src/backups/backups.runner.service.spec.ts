import { BackupsRunnerService } from './backups.runner.service';

describe('BackupsRunnerService', () => {
	afterEach(() => {
		delete process.env.BACKUP_RETENTION_ENABLED;
		delete process.env.BACKUP_FILE_CLEANUP_ENABLED;
		delete process.env.BACKUP_FILE_CLEANUP_DRY_RUN;
	});

	it('claims and executes pending backups', async () => {
		const backupsService = {
			claimPendingBackups: jest
				.fn()
				.mockResolvedValue([{ id: 11, created_by_id: 2 }]),
			recordPendingRunnerSnapshot: jest.fn(),
			markStaleRunningBackupsFailed: jest.fn().mockResolvedValue([]),
			pruneTerminalBackups: jest.fn().mockResolvedValue([]),
			cleanupPrunedLocalArtifacts: jest.fn().mockResolvedValue({ deleted: 0 }),
			recordMaintenanceSnapshot: jest.fn(),
			runBackup: jest.fn().mockResolvedValue({ status: 'accepted' }),
		};
		const service = new BackupsRunnerService(backupsService as unknown as any);

		await service.runPendingBackups();

		expect(backupsService.claimPendingBackups).toHaveBeenCalled();
		expect(backupsService.runBackup).toHaveBeenCalledWith(11, undefined, 2);
		expect(backupsService.recordPendingRunnerSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({ claimed: 1, processed: 1, failed: 0 }),
		);
	});

	it('marks stale running backups as failed in maintenance loop', async () => {
		process.env.BACKUP_RETENTION_ENABLED = 'false';
		process.env.BACKUP_FILE_CLEANUP_ENABLED = 'false';
		const backupsService = {
			claimPendingBackups: jest.fn().mockResolvedValue([]),
			recordPendingRunnerSnapshot: jest.fn(),
			markStaleRunningBackupsFailed: jest.fn().mockResolvedValue([{ id: 55 }]),
			pruneTerminalBackups: jest.fn().mockResolvedValue([{ id: 99 }]),
			cleanupPrunedLocalArtifacts: jest.fn().mockResolvedValue({ deleted: 0 }),
			recordMaintenanceSnapshot: jest.fn(),
			runBackup: jest.fn().mockResolvedValue({ status: 'accepted' }),
		};
		const service = new BackupsRunnerService(backupsService as unknown as any);

		await service.runMaintenance();

		expect(backupsService.markStaleRunningBackupsFailed).toHaveBeenCalled();
		expect(backupsService.pruneTerminalBackups).not.toHaveBeenCalled();
		expect(backupsService.cleanupPrunedLocalArtifacts).not.toHaveBeenCalled();
		expect(backupsService.recordMaintenanceSnapshot).toHaveBeenCalled();
	});

	it('runs retention and artifact cleanup when enabled', async () => {
		process.env.BACKUP_RETENTION_ENABLED = 'true';
		process.env.BACKUP_FILE_CLEANUP_ENABLED = 'true';
		process.env.BACKUP_FILE_CLEANUP_DRY_RUN = 'true';

		const pruned = [
			{
				id: 88,
				storage_type: 'local',
				storage_path: '/tmp/forge-backups/a.tar.gz',
			},
		];
		const backupsService = {
			claimPendingBackups: jest.fn().mockResolvedValue([]),
			recordPendingRunnerSnapshot: jest.fn(),
			markStaleRunningBackupsFailed: jest.fn().mockResolvedValue([]),
			pruneTerminalBackups: jest.fn().mockResolvedValue(pruned),
			cleanupPrunedLocalArtifacts: jest.fn().mockResolvedValue({
				dry_run: true,
				deleted: 1,
				eligible: 1,
				skipped_unsafe: 0,
				missing: 0,
				failed: 0,
			}),
			recordMaintenanceSnapshot: jest.fn(),
			runBackup: jest.fn().mockResolvedValue({ status: 'accepted' }),
		};
		const service = new BackupsRunnerService(backupsService as unknown as any);

		await service.runMaintenance();

		expect(backupsService.pruneTerminalBackups).toHaveBeenCalled();
		expect(backupsService.cleanupPrunedLocalArtifacts).toHaveBeenCalledWith(
			pruned,
			true,
		);
		expect(backupsService.recordMaintenanceSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({
				stale_marked: 0,
				pruned: 1,
				cleanup_deleted: 1,
				duration_ms: expect.any(Number),
			}),
		);
	});

	it('handles pending claim failures without throwing', async () => {
		const backupsService = {
			claimPendingBackups: jest
				.fn()
				.mockRejectedValue(new Error('claim failed')),
			recordPendingRunnerSnapshot: jest.fn(),
			markStaleRunningBackupsFailed: jest.fn().mockResolvedValue([]),
			pruneTerminalBackups: jest.fn().mockResolvedValue([]),
			cleanupPrunedLocalArtifacts: jest.fn().mockResolvedValue({ deleted: 0 }),
			recordMaintenanceSnapshot: jest.fn(),
			runBackup: jest.fn().mockResolvedValue({ status: 'accepted' }),
		};
		const service = new BackupsRunnerService(backupsService as unknown as any);

		await expect(service.runPendingBackups()).resolves.toBeUndefined();
		expect(backupsService.claimPendingBackups).toHaveBeenCalled();
		expect(backupsService.runBackup).not.toHaveBeenCalled();
		expect(backupsService.recordPendingRunnerSnapshot).toHaveBeenCalledWith(
			expect.objectContaining({ claimed: 0, processed: 0, failed: 0 }),
		);
	});

	it('allows maintenance loop when pending loop lock is active', async () => {
		const backupsService = {
			claimPendingBackups: jest.fn().mockResolvedValue([]),
			recordPendingRunnerSnapshot: jest.fn(),
			markStaleRunningBackupsFailed: jest.fn().mockResolvedValue([]),
			pruneTerminalBackups: jest.fn().mockResolvedValue([]),
			cleanupPrunedLocalArtifacts: jest.fn().mockResolvedValue({ deleted: 0 }),
			recordMaintenanceSnapshot: jest.fn(),
			runBackup: jest.fn().mockResolvedValue({ status: 'accepted' }),
		};
		const service = new BackupsRunnerService(backupsService as unknown as any);

		(service as any).isProcessingPending = true;
		await service.runMaintenance();

		expect(backupsService.markStaleRunningBackupsFailed).toHaveBeenCalled();
		expect(backupsService.recordMaintenanceSnapshot).toHaveBeenCalled();
	});
});
