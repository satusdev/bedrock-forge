import { NotFoundException } from '@nestjs/common';
import { TagsService } from './tags.service';

type MockPrisma = {
	tags: {
		findMany: jest.Mock;
		findUnique: jest.Mock;
	};
};

describe('TagsService', () => {
	let prisma: MockPrisma;
	let service: TagsService;

	beforeEach(() => {
		prisma = {
			tags: {
				findMany: jest.fn(),
				findUnique: jest.fn(),
			},
		};
		service = new TagsService(prisma as unknown as any);
	});

	it('lists tags', async () => {
		prisma.tags.findMany.mockResolvedValueOnce([
			{ id: 1, name: 'WordPress', slug: 'wordpress' },
		]);

		const result = await service.listTags();
		expect(result[0]?.slug).toBe('wordpress');
	});

	it('throws when tag does not exist', async () => {
		prisma.tags.findUnique.mockResolvedValueOnce(null);

		await expect(service.getTag(999)).rejects.toBeInstanceOf(NotFoundException);
	});
});
