import { NotFoundException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
};

describe('DashboardService', () => {
	let prisma: MockPrisma;
	let service: DashboardService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn() };
		service = new DashboardService(prisma as unknown as any);
	});

	it('returns dashboard stats', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				total_projects: BigInt(2),
				active_projects: BigInt(1),
				total_servers: BigInt(3),
				healthy_sites: BigInt(4),
				failed_backups: BigInt(1),
			},
		]);

		const result = await service.getStats();
		expect(result.total_projects).toBe(2);
	});

	it('updates and retrieves widget config', () => {
		service.updateWidget('w1', { enabled: true });
		const widget = service.getWidget('w1');
		expect(widget.widget_id).toBe('w1');
	});

	it('throws for missing widget', () => {
		expect(() => service.getWidget('missing')).toThrow(NotFoundException);
	});
});
