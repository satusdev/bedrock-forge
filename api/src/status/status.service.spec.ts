import { NotFoundException } from '@nestjs/common';
import { StatusService } from './status.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
};

describe('StatusService', () => {
	let prisma: MockPrisma;
	let service: StatusService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn() };
		service = new StatusService(prisma as unknown as any);
	});

	it('throws when project is not found', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		await expect(service.getStatusPage(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});

	it('returns empty status payload when project has no monitors', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 1, name: 'Acme' }])
			.mockResolvedValueOnce([]);

		const result = await service.getStatusPage(1);
		expect(result.project_name).toBe('Acme');
		expect(result.overall_status).toBe('unknown');
		expect(result.monitors).toHaveLength(0);
	});

	it('returns empty history payload when no active monitors exist', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ id: 1, name: 'Acme' }])
			.mockResolvedValueOnce([]);

		const result = await service.getStatusHistory(1, 30);
		expect(result.history).toEqual([]);
		expect(result.average_uptime).toBe(100);
	});
});
