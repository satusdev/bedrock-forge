import { ActivityService } from './activity.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
};

describe('ActivityService', () => {
	let prisma: MockPrisma;
	let service: ActivityService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn() };
		service = new ActivityService(prisma as unknown as any);
	});

	it('returns feed payload', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ total: BigInt(1) }])
			.mockResolvedValueOnce([
				{
					id: 1,
					action: 'create',
					entity_type: 'project',
					entity_id: '10',
					details: 'Created project',
					user_id: 1,
					user_name: 'Admin',
					ip_address: '127.0.0.1',
					created_at: new Date(),
				},
			]);

		const result = await service.getFeed({ limit: 50, offset: 0 });
		expect(result.total).toBe(1);
		expect(result.items[0]?.action).toBe('create');
	});

	it('returns summary payload', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([{ action: 'create', count: BigInt(2) }])
			.mockResolvedValueOnce([{ entity_type: 'project', count: BigInt(2) }])
			.mockResolvedValueOnce([
				{ total_activities: BigInt(2), unique_users: BigInt(1) },
			]);

		const result = await service.getSummary(24);
		expect(result.total_activities).toBe(2);
		expect(result.by_action.create).toBe(2);
		expect(result.unique_users).toBe(1);
	});
});
