import { NotFoundException } from '@nestjs/common';
import { TagsService } from './tags.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('TagsService', () => {
	let prisma: MockPrisma;
	let service: TagsService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new TagsService(prisma as unknown as any);
	});

	it('lists tags', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{ id: 1, name: 'WordPress', slug: 'wordpress' },
		]);

		const result = await service.listTags();
		expect(result[0]?.slug).toBe('wordpress');
	});

	it('throws when tag does not exist', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		await expect(service.getTag(999)).rejects.toBeInstanceOf(NotFoundException);
	});
});
