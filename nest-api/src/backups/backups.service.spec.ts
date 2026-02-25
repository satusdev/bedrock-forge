import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BackupsService } from './backups.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('BackupsService', () => {
	let prisma: MockPrisma;
	let service: BackupsService;

	beforeEach(() => {
		prisma = {
			$queryRaw: jest.fn(),
			$executeRaw: jest.fn(),
		};
		service = new BackupsService(prisma as unknown as any);
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
		expect(result.status).toBe('pending');
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
});
