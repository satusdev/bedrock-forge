import { NotFoundException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
	monitors: {
		findMany: jest.Mock;
		updateMany: jest.Mock;
		update: jest.Mock;
	};
	heartbeats: {
		create: jest.Mock;
	};
	incidents: {
		findFirst: jest.Mock;
		create: jest.Mock;
		update: jest.Mock;
	};
};

describe('MonitorsService', () => {
	let prisma: MockPrisma;
	let service: MonitorsService;

	beforeEach(() => {
		prisma = {
			$queryRaw: jest.fn(),
			$executeRaw: jest.fn(),
			monitors: {
				findMany: jest.fn(),
				updateMany: jest.fn(),
				update: jest.fn(),
			},
			heartbeats: {
				create: jest.fn(),
			},
			incidents: {
				findFirst: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
			},
		};
		service = new MonitorsService(prisma as unknown as any);
	});

	it('lists monitors', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Main monitor',
				monitor_type: 'uptime',
				url: 'https://acme.test',
				interval_seconds: 300,
				timeout_seconds: 30,
				is_active: true,
				last_check_at: null,
				last_status: 'up',
				last_response_time_ms: 120,
				uptime_percentage: 99.9,
				created_at: new Date(),
				project_id: 1,
				project_server_id: 2,
			},
		]);

		const result = await service.listMonitors(0, 10);
		expect(result[0]?.name).toBe('Main monitor');
	});

	it('creates monitor', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 2, project_id: 1 }])
			.mockResolvedValueOnce([{ id: 1 }])
			.mockResolvedValueOnce([{ id: 10 }])
			.mockResolvedValueOnce([
				{
					id: 10,
					name: 'API monitor',
					monitor_type: 'uptime',
					url: 'https://api.acme.test',
					interval_seconds: 300,
					timeout_seconds: 30,
					is_active: true,
					last_check_at: null,
					last_status: null,
					last_response_time_ms: null,
					uptime_percentage: null,
					created_at: new Date(),
					project_id: 1,
					project_server_id: 2,
				},
			]);

		const result = await service.createMonitor({
			name: 'API monitor',
			url: 'https://api.acme.test',
			project_server_id: 2,
		});
		expect(result.id).toBe(10);
	});

	it('throws when monitor not found', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.getMonitor(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('returns overview stats', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				total: BigInt(4),
				active: BigInt(3),
				up_count: BigInt(2),
				down_count: BigInt(1),
				avg_uptime: 98.5,
			},
		]);
		const result = await service.getOverview();
		expect(result.total).toBe(4);
		expect(result.status.up).toBe(2);
	});

	it('claims due monitors', async () => {
		prisma.monitors.findMany.mockResolvedValueOnce([
			{
				id: 8,
				created_by_id: 1,
				maintenance_start: null,
				maintenance_end: null,
				last_check_at: null,
				interval_seconds: 300,
			},
		]);
		prisma.monitors.updateMany.mockResolvedValueOnce({ count: 1 });

		const result = await service.claimDueMonitors(5);

		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe(8);
		expect(prisma.monitors.updateMany).toHaveBeenCalled();
	});

	it('runs monitor check and records heartbeat', async () => {
		const monitorRow = {
			id: 12,
			name: 'Check me',
			monitor_type: 'uptime',
			url: 'https://acme.test/health',
			interval_seconds: 300,
			timeout_seconds: 30,
			is_active: true,
			last_check_at: null,
			last_status: 'up',
			last_response_time_ms: 100,
			uptime_percentage: 99,
			created_at: new Date(),
			project_id: 1,
			project_server_id: 2,
			created_by_id: 1,
			alert_on_down: true,
			last_error_message: null,
			maintenance_start: null,
			maintenance_end: null,
		};

		prisma.$queryRaw
			.mockResolvedValueOnce([monitorRow])
			.mockResolvedValueOnce([]);
		prisma.monitors.update.mockResolvedValueOnce({ id: 12 });
		prisma.heartbeats.create.mockResolvedValueOnce({ id: 1 });
		prisma.incidents.findFirst.mockResolvedValueOnce(null);
		const fetchSpy = jest.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
			ok: true,
			status: 200,
		} as Response);

		const result = await service.runMonitorCheck(12);

		expect(result.monitor_id).toBe(12);
		expect(result.status).toBe('up');
		expect(prisma.monitors.update).toHaveBeenCalled();
		expect(prisma.heartbeats.create).toHaveBeenCalled();
		fetchSpy.mockRestore();
	});

	it('records and exposes monitor runner snapshot', () => {
		service.recordRunnerSnapshot({
			claimed: 3,
			checks_succeeded: 2,
			checks_failed: 1,
			error: null,
		});

		const snapshot = service.getRunnerSnapshot();
		expect(snapshot.runs_total).toBe(1);
		expect(snapshot.last_run_at).toBeTruthy();
		expect(snapshot.last_outcome?.claimed).toBe(3);
	});
});
