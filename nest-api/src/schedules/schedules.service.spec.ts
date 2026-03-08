import { NotFoundException } from '@nestjs/common';
import { SchedulesService } from './schedules.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
	projects: {
		findFirst: jest.Mock;
	};
	project_servers: {
		findFirst: jest.Mock;
	};
	backup_schedules: {
		findMany: jest.Mock;
		findFirst: jest.Mock;
		create: jest.Mock;
		update: jest.Mock;
		updateMany: jest.Mock;
		delete: jest.Mock;
	};
};

describe('SchedulesService', () => {
	let prisma: MockPrisma;
	let service: SchedulesService;
	let backupsService: {
		createBackup: jest.Mock;
		runBackup: jest.Mock;
	};

	beforeEach(() => {
		prisma = {
			$queryRaw: jest.fn(),
			$executeRaw: jest.fn(),
			projects: {
				findFirst: jest.fn(),
			},
			project_servers: {
				findFirst: jest.fn(),
			},
			backup_schedules: {
				findMany: jest.fn(),
				findFirst: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				updateMany: jest.fn(),
				delete: jest.fn(),
			},
		};
		backupsService = {
			createBackup: jest.fn(),
			runBackup: jest.fn(),
		};
		service = new SchedulesService(
			prisma as unknown as any,
			backupsService as unknown as any,
		);
	});

	it('lists schedules', async () => {
		prisma.backup_schedules.findMany.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Daily',
				description: null,
				frequency: 'daily',
				cron_expression: null,
				hour: 2,
				minute: 0,
				day_of_week: null,
				day_of_month: null,
				timezone: 'UTC',
				backup_type: 'full',
				storage_type: 'google_drive',
				retention_count: 7,
				retention_days: null,
				status: 'active',
				last_run_at: null,
				next_run_at: null,
				project_id: 1,
				environment_id: null,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.listSchedules({});
		expect(result[0]?.name).toBe('Daily');
	});

	it('gets schedule by id', async () => {
		prisma.backup_schedules.findFirst.mockResolvedValueOnce({
			id: 2,
			name: 'Weekly',
			description: null,
			frequency: 'weekly',
			cron_expression: null,
			hour: 2,
			minute: 0,
			day_of_week: 1,
			day_of_month: null,
			timezone: 'UTC',
			backup_type: 'full',
			storage_type: 'google_drive',
			retention_count: 7,
			retention_days: null,
			status: 'active',
			last_run_at: null,
			next_run_at: null,
			project_id: 1,
			environment_id: null,
			created_at: new Date(),
			updated_at: new Date(),
		});

		const result = await service.getSchedule(2);
		expect(result.id).toBe(2);
	});

	it('creates schedule', async () => {
		prisma.projects.findFirst.mockResolvedValueOnce({ id: 1 });
		prisma.backup_schedules.create.mockResolvedValueOnce({
			id: 3,
			name: 'Monthly',
			description: null,
			frequency: 'monthly',
			cron_expression: null,
			hour: 3,
			minute: 30,
			day_of_week: null,
			day_of_month: 1,
			timezone: 'UTC',
			backup_type: 'database',
			storage_type: 'google_drive',
			retention_count: 10,
			retention_days: 30,
			status: 'active',
			last_run_at: null,
			next_run_at: null,
			project_id: 1,
			environment_id: null,
			created_at: new Date(),
			updated_at: new Date(),
		});

		const result = await service.createSchedule({
			name: 'Monthly',
			project_id: 1,
		});
		expect(result.id).toBe(3);
		expect(prisma.backup_schedules.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					next_run_at: expect.any(Date),
				}),
			}),
		);
	});

	it('updates schedule', async () => {
		prisma.backup_schedules.findFirst
			.mockResolvedValueOnce({
				id: 4,
				name: 'Old',
				description: null,
				frequency: 'daily',
				cron_expression: null,
				hour: 2,
				minute: 0,
				day_of_week: null,
				day_of_month: null,
				timezone: 'UTC',
				backup_type: 'full',
				storage_type: 'google_drive',
				retention_count: 7,
				retention_days: null,
				status: 'active',
				last_run_at: null,
				next_run_at: null,
				project_id: 1,
				environment_id: null,
				created_at: new Date(),
				updated_at: new Date(),
			})
			.mockResolvedValueOnce({
				id: 4,
				name: 'New',
				description: null,
				frequency: 'daily',
				cron_expression: null,
				hour: 2,
				minute: 0,
				day_of_week: null,
				day_of_month: null,
				timezone: 'UTC',
				backup_type: 'full',
				storage_type: 'google_drive',
				retention_count: 7,
				retention_days: null,
				status: 'active',
				last_run_at: null,
				next_run_at: null,
				project_id: 1,
				environment_id: null,
				created_at: new Date(),
				updated_at: new Date(),
			});
		prisma.backup_schedules.update.mockResolvedValueOnce({ id: 4 });

		const result = await service.updateSchedule(4, { name: 'New' });
		expect(result.name).toBe('New');
	});

	it('deletes schedule', async () => {
		prisma.backup_schedules.findFirst.mockResolvedValueOnce({
			id: 5,
			name: 'Delete',
			description: null,
			frequency: 'daily',
			cron_expression: null,
			hour: 2,
			minute: 0,
			day_of_week: null,
			day_of_month: null,
			timezone: 'UTC',
			backup_type: 'full',
			storage_type: 'google_drive',
			retention_count: 7,
			retention_days: null,
			status: 'active',
			last_run_at: null,
			next_run_at: null,
			project_id: 1,
			environment_id: null,
			created_at: new Date(),
			updated_at: new Date(),
		});
		prisma.backup_schedules.delete.mockResolvedValueOnce({ id: 5 });

		await service.deleteSchedule(5);
		expect(prisma.backup_schedules.delete).toHaveBeenCalled();
	});

	it('returns run-now task payload', async () => {
		prisma.backup_schedules.findFirst.mockResolvedValueOnce({
			id: 6,
			name: 'Run me',
			description: null,
			frequency: 'daily',
			cron_expression: null,
			hour: 2,
			minute: 0,
			day_of_week: null,
			day_of_month: null,
			timezone: 'UTC',
			backup_type: 'full',
			storage_type: 'google_drive',
			retention_count: 7,
			retention_days: null,
			status: 'active',
			last_run_at: null,
			next_run_at: null,
			project_id: 1,
			environment_id: null,
			created_at: new Date(),
			updated_at: new Date(),
		});
		backupsService.createBackup.mockResolvedValueOnce({
			task_id: 'task-1',
			backup_id: 77,
			status: 'pending',
		});
		backupsService.runBackup.mockResolvedValueOnce({
			task_id: 'task-1',
			status: 'accepted',
		});
		prisma.backup_schedules.update.mockResolvedValueOnce({ id: 6 });

		const result = await service.runScheduleNow(6);
		expect(result.status).toBe('accepted');
		expect(result.schedule_id).toBe(6);
		expect(result.backup_id).toBe(77);
		expect(backupsService.createBackup).toHaveBeenCalled();
		expect(backupsService.runBackup).toHaveBeenCalled();
		expect(prisma.backup_schedules.update).toHaveBeenCalled();
	});

	it('claims due active schedules for runner execution', async () => {
		prisma.backup_schedules.findMany.mockResolvedValueOnce([
			{ id: 10, created_by_id: 2 },
		]);
		prisma.backup_schedules.updateMany.mockResolvedValueOnce({ count: 1 });

		const result = await service.claimDueSchedules(5);
		expect(result).toEqual([{ id: 10, created_by_id: 2 }]);
		expect(prisma.backup_schedules.updateMany).toHaveBeenCalled();
	});

	it('throws when schedule missing', async () => {
		prisma.backup_schedules.findFirst.mockResolvedValueOnce(null);
		await expect(service.getSchedule(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('returns empty list for invalid status filter', async () => {
		const result = await service.listSchedules({ status: 'invalid-status' });
		expect(result).toEqual([]);
		expect(prisma.backup_schedules.findMany).not.toHaveBeenCalled();
	});
});
