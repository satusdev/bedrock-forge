import { NotFoundException } from '@nestjs/common';
import { SchedulesService } from './schedules.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('SchedulesService', () => {
	let prisma: MockPrisma;
	let service: SchedulesService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new SchedulesService(prisma as unknown as any);
	});

	it('lists schedules', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
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
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.listSchedules({});
		expect(result[0]?.name).toBe('Daily');
	});

	it('gets schedule by id', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
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
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.getSchedule(2);
		expect(result.id).toBe(2);
	});

	it('creates schedule', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([
			{
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
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.createSchedule({
			name: 'Monthly',
			project_id: 1,
		});
		expect(result.id).toBe(3);
	});

	it('updates schedule', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
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
					created_at: new Date(),
					updated_at: new Date(),
				},
			])
			.mockResolvedValueOnce([
				{
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
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.updateSchedule(4, { name: 'New' });
		expect(result.name).toBe('New');
	});

	it('deletes schedule', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
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
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		await service.deleteSchedule(5);
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('returns run-now task payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
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
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.runScheduleNow(6);
		expect(result.status).toBe('accepted');
		expect(result.schedule_id).toBe(6);
	});

	it('throws when schedule missing', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.getSchedule(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
});
