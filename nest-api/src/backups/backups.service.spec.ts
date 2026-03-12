import {
	BadRequestException,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { BackupsService } from './backups.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
	$transaction: jest.Mock;
	backups: {
		findMany: jest.Mock;
		updateMany: jest.Mock;
		update: jest.Mock;
		deleteMany: jest.Mock;
	};
};

type MockWebsocketCompatService = {
	broadcast: jest.Mock;
};

type MockDriveRuntimeConfigService = {
	checkRemoteConfigured: jest.Mock;
};

describe('BackupsService', () => {
	let prisma: MockPrisma;
	let service: BackupsService;
	let websocketCompatService: MockWebsocketCompatService;
	let driveRuntimeConfigService: MockDriveRuntimeConfigService;

	beforeEach(() => {
		prisma = {
			$queryRaw: jest.fn(),
			$executeRaw: jest.fn(),
			$transaction: jest.fn(async callback =>
				callback(prisma as unknown as any),
			),
			backups: {
				findMany: jest.fn(),
				updateMany: jest.fn(),
				update: jest.fn(),
				deleteMany: jest.fn(),
			},
		};
		websocketCompatService = {
			broadcast: jest.fn(),
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
			prisma as unknown as any,
			driveRuntimeConfigService as unknown as any,
			websocketCompatService as unknown as any,
		);
	});

	it('lists backups with normalized fields', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
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

		const result = await service.listBackups({});
		expect(result[0]?.size_bytes).toBe(2048);
		expect(result[0]?.gdrive_link).toContain('drive.google.com');
	});

	it('creates backup and returns task payload', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 10, name: 'Acme' }])
			.mockResolvedValueOnce([{ id: 5 }]);

		const result = await service.createBackup({
			project_id: 10,
			backup_type: 'database',
		});

		expect(result.status).toBe('pending');
		expect(result.backup_id).toBe(5);
	});

	it('marks stale running backups as failed', async () => {
		prisma.backups.findMany.mockResolvedValueOnce([
			{ id: 21, error_message: null, completed_at: null },
			{ id: 22, error_message: null, completed_at: null },
		]);
		prisma.backups.updateMany.mockResolvedValue({ count: 1 });

		const result = await service.markStaleRunningBackupsFailed(180, 2);
		expect(result).toEqual([{ id: 21 }, { id: 22 }]);
		expect(prisma.backups.updateMany).toHaveBeenCalledTimes(2);
	});

	it('prunes terminal backups by retention policy', async () => {
		prisma.backups.findMany.mockResolvedValueOnce([
			{
				id: 51,
				project_id: 1,
				storage_type: 'local',
				storage_path: '/tmp/forge-backups/a.tar.gz',
			},
			{
				id: 52,
				project_id: 1,
				storage_type: 'google_drive',
				storage_path: '/tmp/forge-backups/b.tar.gz',
			},
			{
				id: 53,
				project_id: 1,
				storage_type: 'local',
				storage_path: '/tmp/forge-backups/c.tar.gz',
			},
		]);
		prisma.backups.deleteMany.mockResolvedValueOnce({ count: 2 });

		const result = await service.pruneTerminalBackups(45, 1, 2);

		expect(result).toHaveLength(2);
		expect(result[0]?.id).toBe(52);
		expect(prisma.backups.deleteMany).toHaveBeenCalledTimes(1);
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
		});

		const snapshot = service.getMaintenanceSnapshot();
		expect(snapshot.runs_total).toBe(1);
		expect(snapshot.last_run_at).toBeTruthy();
		expect(snapshot.last_outcome?.stale_marked).toBe(2);
		expect(snapshot.last_outcome?.pruned).toBe(5);
	});

	it('rejects create when project missing', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(
			service.createBackup({ project_id: 999 }),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('rejects create when environment missing', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 10, name: 'Acme' }])
			.mockResolvedValueOnce([]);

		await expect(
			service.createBackup({ project_id: 10, environment_id: 88 }),
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('returns single backup by id', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
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
			},
		]);

		const result = await service.getBackup(7);
		expect(result.id).toBe(7);
	});

	it('throws 404 for missing backup', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.getBackup(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('deletes backup when not running', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
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
			},
		]);
		const deleteDriveSpy = jest.spyOn(
			service as unknown as { deleteDriveBackupArtifact: jest.Mock },
			'deleteDriveBackupArtifact',
		);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		await service.deleteBackup(8, false);
		expect(deleteDriveSpy).not.toHaveBeenCalled();
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('deletes drive artifact when delete_file is enabled for google drive backup', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
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
			},
		]);
		const deleteDriveSpy = jest
			.spyOn(service as any, 'deleteDriveBackupArtifact')
			.mockResolvedValueOnce({ deleted: true, reason: 'deleted' });
		prisma.$executeRaw.mockResolvedValueOnce(1);

		await service.deleteBackup(11, false, undefined, true);

		expect(deleteDriveSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				drive_folder_id: '1-dTSg1hQgFCdEN_meXvpImwiLYx18xZM',
				storage_file_id: 'archive.tar.gz',
			}),
		);
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('skips drive artifact delete when delete_file is disabled', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
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
			},
		]);
		const deleteDriveSpy = jest.spyOn(
			service as any,
			'deleteDriveBackupArtifact',
		);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		await service.deleteBackup(12, false, undefined, false);

		expect(deleteDriveSpy).not.toHaveBeenCalled();
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('blocks delete for running backup unless forced', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
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
			},
		]);

		await expect(service.deleteBackup(9, false)).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});

	it('returns restore task payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
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
			},
		]);

		const result = await service.restoreBackup(10, {
			database: true,
			files: false,
		});
		expect(result.status).toBe('completed');
		expect(result.options.files).toBe(false);
	});

	it('creates backups in bulk with success/failure summary', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 1, name: 'Acme' }])
			.mockResolvedValueOnce([{ id: 101 }])
			.mockResolvedValueOnce([{ id: 102 }]);

		const result = await service.bulkCreateBackups({
			project_ids: [1, 2],
			backup_type: 'full',
			storage_type: 'local',
		});

		expect(result.total_requested).toBe(2);
		expect(result.total_success).toBe(1);
		expect(result.total_failed).toBe(1);

		const insertCall = prisma.$queryRaw.mock.calls.find(
			call =>
				Array.isArray(call[0]) &&
				(call[0] as unknown as TemplateStringsArray)
					.join('')
					.includes('INSERT INTO backups'),
		);
		const insertSql = (
			insertCall?.[0] as unknown as TemplateStringsArray | undefined
		)?.join('');
		expect(insertSql).toContain('::backuptype');
		expect(insertSql).toContain('::backupstoragetype');
		expect(insertSql).toContain('::backupstatus');
	});

	it('deletes backups in bulk with force handling', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{ id: 7, status: 'completed', project_name: 'Acme' },
			{ id: 8, status: 'running', project_name: 'Beta' },
		]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.bulkDeleteBackups({
			backup_ids: [7, 8],
			force: false,
		});

		expect(result.total_success).toBe(1);
		expect(result.total_failed).toBe(1);
		expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
	});

	it('queues remote pull backup payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 7, project_id: 2 }]);

		const result = await service.pullRemoteBackup({ project_server_id: 7 });
		expect(result.status).toBe('accepted');
		expect(result.project_id).toBe(2);
	});

	it('returns schedule payloads and summary stats', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 1, name: 'Acme' }])
			.mockResolvedValueOnce([{ id: 1, name: 'Acme' }])
			.mockResolvedValueOnce([
				{
					total: BigInt(4),
					completed: BigInt(2),
					failed: BigInt(1),
					pending: BigInt(1),
					running: BigInt(0),
				},
			]);

		const scheduled = await service.scheduleBackup({ project_id: 1 });
		const fetched = await service.getBackupSchedule(1);
		const stats = await service.getBackupStatsSummary();

		expect(scheduled.schedule_type).toBe('daily');
		expect(fetched.project_id).toBe(1);
		expect(stats.total_backups).toBe(4);
	});

	it('claims pending backups for runner execution', async () => {
		prisma.backups.findMany.mockResolvedValueOnce([
			{ id: 3, created_by_id: 2 },
		]);
		prisma.backups.updateMany.mockResolvedValueOnce({ count: 1 });

		const result = await service.claimPendingBackups(5);

		expect(result).toEqual([{ id: 3, created_by_id: 2 }]);
		expect(prisma.$transaction).toHaveBeenCalled();
		expect(prisma.backups.updateMany).toHaveBeenCalled();
	});

	it('returns only successfully claimed pending backups', async () => {
		prisma.backups.findMany.mockResolvedValueOnce([
			{ id: 3, created_by_id: 2 },
			{ id: 4, created_by_id: 2 },
		]);
		prisma.backups.updateMany
			.mockResolvedValueOnce({ count: 1 })
			.mockResolvedValueOnce({ count: 0 });

		const result = await service.claimPendingBackups(5);

		expect(result).toEqual([{ id: 3, created_by_id: 2 }]);
		expect(prisma.backups.updateMany).toHaveBeenCalledTimes(2);
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
		prisma.$executeRaw.mockResolvedValue(1);

		await expect(service.runBackup(12, undefined, 1)).rejects.toBeInstanceOf(
			InternalServerErrorException,
		);
		expect(prisma.$executeRaw.mock.calls.length).toBeGreaterThanOrEqual(2);
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
		prisma.$executeRaw.mockResolvedValue(1);

		const result = await service.runBackup(44, undefined, 1);

		expect(result.status).toBe('accepted');
		expect(uploadSpy).toHaveBeenCalledTimes(1);
		expect(prisma.$executeRaw.mock.calls.length).toBeGreaterThanOrEqual(4);
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
		prisma.$executeRaw.mockResolvedValue(1);

		await expect(service.runBackup(45, undefined, 1)).rejects.toBeInstanceOf(
			InternalServerErrorException,
		);
		expect(uploadSpy).not.toHaveBeenCalled();
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
		prisma.$executeRaw.mockResolvedValue(1);

		const result = await service.runBackup(46, undefined, 1);

		expect(result.status).toBe('accepted');
		expect(result.backup_type).toBe('database');
		expect(resolveSourceSpy).not.toHaveBeenCalled();
		expect(dumpSpy).toHaveBeenCalledTimes(1);
	});

	it('uses remote-derived database settings when context credentials are missing', async () => {
		const previousDumpBins = process.env.FORGE_BACKUP_DB_DUMP_BIN;
		const previousDumpHost = process.env.FORGE_BACKUP_DB_HOST;
		const previousDumpPort = process.env.FORGE_BACKUP_DB_PORT;
		process.env.FORGE_BACKUP_DB_DUMP_BIN = 'mariadb-dump';
		delete process.env.FORGE_BACKUP_DB_HOST;
		delete process.env.FORGE_BACKUP_DB_PORT;

		jest
			.spyOn(service as any, 'resolveRemoteDatabaseConfigFromSource')
			.mockResolvedValueOnce({
				databaseHost: '10.20.30.40',
				databasePort: '3307',
				databaseName: 'env_db',
				databaseUser: 'env_user',
				databasePassword: 'env_password',
			});

		const sshSpy = jest
			.spyOn(service as any, 'createDatabaseDumpViaSsh')
			.mockResolvedValueOnce(undefined);

		const result = await (service as any).createDatabaseDump(
			{
				environmentId: 1,
				environmentPath: '/srv/acme/current',
				projectPath: null,
				databaseName: null,
				databaseUser: null,
				databasePassword: null,
				serverHostname: 'wrong-host.example',
				sshUser: 'forge',
				sshPort: 22,
				sshKeyPath: '/tmp/id_rsa',
				sshPrivateKey: null,
				sshPassword: null,
			} as any,
			'/tmp/database.sql',
		);

		expect(sshSpy).toHaveBeenCalledWith(
			expect.any(Object),
			'/tmp/database.sql',
			expect.objectContaining({
				dumpBin: 'mariadb-dump',
				dumpHost: '10.20.30.40',
				dumpPort: '3307',
				databaseUser: 'env_user',
				databasePassword: 'env_password',
				databaseName: 'env_db',
			}),
			undefined,
		);
		expect(result.databaseHost).toBe('10.20.30.40');
		expect(result.databasePort).toBe('3307');

		if (previousDumpBins === undefined) {
			delete process.env.FORGE_BACKUP_DB_DUMP_BIN;
		} else {
			process.env.FORGE_BACKUP_DB_DUMP_BIN = previousDumpBins;
		}
		if (previousDumpHost === undefined) {
			delete process.env.FORGE_BACKUP_DB_HOST;
		} else {
			process.env.FORGE_BACKUP_DB_HOST = previousDumpHost;
		}
		if (previousDumpPort === undefined) {
			delete process.env.FORGE_BACKUP_DB_PORT;
		} else {
			process.env.FORGE_BACKUP_DB_PORT = previousDumpPort;
		}
	});

	it('prefers remote SSH-derived database settings over stale local/context values', async () => {
		const previousDumpBins = process.env.FORGE_BACKUP_DB_DUMP_BIN;
		const previousDumpHost = process.env.FORGE_BACKUP_DB_HOST;
		const previousDumpPort = process.env.FORGE_BACKUP_DB_PORT;
		process.env.FORGE_BACKUP_DB_DUMP_BIN = 'mariadb-dump';
		delete process.env.FORGE_BACKUP_DB_HOST;
		delete process.env.FORGE_BACKUP_DB_PORT;

		jest
			.spyOn(service as any, 'resolveRemoteDatabaseConfigFromSource')
			.mockResolvedValueOnce({
				databaseHost: '127.0.0.1',
				databasePort: '3306',
				databaseName: 'remote_db',
				databaseUser: 'remote_user',
				databasePassword: 'remote_password',
			});

		const sshSpy = jest
			.spyOn(service as any, 'createDatabaseDumpViaSsh')
			.mockResolvedValueOnce(undefined);

		const result = await (service as any).createDatabaseDump(
			{
				environmentId: 1,
				environmentPath: '/srv/app',
				projectPath: '/srv',
				databaseName: 'stale_db',
				databaseUser: 'stale_user',
				databasePassword: 'stale_password',
				serverHostname: '138.199.151.80',
				sshUser: 'root',
				sshPort: 22,
				sshKeyPath: '/tmp/id_rsa',
				sshPrivateKey: null,
				sshPassword: null,
			} as any,
			'/tmp/database.sql',
		);

		expect(sshSpy).toHaveBeenCalledWith(
			expect.any(Object),
			'/tmp/database.sql',
			expect.objectContaining({
				dumpBin: 'mariadb-dump',
				dumpHost: '127.0.0.1',
				dumpPort: '3306',
				databaseUser: 'remote_user',
				databasePassword: 'remote_password',
				databaseName: 'remote_db',
			}),
			undefined,
		);
		expect(result.databaseHost).toBe('127.0.0.1');
		expect(result.databasePort).toBe('3306');

		if (previousDumpBins === undefined) {
			delete process.env.FORGE_BACKUP_DB_DUMP_BIN;
		} else {
			process.env.FORGE_BACKUP_DB_DUMP_BIN = previousDumpBins;
		}
		if (previousDumpHost === undefined) {
			delete process.env.FORGE_BACKUP_DB_HOST;
		} else {
			process.env.FORGE_BACKUP_DB_HOST = previousDumpHost;
		}
		if (previousDumpPort === undefined) {
			delete process.env.FORGE_BACKUP_DB_PORT;
		} else {
			process.env.FORGE_BACKUP_DB_PORT = previousDumpPort;
		}
	});

	it('returns SSH transport when remote dump succeeds', async () => {
		const previousDumpBins = process.env.FORGE_BACKUP_DB_DUMP_BIN;
		const previousDumpHost = process.env.FORGE_BACKUP_DB_HOST;
		process.env.FORGE_BACKUP_DB_DUMP_BIN = 'mariadb-dump';
		delete process.env.FORGE_BACKUP_DB_HOST;

		jest
			.spyOn(service as any, 'resolveRemoteDatabaseConfigFromSource')
			.mockResolvedValueOnce({
				databaseHost: 'db.internal',
				databasePort: '3306',
				databaseName: 'acme_db',
				databaseUser: 'acme_user',
				databasePassword: 'secret',
			});

		const sshSpy = jest
			.spyOn(service as any, 'createDatabaseDumpViaSsh')
			.mockResolvedValueOnce(undefined);

		const result = await (service as any).createDatabaseDump(
			{
				environmentId: 1,
				databaseName: 'acme_db',
				databaseUser: 'acme_user',
				databasePassword: 'secret',
				serverHostname: 'app-1',
				sshUser: 'forge',
				sshPort: 22,
				sshKeyPath: '/tmp/id_rsa',
				sshPrivateKey: null,
				sshPassword: null,
			} as any,
			'/tmp/database.sql',
		);

		expect(sshSpy).toHaveBeenCalled();
		expect(result.transport).toBe('ssh');

		if (previousDumpBins === undefined) {
			delete process.env.FORGE_BACKUP_DB_DUMP_BIN;
		} else {
			process.env.FORGE_BACKUP_DB_DUMP_BIN = previousDumpBins;
		}
		if (previousDumpHost === undefined) {
			delete process.env.FORGE_BACKUP_DB_HOST;
		} else {
			process.env.FORGE_BACKUP_DB_HOST = previousDumpHost;
		}
	});

	it('expands wp-cli path candidates to include parent root when path ends with /web', () => {
		const candidates = (service as any).expandWpCliPathCandidates([
			'/home/forge/example.com/current/web',
			'/home/forge/example.com/current',
			null,
		]);

		expect(candidates).toEqual([
			'/home/forge/example.com/current/web',
			'/home/forge/example.com/current',
		]);
	});

	it('filters local container and backup workspace paths from wp-cli candidates', () => {
		const candidates = (service as any).expandWpCliPathCandidates([
			'/app',
			'/app/public',
			'/tmp/forge-backups/acme',
			'/tmp/forge-restores/acme',
			'/tmp/forge-gdrive/acme',
			'/home/mg.staging.ly/public_html/web',
		]);

		expect(candidates).toEqual([
			'/home/mg.staging.ly/public_html/web',
			'/home/mg.staging.ly/public_html',
		]);
	});

	it('uses sudo env command without sh login shell for SSH dump attempts', async () => {
		jest
			.spyOn(service as any, 'withSshKey')
			.mockImplementation(async (_context: unknown, handler: any) =>
				handler('/tmp/id_rsa'),
			);
		const runSshSpy = jest
			.spyOn(service as any, 'runSshCommand')
			.mockResolvedValue(undefined);
		jest.spyOn(service as any, 'scpFromRemote').mockResolvedValue(undefined);

		await (service as any).createDatabaseDumpViaSsh(
			{
				serverHostname: '138.199.151.80',
				sshUser: 'root',
				sshPort: 22,
			} as any,
			'/tmp/database.sql',
			{
				dumpBin: 'mariadb-dump',
				dumpHost: '127.0.0.1',
				dumpPort: '3306',
				databaseUser: 'mg_stage',
				databasePassword: 'secret',
				databaseName: 'mg_stage',
			},
		);

		const sudoCommand = runSshSpy.mock.calls
			.map(call => String(call[1]))
			.find(command => command.includes('sudo -n'));

		expect(sudoCommand).toContain('sudo -n env MYSQL_PWD=');
		expect(sudoCommand).not.toContain('sh -lc');
		expect(sudoCommand).not.toContain('--connect-timeout');
	});

	it('uses legacy fallback matrix when explicitly enabled', async () => {
		const previousDumpBins = process.env.FORGE_BACKUP_DB_DUMP_BIN;
		const previousDumpHost = process.env.FORGE_BACKUP_DB_HOST;
		const previousLegacy = process.env.FORGE_BACKUP_DB_LEGACY_FALLBACK;
		process.env.FORGE_BACKUP_DB_DUMP_BIN = 'mariadb-dump';
		process.env.FORGE_BACKUP_DB_HOST = 'db.internal';
		process.env.FORGE_BACKUP_DB_LEGACY_FALLBACK = 'true';

		jest
			.spyOn(service as any, 'resolveRemoteDatabaseConfigFromSource')
			.mockResolvedValueOnce({
				databaseHost: 'db.internal',
				databasePort: '3306',
				databaseName: 'acme_db',
				databaseUser: 'acme_user',
				databasePassword: 'secret',
			});

		jest
			.spyOn(service as any, 'createDatabaseDumpViaSsh')
			.mockRejectedValue(new Error('ssh auth failed'));
		const localSpy = jest
			.spyOn(service as any, 'tryDatabaseDumpLocal')
			.mockResolvedValueOnce(undefined);

		const result = await (service as any).createDatabaseDump(
			{
				environmentId: 1,
				databaseName: 'acme_db',
				databaseUser: 'acme_user',
				databasePassword: 'secret',
				serverHostname: 'app-1',
				sshUser: 'forge',
				sshPort: 22,
				sshKeyPath: '/tmp/id_rsa',
				sshPrivateKey: null,
				sshPassword: null,
			} as any,
			'/tmp/database.sql',
		);

		expect(localSpy).toHaveBeenCalled();
		expect(result.transport).toBe('local');

		if (previousDumpBins === undefined) {
			delete process.env.FORGE_BACKUP_DB_DUMP_BIN;
		} else {
			process.env.FORGE_BACKUP_DB_DUMP_BIN = previousDumpBins;
		}
		if (previousDumpHost === undefined) {
			delete process.env.FORGE_BACKUP_DB_HOST;
		} else {
			process.env.FORGE_BACKUP_DB_HOST = previousDumpHost;
		}
		if (previousLegacy === undefined) {
			delete process.env.FORGE_BACKUP_DB_LEGACY_FALLBACK;
		} else {
			process.env.FORGE_BACKUP_DB_LEGACY_FALLBACK = previousLegacy;
		}
	});

	it('reports ssh-first failures when legacy fallback is disabled', async () => {
		const previousDumpBins = process.env.FORGE_BACKUP_DB_DUMP_BIN;
		const previousDumpHost = process.env.FORGE_BACKUP_DB_HOST;
		const previousLegacy = process.env.FORGE_BACKUP_DB_LEGACY_FALLBACK;
		process.env.FORGE_BACKUP_DB_DUMP_BIN = 'mariadb-dump';
		process.env.FORGE_BACKUP_DB_HOST = 'db.internal';
		process.env.FORGE_BACKUP_DB_LEGACY_FALLBACK = 'false';

		jest
			.spyOn(service as any, 'resolveRemoteDatabaseConfigFromSource')
			.mockResolvedValueOnce({
				databaseHost: 'db.internal',
				databasePort: '3306',
				databaseName: 'acme_db',
				databaseUser: 'acme_user',
				databasePassword: 'secret',
			});

		jest
			.spyOn(service as any, 'createDatabaseDumpViaSsh')
			.mockRejectedValue(new Error('ssh auth failed'));

		await expect(
			(service as any).createDatabaseDump(
				{
					environmentId: 1,
					databaseName: 'acme_db',
					databaseUser: 'acme_user',
					databasePassword: 'secret',
					serverHostname: 'app-1',
					sshUser: 'forge',
					sshPort: 22,
					sshKeyPath: '/tmp/id_rsa',
					sshPrivateKey: null,
					sshPassword: null,
				} as any,
				'/tmp/database.sql',
			),
		).rejects.toThrow(/ssh:mariadb-dump@db\.internal:3306 => ssh auth failed/s);

		if (previousDumpBins === undefined) {
			delete process.env.FORGE_BACKUP_DB_DUMP_BIN;
		} else {
			process.env.FORGE_BACKUP_DB_DUMP_BIN = previousDumpBins;
		}
		if (previousDumpHost === undefined) {
			delete process.env.FORGE_BACKUP_DB_HOST;
		} else {
			process.env.FORGE_BACKUP_DB_HOST = previousDumpHost;
		}
		if (previousLegacy === undefined) {
			delete process.env.FORGE_BACKUP_DB_LEGACY_FALLBACK;
		} else {
			process.env.FORGE_BACKUP_DB_LEGACY_FALLBACK = previousLegacy;
		}
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
