import {
	BadRequestException,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { BackupsService } from './backups.service';

type MockWebsocketCompatService = {
	broadcast: jest.Mock;
};

type MockBackupsRepository = {
	listOwnedBackups: jest.Mock;
	ensureOwnedProject: jest.Mock;
	getOwnedProjectEnvironment: jest.Mock;
	createOwnedBackup: jest.Mock;
	getOwnedBackup: jest.Mock;
	setBackupRunning: jest.Mock;
	updateBackupLogs: jest.Mock;
	completeBackup: jest.Mock;
	failBackup: jest.Mock;
	getBackupExecutionContext: jest.Mock;
	claimPendingBackups: jest.Mock;
	markStaleRunningBackupsFailed: jest.Mock;
	pruneTerminalBackups: jest.Mock;
	getSystemPrivateKey: jest.Mock;
	deleteBackupById: jest.Mock;
	getOwnedProjectEnvironmentByServerId: jest.Mock;
	bulkGetOwnedProjects: jest.Mock;
	bulkCreateBackupRecord: jest.Mock;
	bulkGetOwnedBackupsByIds: jest.Mock;
	getBackupStatsSummary: jest.Mock;
	loadRunnerSnapshot: jest.Mock;
	persistRunnerSnapshot: jest.Mock;
	getOwnedProject: jest.Mock;
};

type MockDriveRuntimeConfigService = {
	checkRemoteConfigured: jest.Mock;
};

describe('BackupsService', () => {
	let service: BackupsService;
	let backupsRepository: MockBackupsRepository;
	let websocketCompatService: MockWebsocketCompatService;
	let driveRuntimeConfigService: MockDriveRuntimeConfigService;

	beforeEach(() => {
		websocketCompatService = {
			broadcast: jest.fn(),
		};
		backupsRepository = {
			listOwnedBackups: jest.fn(),
			ensureOwnedProject: jest.fn(),
			getOwnedProjectEnvironment: jest.fn(),
			createOwnedBackup: jest.fn(),
			getOwnedBackup: jest.fn(),
			setBackupRunning: jest.fn().mockResolvedValue(undefined),
			updateBackupLogs: jest.fn().mockResolvedValue(undefined),
			completeBackup: jest.fn().mockResolvedValue(undefined),
			failBackup: jest.fn().mockResolvedValue(undefined),
			getBackupExecutionContext: jest.fn(),
			claimPendingBackups: jest.fn(),
			markStaleRunningBackupsFailed: jest.fn(),
			pruneTerminalBackups: jest.fn(),
			getSystemPrivateKey: jest.fn(),
			deleteBackupById: jest.fn().mockResolvedValue(undefined),
			getOwnedProjectEnvironmentByServerId: jest.fn(),
			bulkGetOwnedProjects: jest.fn(),
			bulkCreateBackupRecord: jest.fn(),
			bulkGetOwnedBackupsByIds: jest.fn(),
			getBackupStatsSummary: jest.fn(),
			loadRunnerSnapshot: jest.fn().mockResolvedValue(null),
			persistRunnerSnapshot: jest.fn().mockResolvedValue(undefined),
			getOwnedProject: jest.fn(),
		};
		driveRuntimeConfigService = {
			checkRemoteConfigured: jest.fn().mockResolvedValue({
				configured: true,
				message: 'rclone remote configured',
				runtime: {
					remoteName: 'gdrive',
					remoteSource: 'default',
					basePath: 'WebDev/Projects',
					configPath: '/tmp/rclone.conf',
				},
			}),
		};
		service = new BackupsService(
			backupsRepository as unknown as any,
			driveRuntimeConfigService as unknown as any,
			websocketCompatService as unknown as any,
		);
	});

	it('lists backups with normalized fields', async () => {
		backupsRepository.listOwnedBackups.mockResolvedValueOnce([
			{
				id: 1,
				project_id: 10,
				project_name: 'Acme',
				name: 'Backup 1',
				backup_type: 'full',
				storage_type: 'google_drive',
				status: 'completed',
				storage_path: '/tmp/b1.tar.gz',
				size_bytes: BigInt(2048),
				error_message: null,
				notes: null,
				logs: null,
				storage_file_id: 'abc',
				drive_folder_id: null,
				created_at: new Date(),
				completed_at: new Date(),
			},
		]);

		const result = await service.listBackups({ owner_id: 1 });
		expect(result[0]?.size_bytes).toBe(2048);
		expect(result[0]?.gdrive_link).toContain('drive.google.com');
	});

	it('creates backup and returns task payload', async () => {
		backupsRepository.ensureOwnedProject.mockResolvedValueOnce({
			id: 10,
			name: 'Acme',
		});
		backupsRepository.createOwnedBackup.mockResolvedValueOnce({ id: 5 });

		const result = await service.createBackup(
			{ project_id: 10, backup_type: 'database' },
			1,
		);

		expect(result.status).toBe('pending');
		expect(result.backup_id).toBe(5);
	});

	it('marks stale running backups as failed', async () => {
		backupsRepository.markStaleRunningBackupsFailed.mockResolvedValueOnce([
			{ id: 21 },
			{ id: 22 },
		]);

		const result = await service.markStaleRunningBackupsFailed(180, 2);
		expect(result).toEqual([{ id: 21 }, { id: 22 }]);
		expect(
			backupsRepository.markStaleRunningBackupsFailed,
		).toHaveBeenCalledWith(180, 2);
	});

	it('prunes terminal backups by retention policy', async () => {
		backupsRepository.pruneTerminalBackups.mockResolvedValueOnce([
			{
				id: 52,
				storage_type: 'google_drive',
				storage_path: '/tmp/forge-backups/b.tar.gz',
			},
			{
				id: 53,
				storage_type: 'local',
				storage_path: '/tmp/forge-backups/c.tar.gz',
			},
		]);

		const result = await service.pruneTerminalBackups(45, 1, 2);

		expect(result).toHaveLength(2);
		expect(result[0]?.id).toBe(52);
		expect(backupsRepository.pruneTerminalBackups).toHaveBeenCalledWith(
			45,
			1,
			2,
		);
	});

	it('simulates local artifact cleanup in dry-run mode with path guardrails', async () => {
		const result = await service.cleanupPrunedLocalArtifacts(
			[
				{
					id: 1,
					storage_type: 'local',
					storage_path: '/tmp/forge-backups/a.tar.gz',
				},
				{ id: 2, storage_type: 'local', storage_path: '/etc/passwd' },
				{
					id: 3,
					storage_type: 'google_drive',
					storage_path: '/tmp/forge-backups/c.tar.gz',
				},
			],
			true,
		);

		expect(result.dry_run).toBe(true);
		expect(result.eligible).toBe(1);
		expect(result.deleted).toBe(1);
		expect(result.skipped_unsafe).toBe(1);
	});

	it('records and exposes maintenance snapshot counters', () => {
		service.recordMaintenanceSnapshot({
			stale_marked: 2,
			pruned: 5,
			cleanup_deleted: 3,
			cleanup_failed: 1,
			error: null,
			duration_ms: 42,
		});
		service.recordPendingRunnerSnapshot({
			claimed: 4,
			processed: 3,
			failed: 1,
			error: null,
			duration_ms: 24,
		});

		const snapshot = service.getMaintenanceSnapshot();
		expect(snapshot.runs_total).toBe(1);
		expect(snapshot.last_run_at).toBeTruthy();
		expect(snapshot.last_outcome?.stale_marked).toBe(2);
		expect(snapshot.last_outcome?.pruned).toBe(5);
		expect(snapshot.last_outcome?.duration_ms).toBe(42);
		expect(snapshot.pending_runner.runs_total).toBe(1);
		expect(snapshot.pending_runner.last_outcome?.claimed).toBe(4);
		expect(snapshot.pending_runner.last_outcome?.failed).toBe(1);
		expect(snapshot.pending_runner.last_outcome?.duration_ms).toBe(24);
	});

	it('rejects create when project missing', async () => {
		backupsRepository.ensureOwnedProject.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Project not found' }),
		);
		await expect(
			service.createBackup({ project_id: 999 }, 1),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('rejects create when environment missing', async () => {
		backupsRepository.ensureOwnedProject.mockResolvedValueOnce({
			id: 10,
			name: 'Acme',
		});
		backupsRepository.getOwnedProjectEnvironment.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Environment not found' }),
		);

		await expect(
			service.createBackup({ project_id: 10, environment_id: 88 }, 1),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('returns single backup by id', async () => {
		backupsRepository.getOwnedBackup.mockResolvedValueOnce({
			id: 7,
			project_id: 10,
			project_name: 'Acme',
			name: 'Backup 7',
			backup_type: 'full',
			storage_type: 'local',
			status: 'completed',
			storage_path: '/tmp/b7.tar.gz',
			size_bytes: null,
			error_message: null,
			notes: null,
			logs: null,
			storage_file_id: null,
			drive_folder_id: null,
			created_at: new Date(),
			completed_at: null,
		});

		const result = await service.getBackup(7, 1);
		expect(result.id).toBe(7);
	});

	it('throws 404 for missing backup', async () => {
		backupsRepository.getOwnedBackup.mockRejectedValueOnce(
			new NotFoundException({ detail: 'Backup not found' }),
		);
		await expect(service.getBackup(999, 1)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('deletes backup when not running', async () => {
		backupsRepository.getOwnedBackup.mockResolvedValueOnce({
			id: 8,
			project_id: 10,
			project_name: 'Acme',
			name: 'Backup 8',
			backup_type: 'full',
			storage_type: 'local',
			status: 'completed',
			storage_path: '/tmp/b8.tar.gz',
			size_bytes: null,
			error_message: null,
			notes: null,
			logs: null,
			storage_file_id: null,
			drive_folder_id: null,
			created_at: new Date(),
			completed_at: null,
		});
		const deleteDriveSpy = jest.spyOn(
			service as unknown as { deleteDriveBackupArtifact: jest.Mock },
			'deleteDriveBackupArtifact',
		);

		await service.deleteBackup(8, false, 1);
		expect(deleteDriveSpy).not.toHaveBeenCalled();
		expect(backupsRepository.deleteBackupById).toHaveBeenCalledWith(8);
	});

	it('deletes drive artifact when delete_file is enabled for google drive backup', async () => {
		backupsRepository.getOwnedBackup.mockResolvedValueOnce({
			id: 11,
			project_id: 10,
			project_name: 'Acme',
			name: 'Backup 11',
			backup_type: 'full',
			storage_type: 'google_drive',
			status: 'completed',
			storage_path: '/tmp/b11.tar.gz',
			size_bytes: null,
			error_message: null,
			notes: null,
			logs: null,
			storage_file_id: 'archive.tar.gz',
			drive_folder_id: '1-dTSg1hQgFCdEN_meXvpImwiLYx18xZM',
			created_at: new Date(),
			completed_at: null,
		});
		const deleteDriveSpy = jest
			.spyOn(service as any, 'deleteDriveBackupArtifact')
			.mockResolvedValueOnce({ deleted: true, reason: 'deleted' });

		await service.deleteBackup(11, false, 1, true);

		expect(deleteDriveSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				drive_folder_id: '1-dTSg1hQgFCdEN_meXvpImwiLYx18xZM',
				storage_file_id: 'archive.tar.gz',
			}),
		);
		expect(backupsRepository.deleteBackupById).toHaveBeenCalledWith(11);
	});

	it('skips drive artifact delete when delete_file is disabled', async () => {
		backupsRepository.getOwnedBackup.mockResolvedValueOnce({
			id: 12,
			project_id: 10,
			project_name: 'Acme',
			name: 'Backup 12',
			backup_type: 'full',
			storage_type: 'google_drive',
			status: 'completed',
			storage_path: '/tmp/b12.tar.gz',
			size_bytes: null,
			error_message: null,
			notes: null,
			logs: null,
			storage_file_id: 'archive.tar.gz',
			drive_folder_id: '1-dTSg1hQgFCdEN_meXvpImwiLYx18xZM',
			created_at: new Date(),
			completed_at: null,
		});
		const deleteDriveSpy = jest.spyOn(
			service as any,
			'deleteDriveBackupArtifact',
		);

		await service.deleteBackup(12, false, 1, false);

		expect(deleteDriveSpy).not.toHaveBeenCalled();
		expect(backupsRepository.deleteBackupById).toHaveBeenCalledWith(12);
	});

	it('blocks delete for running backup unless forced', async () => {
		backupsRepository.getOwnedBackup.mockResolvedValueOnce({
			id: 9,
			project_id: 10,
			project_name: 'Acme',
			name: 'Backup 9',
			backup_type: 'full',
			storage_type: 'local',
			status: 'running',
			storage_path: '/tmp/b9.tar.gz',
			size_bytes: null,
			error_message: null,
			notes: null,
			logs: null,
			storage_file_id: null,
			drive_folder_id: null,
			created_at: new Date(),
			completed_at: null,
		});

		await expect(service.deleteBackup(9, false, 1)).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});

	it('returns restore task payload', async () => {
		backupsRepository.getOwnedBackup.mockResolvedValueOnce({
			id: 10,
			project_id: 10,
			project_name: 'Acme',
			name: 'Backup 10',
			backup_type: 'full',
			storage_type: 'local',
			status: 'completed',
			storage_path: '/tmp/b10.tar.gz',
			size_bytes: null,
			error_message: null,
			notes: null,
			logs: null,
			storage_file_id: null,
			drive_folder_id: null,
			created_at: new Date(),
			completed_at: null,
		});

		const result = await service.restoreBackup(
			10,
			{
				database: true,
				files: false,
			},
			1,
		);
		expect(result.status).toBe('completed');
		expect(result.options.files).toBe(false);
	});

	it('creates backups in bulk with success/failure summary', async () => {
		backupsRepository.bulkGetOwnedProjects.mockResolvedValueOnce([
			{ id: 1, name: 'Acme' },
		]);
		backupsRepository.bulkCreateBackupRecord.mockResolvedValueOnce({ id: 101 });

		const result = await service.bulkCreateBackups(
			{
				project_ids: [1, 2],
				backup_type: 'full',
				storage_type: 'local',
			},
			1,
		);

		expect(result.total_requested).toBe(2);
		expect(result.total_success).toBe(1);
		expect(result.total_failed).toBe(1);
		expect(backupsRepository.bulkGetOwnedProjects).toHaveBeenCalledWith(
			[1, 2],
			1,
		);
		expect(backupsRepository.bulkCreateBackupRecord).toHaveBeenCalledTimes(1);
	});

	it('deletes backups in bulk with force handling', async () => {
		backupsRepository.bulkGetOwnedBackupsByIds.mockResolvedValueOnce([
			{
				id: 7,
				status: 'completed',
				project_name: 'Acme',
				storage_type: 'local',
				storage_path: '/tmp/b7.tar.gz',
				storage_file_id: null,
				drive_folder_id: null,
			},
			{
				id: 8,
				status: 'running',
				project_name: 'Beta',
				storage_type: 'local',
				storage_path: '/tmp/b8.tar.gz',
				storage_file_id: null,
				drive_folder_id: null,
			},
		]);

		const result = await service.bulkDeleteBackups(
			{ backup_ids: [7, 8], force: false },
			1,
		);

		expect(result.total_success).toBe(1);
		expect(result.total_failed).toBe(1);
		expect(backupsRepository.deleteBackupById).toHaveBeenCalledTimes(1);
		expect(backupsRepository.deleteBackupById).toHaveBeenCalledWith(7);
	});

	it('queues remote pull backup payload', async () => {
		backupsRepository.getOwnedProjectEnvironmentByServerId.mockResolvedValueOnce(
			{ id: 7, project_id: 2 },
		);

		const result = await service.pullRemoteBackup({ project_server_id: 7 }, 1);
		expect(result.status).toBe('accepted');
		expect(result.project_id).toBe(2);
	});

	it('returns schedule payloads and summary stats', async () => {
		backupsRepository.getOwnedProject
			.mockResolvedValueOnce({ id: 1, name: 'Acme' })
			.mockResolvedValueOnce({ id: 1, name: 'Acme' });
		backupsRepository.getBackupStatsSummary.mockResolvedValueOnce({
			total_backups: 4,
			completed_backups: 2,
			failed_backups: 1,
			pending_backups: 1,
			running_backups: 0,
		});

		const scheduled = await service.scheduleBackup({ project_id: 1 }, 1);
		const fetched = await service.getBackupSchedule(1, 1);
		const stats = await service.getBackupStatsSummary(1);

		expect(scheduled.schedule_type).toBe('daily');
		expect(fetched.project_id).toBe(1);
		expect(stats.total_backups).toBe(4);
	});

	it('claims pending backups for runner execution', async () => {
		backupsRepository.claimPendingBackups.mockResolvedValueOnce([
			{ id: 3, created_by_id: 2 },
		]);

		const result = await service.claimPendingBackups(5);

		expect(result).toEqual([{ id: 3, created_by_id: 2 }]);
		expect(backupsRepository.claimPendingBackups).toHaveBeenCalledWith(5);
	});

	it('returns only successfully claimed pending backups', async () => {
		backupsRepository.claimPendingBackups.mockResolvedValueOnce([
			{ id: 3, created_by_id: 2 },
		]);

		const result = await service.claimPendingBackups(5);

		expect(result).toEqual([{ id: 3, created_by_id: 2 }]);
		expect(backupsRepository.claimPendingBackups).toHaveBeenCalledTimes(1);
	});

	it('marks backup failed when run setup fails after runner claim', async () => {
		jest.spyOn(service, 'getBackup').mockResolvedValueOnce({
			id: 12,
			project_id: 10,
			name: 'Backup 12',
			backup_type: 'full',
			storage_type: 'local',
			status: 'running',
			project_server_id: 1,
		} as unknown as any);
		jest
			.spyOn(service as any, 'getProjectBackupContext')
			.mockRejectedValueOnce(new Error('context resolution failed'));

		await expect(service.runBackup(12, undefined, 1)).rejects.toBeInstanceOf(
			InternalServerErrorException,
		);
		expect(backupsRepository.setBackupRunning).toHaveBeenCalledWith(12);
		expect(backupsRepository.failBackup).toHaveBeenCalledTimes(1);
	});

	it('uploads archive to google drive backend and completes backup', async () => {
		jest.spyOn(service, 'getBackup').mockResolvedValueOnce({
			id: 44,
			project_id: 10,
			name: 'Backup 44',
			backup_type: 'files',
			storage_type: 'google_drive',
			status: 'running',
			project_server_id: 1,
		} as unknown as any);
		jest
			.spyOn(service as any, 'getProjectBackupContext')
			.mockResolvedValueOnce({
				projectId: 10,
				projectName: 'Acme',
				projectSlug: 'acme',
				projectPath: '/srv/acme',
				projectDriveBackupsFolder: 'WebDev/Projects/Acme/Backups',
				environmentId: 1,
				environmentName: 'staging',
				environmentPath: '/srv/acme/staging',
				environmentDriveBackupsFolder: null,
				databaseName: 'acme_db',
				databaseUser: 'acme_user',
				databasePassword: 'secret',
				serverHostname: 'mysql',
			});
		jest.spyOn(service as any, 'resolveBackupSource').mockResolvedValueOnce({
			sourcePath: '/srv/acme/staging',
			cleanupPath: null,
			logMessage: 'Using source path /srv/acme/staging',
		});
		jest
			.spyOn(service as any, 'createTarArchive')
			.mockResolvedValueOnce({ sizeBytes: 2048 });
		jest
			.spyOn(service as any, 'assertConfiguredDriveRemote')
			.mockResolvedValueOnce({
				remoteName: 'gdrive',
				remoteSource: 'default',
				basePath: 'WebDev/Projects',
				configPath: '/tmp/rclone.conf',
			});
		const uploadSpy = jest
			.spyOn(service as any, 'uploadArchiveToDriveFolder')
			.mockResolvedValueOnce({
				driveFolderId: 'WebDev/Projects/Acme/Backups/staging/2026/03',
				storageFileId: 'archive.tar.gz',
				remoteTarget:
					'gdrive:WebDev/Projects/Acme/Backups/staging/2026/03/archive.tar.gz',
			});

		const result = await service.runBackup(44, undefined, 1);

		expect(result.status).toBe('accepted');
		expect(uploadSpy).toHaveBeenCalledTimes(1);
		expect(backupsRepository.completeBackup).toHaveBeenCalledTimes(1);
	});

	it('fails backup when google drive preflight is not configured', async () => {
		jest.spyOn(service, 'getBackup').mockResolvedValueOnce({
			id: 45,
			project_id: 10,
			name: 'Backup 45',
			backup_type: 'full',
			storage_type: 'google_drive',
			status: 'running',
			project_server_id: 1,
		} as unknown as any);
		jest
			.spyOn(service as any, 'getProjectBackupContext')
			.mockResolvedValueOnce({
				projectId: 10,
				projectName: 'Acme',
				projectSlug: 'acme',
				projectPath: '/srv/acme',
				projectDriveBackupsFolder: 'WebDev/Projects/Acme/Backups',
				environmentId: 1,
				environmentName: 'staging',
				environmentPath: '/srv/acme/staging',
				environmentDriveBackupsFolder: null,
				databaseName: 'acme_db',
				databaseUser: 'acme_user',
				databasePassword: 'secret',
				serverHostname: 'mysql',
			});
		jest.spyOn(service as any, 'resolveBackupSource').mockResolvedValueOnce({
			sourcePath: '/srv/acme/staging',
			cleanupPath: null,
			logMessage: 'Using source path /srv/acme/staging',
		});
		jest.spyOn(service as any, 'createDatabaseDump').mockResolvedValueOnce({
			databaseHost: 'mysql',
			databasePort: '3306',
			dumpBinary: 'mysqldump',
		});
		jest
			.spyOn(service as any, 'createTarArchive')
			.mockResolvedValueOnce({ sizeBytes: 1024 });
		jest
			.spyOn(service as any, 'assertConfiguredDriveRemote')
			.mockRejectedValueOnce(
				new Error(
					"Google Drive backup remote 'gdrive' is unavailable: rclone config not found at /tmp/rclone.conf",
				),
			);
		const uploadSpy = jest.spyOn(service as any, 'uploadArchiveToDriveFolder');

		await expect(service.runBackup(45, undefined, 1)).rejects.toBeInstanceOf(
			InternalServerErrorException,
		);
		expect(uploadSpy).not.toHaveBeenCalled();
		expect(backupsRepository.failBackup).toHaveBeenCalledTimes(1);
	});

	it('runs database-only backup without resolving file source', async () => {
		jest.spyOn(service, 'getBackup').mockResolvedValueOnce({
			id: 46,
			project_id: 10,
			name: 'Backup 46',
			backup_type: 'database',
			storage_type: 'local',
			status: 'running',
			project_server_id: 1,
		} as unknown as any);
		jest
			.spyOn(service as any, 'getProjectBackupContext')
			.mockResolvedValueOnce({
				projectId: 10,
				projectName: 'Acme',
				projectSlug: 'acme',
				projectPath: '/srv/acme',
				projectDriveBackupsFolder: 'WebDev/Projects/Acme/Backups',
				environmentId: 1,
				environmentName: 'staging',
				environmentPath: '/srv/acme/staging',
				environmentDriveBackupsFolder: null,
				databaseName: 'acme_db',
				databaseUser: 'acme_user',
				databasePassword: 'secret',
				serverHostname: 'mysql',
			});
		const resolveSourceSpy = jest.spyOn(service as any, 'resolveBackupSource');
		const dumpSpy = jest
			.spyOn(service as any, 'createDatabaseDump')
			.mockResolvedValueOnce({
				databaseHost: 'mysql',
				databasePort: '3306',
				dumpBinary: 'mysqldump',
			});
		jest
			.spyOn(service as any, 'createTarArchive')
			.mockResolvedValueOnce({ sizeBytes: 1000 });

		const result = await service.runBackup(46, undefined, 1);

		expect(result.status).toBe('accepted');
		expect(result.backup_type).toBe('database');
		expect(resolveSourceSpy).not.toHaveBeenCalled();
		expect(dumpSpy).toHaveBeenCalledTimes(1);
	});

	it('stages remote file source when local source path is unavailable', async () => {
		jest
			.spyOn(service as any, 'withSshKey')
			.mockImplementation(async (_context: unknown, handler: any) =>
				handler('/tmp/id_rsa'),
			);
		jest
			.spyOn(service as any, 'resolveExistingRemoteSourcePath')
			.mockResolvedValueOnce('/srv/acme/current');
		jest
			.spyOn(service as any, 'scpDirectoryFromRemote')
			.mockImplementation(async (...args: any[]) => {
				const localParent = String(args[2]);
				await mkdir(join(localParent, 'current'), { recursive: true });
			});

		const result = await (service as any).resolveBackupSource(
			{
				projectId: 1,
				projectName: 'Acme',
				projectSlug: 'acme',
				projectPath: '/srv/acme/current',
				environmentId: 2,
				environmentName: 'staging',
				environmentPath: '/srv/acme/current',
				serverHostname: 'app-1',
				sshUser: 'root',
				sshPort: 22,
				sshKeyPath: '/tmp/id_rsa',
			} as any,
			99,
			'files',
		);

		expect(result.cleanupPath).toContain('/tmp/forge-backup-remote-stage/');
		expect(result.sourcePath).toContain('/current');
		expect(result.logMessage).toContain(
			'Staged remote source path /srv/acme/current',
		);
	});

	it('fails backup source resolution when no local or remote path exists', async () => {
		jest
			.spyOn(service as any, 'withSshKey')
			.mockImplementation(async (_context: unknown, handler: any) =>
				handler('/tmp/id_rsa'),
			);
		jest
			.spyOn(service as any, 'resolveExistingRemoteSourcePath')
			.mockResolvedValueOnce(null);

		await expect(
			(service as any).resolveBackupSource(
				{
					projectId: 1,
					projectName: 'Acme',
					projectSlug: 'acme',
					projectPath: '/srv/acme/current',
					environmentId: 2,
					environmentName: 'staging',
					environmentPath: '/srv/acme/current',
					serverHostname: 'app-1',
					sshUser: 'root',
					sshPort: 22,
					sshKeyPath: '/tmp/id_rsa',
				} as any,
				100,
				'files',
			),
		).rejects.toThrow(/Backup source path not found on remote host/);
	});

	it('calls createDatabaseDumpViaRemoteScript as sole dump strategy', async () => {
		const remoteScriptSpy = jest
			.spyOn(service as any, 'createDatabaseDumpViaRemoteScript')
			.mockResolvedValueOnce(undefined);

		const result = await (service as any).createDatabaseDump(
			{
				environmentId: 1,
				environmentPath: '/home/mg.staging.ly/public_html/web',
				projectPath: '/home/mg.staging.ly/public_html',
				serverHostname: 'app-1',
				sshUser: 'forge',
				sshPort: 22,
				sshKeyPath: '/tmp/id_rsa',
				sshPrivateKey: null,
				sshPassword: null,
			} as any,
			'/tmp/database.sql',
		);

		expect(remoteScriptSpy).toHaveBeenCalledWith(
			expect.objectContaining({ environmentId: 1 }),
			'/tmp/database.sql',
			[
				'/home/mg.staging.ly/public_html/web',
				'/home/mg.staging.ly/public_html',
			],
			undefined,
		);
		expect(result.transport).toBe('ssh-remote-script');
		expect(result.databaseHost).toBe('remote-script');
		expect(result.dumpBinary).toBe('remote-script');
	});

	it('throws when environmentId is missing from context', async () => {
		await expect(
			(service as any).createDatabaseDump(
				{
					environmentId: null,
					environmentPath: '/home/site/public_html',
					projectPath: null,
				} as any,
				'/tmp/database.sql',
			),
		).rejects.toThrow(/selected environment/);
	});

	it('propagates error thrown by createDatabaseDumpViaRemoteScript', async () => {
		jest
			.spyOn(service as any, 'createDatabaseDumpViaRemoteScript')
			.mockRejectedValueOnce(new Error('SSH connection refused'));

		await expect(
			(service as any).createDatabaseDump(
				{
					environmentId: 1,
					environmentPath: '/home/site/public_html',
					projectPath: null,
					serverHostname: 'app-1',
					sshUser: 'forge',
					sshPort: 22,
					sshKeyPath: '/tmp/id_rsa',
					sshPrivateKey: null,
					sshPassword: null,
				} as any,
				'/tmp/database.sql',
			),
		).rejects.toThrow(/SSH connection refused/);
	});

	it('appends year and month to drive folder path for uploads', async () => {
		const runProcessSpy = jest
			.spyOn(service as any, 'runProcess')
			.mockResolvedValue(undefined);

		const now = new Date('2026-03-08T11:02:22.503Z');
		const byPath = await (service as any).uploadArchiveToDriveFolder(
			'/tmp/acme-staging.tar.gz',
			'WebDev/Projects/Acme/Backups/staging',
			now,
			{ remoteName: 'gdrive', configPath: '/tmp/rclone.conf' },
		);

		expect(byPath.destinationLabel).toBe(
			'webdev/projects/acme/backups/staging/2026/03',
		);
		expect(byPath.remoteTarget).toBe(
			'gdrive:webdev/projects/acme/backups/staging/2026/03/acme-staging.tar.gz',
		);

		const byFolderId = await (service as any).uploadArchiveToDriveFolder(
			'/tmp/acme-staging.tar.gz',
			'1-dTSg1hQgFCdEN_meXvpImwiLYx18xZM',
			now,
			{ remoteName: 'gdrive', configPath: '/tmp/rclone.conf' },
		);

		expect(byFolderId.destinationLabel).toBe(
			'1-dTSg1hQgFCdEN_meXvpImwiLYx18xZM/2026/03',
		);
		expect(byFolderId.remoteTarget).toBe(
			'gdrive,root_folder_id=1-dTSg1hQgFCdEN_meXvpImwiLYx18xZM:2026/03/acme-staging.tar.gz',
		);
		expect(runProcessSpy).toHaveBeenCalledTimes(2);
	});
});
