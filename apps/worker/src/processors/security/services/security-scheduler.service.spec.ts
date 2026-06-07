import { SecuritySchedulerService } from './security-scheduler.service';

describe('SecuritySchedulerService', () => {
	let service: SecuritySchedulerService;
	let prismaMock: any;
	let securityQueueMock: any;

	beforeEach(() => {
		prismaMock = {
			securityScanSchedule: {
				findMany: jest.fn(),
				update: jest.fn(),
			},
			server: {
				findUnique: jest.fn(),
			},
			environment: {
				findUnique: jest.fn(),
			},
			jobExecution: {
				create: jest.fn(),
				update: jest.fn(),
			},
			securityScan: {
				create: jest.fn(),
			},
		};
		securityQueueMock = {
			add: jest.fn(),
		};
		service = new SecuritySchedulerService(prismaMock, securityQueueMock);
	});

	describe('isDue', () => {
		it('returns false if current time is more than 15 minutes away from scheduled hour/minute', () => {
			const now = new Date('2026-06-07T14:30:00Z'); // 14:30
			const schedule = {
				frequency: 'daily',
				hour: 14,
				minute: 0,
				day_of_week: null,
				day_of_month: null,
				last_run_at: null,
			};
			expect(service.isDue(schedule, now)).toBe(false);
		});

		it('returns true for daily schedule if hour/minute matches and not run recently', () => {
			const now = new Date('2026-06-07T14:02:00Z'); // 14:02
			const schedule = {
				frequency: 'daily',
				hour: 14,
				minute: 0,
				day_of_week: null,
				day_of_month: null,
				last_run_at: new Date('2026-06-06T14:00:00Z'),
			};
			expect(service.isDue(schedule, now)).toBe(true);
		});

		it('returns false if last run was less than daily gap (23 hours)', () => {
			const now = new Date('2026-06-07T14:02:00Z');
			const schedule = {
				frequency: 'daily',
				hour: 14,
				minute: 0,
				day_of_week: null,
				day_of_month: null,
				last_run_at: new Date('2026-06-07T10:00:00Z'), // run 4h ago
			};
			expect(service.isDue(schedule, now)).toBe(false);
		});
	});

	describe('processScheduleTick', () => {
		it('enqueues server scan if due', async () => {
			const now = new Date('2026-06-07T14:00:00Z');
			jest.useFakeTimers({ now });

			const schedule = {
				id: 1,
				server_id: 10,
				environment_id: null,
				frequency: 'daily',
				hour: 14,
				minute: 0,
				day_of_week: null,
				day_of_month: null,
				last_run_at: null,
				enabled: true,
				scan_types: ['SSH_AUDIT'],
			};

			prismaMock.securityScanSchedule.findMany.mockResolvedValue([schedule]);
			prismaMock.server.findUnique.mockResolvedValue({ id: 10 });
			prismaMock.jobExecution.create.mockResolvedValue({ id: BigInt(100) });
			prismaMock.securityScan.create.mockResolvedValue({ id: BigInt(200) });
			securityQueueMock.add.mockResolvedValue({ id: 'bull-job-123' });

			await service.processScheduleTick();

			expect(prismaMock.jobExecution.create).toHaveBeenCalled();
			expect(securityQueueMock.add).toHaveBeenCalled();
			expect(prismaMock.securityScanSchedule.update).toHaveBeenCalledWith({
				where: { id: 1 },
				data: { last_run_at: now },
			});

			jest.useRealTimers();
		});

		it('enqueues environment scan if due', async () => {
			const now = new Date('2026-06-07T14:00:00Z');
			jest.useFakeTimers({ now });

			const schedule = {
				id: 2,
				server_id: null,
				environment_id: 20,
				frequency: 'daily',
				hour: 14,
				minute: 0,
				day_of_week: null,
				day_of_month: null,
				last_run_at: null,
				enabled: true,
				scan_types: ['WP_AUDIT'],
			};

			prismaMock.securityScanSchedule.findMany.mockResolvedValue([schedule]);
			prismaMock.environment.findUnique.mockResolvedValue({ id: 20, server_id: 10 });
			prismaMock.jobExecution.create.mockResolvedValue({ id: BigInt(101) });
			prismaMock.securityScan.create.mockResolvedValue({ id: BigInt(201) });
			securityQueueMock.add.mockResolvedValue({ id: 'bull-job-456' });

			await service.processScheduleTick();

			expect(prismaMock.jobExecution.create).toHaveBeenCalled();
			expect(securityQueueMock.add).toHaveBeenCalled();
			expect(prismaMock.securityScanSchedule.update).toHaveBeenCalledWith({
				where: { id: 2 },
				data: { last_run_at: now },
			});

			jest.useRealTimers();
		});
	});
});
