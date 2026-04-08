import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { MonitorProcessor } from './monitor.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUES } from '@bedrock-forge/shared';

// ── Helpers ──────────────────────────────────────────────────────────────────

type MockPrisma = {
	monitor: {
		findUnique: jest.Mock;
		update: jest.Mock;
	};
	monitorResult: {
		create: jest.Mock;
		deleteMany: jest.Mock;
		count: jest.Mock;
	};
	monitorLog: {
		create: jest.Mock;
		findFirst: jest.Mock;
		update: jest.Mock;
	};
	jobExecution: {
		create: jest.Mock;
		update: jest.Mock;
	};
};

function makePrisma(): MockPrisma {
	return {
		monitor: {
			findUnique: jest.fn(),
			update: jest.fn().mockResolvedValue({}),
		},
		monitorResult: {
			create: jest.fn().mockResolvedValue({}),
			deleteMany: jest.fn().mockResolvedValue({}),
			count: jest.fn().mockResolvedValue(0),
		},
		monitorLog: {
			create: jest.fn().mockResolvedValue({}),
			findFirst: jest.fn().mockResolvedValue(null),
			update: jest.fn().mockResolvedValue({}),
		},
		jobExecution: {
			create: jest.fn().mockResolvedValue({ id: BigInt(99) }),
			update: jest.fn().mockResolvedValue({}),
		},
	};
}

function makeNotifQueue() {
	return { add: jest.fn().mockResolvedValue({}) };
}

function baseMonitor(overrides: Partial<{
	last_checked_at: Date | null;
	last_status: number | null;
}> = {}) {
	return {
		id: BigInt(1),
		environment_id: BigInt(5),
		enabled: true,
		interval_seconds: 300,
		last_checked_at: null,
		last_status: null,
		last_response_ms: null,
		uptime_pct: 100,
		environment: { id: BigInt(5), url: 'http://localhost:12345/never-exists' },
		...overrides,
	};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MonitorProcessor', () => {
	let processor: MonitorProcessor;
	let prisma: MockPrisma;
	let notifQueue: ReturnType<typeof makeNotifQueue>;

	beforeEach(async () => {
		prisma = makePrisma();
		notifQueue = makeNotifQueue();

		const module = await Test.createTestingModule({
			providers: [
				MonitorProcessor,
				{ provide: PrismaService, useValue: prisma },
				{ provide: getQueueToken(QUEUES.NOTIFICATIONS), useValue: notifQueue },
			],
		}).compile();

		processor = module.get(MonitorProcessor);
	});

	it('exits early if monitor not found', async () => {
		prisma.monitor.findUnique.mockResolvedValue(null);
		const job = { id: '1', data: { monitorId: 999 } } as any;
		await processor.process(job);
		expect(prisma.monitorResult.create).not.toHaveBeenCalled();
	});

	it('creates a JobExecution at the start of every check', async () => {
		prisma.monitor.findUnique.mockResolvedValue(baseMonitor());
		const job = { id: 'j1', data: { monitorId: 1 } } as any;
		// Fail both attempts immediately (skip real network + 5 s retry delay)
		jest.spyOn(processor as any, 'checkHttp').mockRejectedValue(new Error('ECONNREFUSED'));
		jest.spyOn(global, 'setTimeout').mockImplementation((fn: TimerHandler) => {
			if (typeof fn === 'function') fn();
			return 0 as unknown as ReturnType<typeof setTimeout>;
		});
		await processor.process(job).catch(() => {});
		expect(prisma.jobExecution.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					queue_name: QUEUES.MONITORS,
					bull_job_id: 'j1',
					status: 'active',
				}),
			}),
		);
	});

	it('does NOT fire notification when there is no previous state', async () => {
		// prevIsUp === null → first ever check for this monitor
		const monitor = baseMonitor({ last_checked_at: null, last_status: null });
		prisma.monitor.findUnique.mockResolvedValue(monitor);
		prisma.monitorResult.count.mockResolvedValue(1);

		// Spy on checkHttp to return a controlled response
		jest.spyOn(processor as any, 'checkHttp').mockResolvedValue({ statusCode: 200, body: '' });

		const job = { id: 'j2', data: { monitorId: 1 } } as any;
		await processor.process(job);

		expect(notifQueue.add).not.toHaveBeenCalled();
	});

	it('fires monitor.down notification on up→down transition', async () => {
		// Previously up: last_status=200, last_checked_at set
		const monitor = baseMonitor({
			last_checked_at: new Date(Date.now() - 300_000),
			last_status: 200,
		});
		prisma.monitor.findUnique.mockResolvedValue(monitor);
		prisma.monitorResult.count.mockResolvedValue(5);

		// Both check and retry return 503 → confirmed down
		const checkHttpSpy = jest
			.spyOn(processor as any, 'checkHttp')
			.mockResolvedValue({ statusCode: 503, body: '' });

		// Skip the real 5 s retry delay
		jest.spyOn(global, 'setTimeout').mockImplementation((fn: TimerHandler) => {
			if (typeof fn === 'function') fn();
			return 0 as unknown as ReturnType<typeof setTimeout>;
		});

		const job = { id: 'j3', data: { monitorId: 1 } } as any;
		await processor.process(job);

		// Must have been called twice: initial attempt + confirmation retry
		expect(checkHttpSpy).toHaveBeenCalledTimes(2);

		expect(notifQueue.add).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				eventType: 'monitor.down',
				payload: expect.objectContaining({ transition: 'went_down' }),
			}),
			expect.any(Object),
		);
	});

	it('does NOT fire down notification when retry succeeds after first failure', async () => {
		// Previously up
		const monitor = baseMonitor({
			last_checked_at: new Date(Date.now() - 300_000),
			last_status: 200,
		});
		prisma.monitor.findUnique.mockResolvedValue(monitor);
		prisma.monitorResult.count.mockResolvedValue(5);

		// First call fails, second (retry) succeeds → transient blip, not down
		const checkHttpSpy = jest
			.spyOn(processor as any, 'checkHttp')
			.mockResolvedValueOnce({ statusCode: 503, body: '' })
			.mockResolvedValueOnce({ statusCode: 200, body: '' });

		jest.spyOn(global, 'setTimeout').mockImplementation((fn: TimerHandler) => {
			if (typeof fn === 'function') fn();
			return 0 as unknown as ReturnType<typeof setTimeout>;
		});

		const job = { id: 'j3b', data: { monitorId: 1 } } as any;
		await processor.process(job);

		expect(checkHttpSpy).toHaveBeenCalledTimes(2);
		// No state transition to 'down' — retry recovered
		expect(notifQueue.add).not.toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ eventType: 'monitor.down' }),
			expect.any(Object),
		);
	});

	it('fires monitor.up notification on down→up transition', async () => {
		// Previously down: last_status=503
		const monitor = baseMonitor({
			last_checked_at: new Date(Date.now() - 300_000),
			last_status: 503,
		});
		prisma.monitor.findUnique.mockResolvedValue(monitor);
		prisma.monitorResult.count.mockResolvedValue(5);

		// Current check returns 200 → isUp = true
		jest.spyOn(processor as any, 'checkHttp').mockResolvedValue({ statusCode: 200, body: '' });

		const job = { id: 'j4', data: { monitorId: 1 } } as any;
		await processor.process(job);

		expect(notifQueue.add).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				eventType: 'monitor.up',
				payload: expect.objectContaining({ transition: 'recovered' }),
			}),
			expect.any(Object),
		);
	});

	it('marks execution completed when site is up', async () => {
		const monitor = baseMonitor();
		prisma.monitor.findUnique.mockResolvedValue(monitor);
		jest.spyOn(processor as any, 'checkHttp').mockResolvedValue({ statusCode: 200, body: '' });

		const job = { id: 'j5', data: { monitorId: 1 } } as any;
		await processor.process(job);

		expect(prisma.jobExecution.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ status: 'completed', progress: 100 }),
			}),
		);
	});

	it('marks execution failed when site is down', async () => {
		const monitor = baseMonitor();
		prisma.monitor.findUnique.mockResolvedValue(monitor);
		jest.spyOn(processor as any, 'checkHttp').mockResolvedValue({ statusCode: 503, body: '' });

		const job = { id: 'j6', data: { monitorId: 1 } } as any;
		await processor.process(job);

		expect(prisma.jobExecution.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ status: 'failed' }),
			}),
		);
	});
});
