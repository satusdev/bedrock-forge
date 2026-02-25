import { NotFoundException } from '@nestjs/common';
import { MigrationsService } from './migrations.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
};

describe('MigrationsService', () => {
	let prisma: MockPrisma;
	let service: MigrationsService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn() };
		service = new MigrationsService(prisma as unknown as any);
	});

	it('returns accepted URL migration payload', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 3 }]);

		const result = await service.migrateUrlReplace({
			project_server_id: 3,
			source_url: 'https://old.test',
			target_url: 'https://new.test',
		});

		expect(result.status).toBe('accepted');
		expect(result.project_server_id).toBe(3);
	});

	it('throws when project is missing for drive clone', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		await expect(
			service.cloneFromDrive({
				project_id: 99,
				target_server_id: 2,
				target_domain: 'clone.test',
				environment: 'staging',
				backup_timestamp: '2026-02-18T00:00:00Z',
			}),
		).rejects.toBeInstanceOf(NotFoundException);
	});
});
