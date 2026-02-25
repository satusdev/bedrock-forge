import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

describe('UsersService', () => {
	let prisma: MockPrisma;
	let service: UsersService;

	beforeEach(() => {
		prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
		const configService = {
			get: jest.fn((key: string) => {
				if (key === 'SECRET_KEY' || key === 'JWT_SECRET') {
					return 'test-secret';
				}
				if (key === 'JWT_ALGORITHM') {
					return 'HS256';
				}
				return undefined;
			}),
		};

		service = new UsersService(
			prisma as unknown as any,
			configService as unknown as ConfigService,
		);
	});

	it('lists users and groups role rows', async () => {
		const now = new Date();
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 1,
				email: 'admin@example.com',
				username: 'admin',
				full_name: 'Admin User',
				is_active: true,
				is_superuser: true,
				avatar_url: null,
				created_at: now,
				updated_at: now,
				role_id: 1,
				role_name: 'admin',
				role_display_name: 'Administrator',
				role_color: '#ef4444',
			},
			{
				id: 1,
				email: 'admin@example.com',
				username: 'admin',
				full_name: 'Admin User',
				is_active: true,
				is_superuser: true,
				avatar_url: null,
				created_at: now,
				updated_at: now,
				role_id: 2,
				role_name: 'manager',
				role_display_name: 'Manager',
				role_color: '#f59e0b',
			},
		]);

		const result = await service.listUsers();
		expect(result).toHaveLength(1);
		expect(result[0]?.roles).toHaveLength(2);
	});

	it('throws when user is not found', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		await expect(service.getUser(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
});
