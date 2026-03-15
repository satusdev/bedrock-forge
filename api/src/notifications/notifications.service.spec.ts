import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('NotificationsService', () => {
	let prisma: MockPrisma;
	let service: NotificationsService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		service = new NotificationsService(prisma as unknown as any);
	});

	it('lists channels', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				name: 'Slack',
				channel_type: 'slack',
				config: '{}',
				is_active: true,
				last_sent_at: null,
				last_error: null,
				owner_id: 1,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.getChannels();
		expect(result[0]?.name).toBe('Slack');
	});

	it('throws for missing channel', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await expect(service.getChannel(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
});
