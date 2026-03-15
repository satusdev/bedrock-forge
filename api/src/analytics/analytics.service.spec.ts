import { NotFoundException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('AnalyticsService', () => {
	let prisma: MockPrisma;
	let service: AnalyticsService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new AnalyticsService(prisma as unknown as any);
	});

	it('runs ga4 report and returns created report', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{ id: 1, name: 'Acme', wp_home: 'https://acme.test' },
			])
			.mockResolvedValueOnce([{ id: 99 }])
			.mockResolvedValueOnce([
				{
					id: 99,
					project_id: 1,
					environment_id: null,
					report_type: 'ga4',
					url: 'https://acme.test',
					property_id: null,
					device: null,
					start_date: null,
					end_date: null,
					summary: { total_sessions: 100 },
					payload: { rows: [] },
					created_at: new Date(),
				},
			]);

		const result = await service.runGa4Report({ project_id: 1, days: 7 });
		expect(result.id).toBe(99);
		expect(result.report_type).toBe('ga4');
	});

	it('throws not found on unknown report', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.getReport(404)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
});
