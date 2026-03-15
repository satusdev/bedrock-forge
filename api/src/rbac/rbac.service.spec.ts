import { BadRequestException } from '@nestjs/common';
import { RbacService } from './rbac.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('RbacService', () => {
	let prisma: MockPrisma;
	let service: RbacService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new RbacService(prisma as unknown as any);
	});

	it('lists permissions', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				code: 'projects.view',
				name: 'View Projects',
				category: 'projects',
			},
		]);

		const result = await service.listPermissions();
		expect(result[0]?.code).toBe('projects.view');
	});

	it('throws for deleting system role', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ id: 1, is_system: true }]);

		await expect(service.deleteRole(1)).rejects.toBeInstanceOf(
			BadRequestException,
		);
	});
});
