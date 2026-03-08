import {
	BadRequestException,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
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

describe('BackupsService', () => {
	let prisma: MockPrisma;
	let service: BackupsService;
	let websocketCompatService: MockWebsocketCompatService;

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
		service = new BackupsService(
			prisma as unknown as any,
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
		prisma.backups.update.mockResolvedValue({ id: 21 });

		const result = await service.markStaleRunningBackupsFailed(180, 2);
		expect(result).toEqual([{ id: 21 }, { id: 22 }]);
		expect(prisma.backups.update).toHaveBeenCalledTimes(2);
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
		prisma.$executeRaw.mockResolvedValueOnce(1);

		await service.deleteBackup(8, false);
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
			.mockResolvedValueOnce(undefined);
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
});
