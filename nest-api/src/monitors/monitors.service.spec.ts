import { NotFoundException } from '@nestjs/common';
import { MonitorsService } from './monitors.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('MonitorsService', () => {
	let prisma: MockPrisma;
	let service: MonitorsService;

	beforeEach(() => {
		prisma = {
			$queryRaw: jest.fn(),
			$executeRaw: jest.fn(),
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
});
