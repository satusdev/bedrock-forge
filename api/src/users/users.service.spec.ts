import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

type MockPrisma = {
	$transaction: jest.Mock;
	users: {
		findMany: jest.Mock;
		findUnique: jest.Mock;
		create: jest.Mock;
		update: jest.Mock;
		delete: jest.Mock;
	};
	user_roles: {
		deleteMany: jest.Mock;
		createMany: jest.Mock;
	};
	roles: {
		findMany: jest.Mock;
	};
	permissions: {
		findMany: jest.Mock;
	};
};

describe('UsersService', () => {
	let prisma: MockPrisma;
	let service: UsersService;

	beforeEach(() => {
		prisma = {
			$transaction: jest.fn(),
			users: {
				findMany: jest.fn(),
				findUnique: jest.fn(),
				create: jest.fn(),
				update: jest.fn(),
				delete: jest.fn(),
			},
			user_roles: {
				deleteMany: jest.fn(),
				createMany: jest.fn(),
			},
			roles: {
				findMany: jest.fn(),
			},
			permissions: {
				findMany: jest.fn(),
			},
		};
		prisma.$transaction.mockImplementation(async callback => callback(prisma));
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
		prisma.users.findMany.mockResolvedValueOnce([
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
				user_roles: [
					{
						role_id: 2,
						user_id: 1,
						roles: {
							id: 2,
							name: 'manager',
							display_name: 'Manager',
							color: '#f59e0b',
						},
					},
					{
						role_id: 1,
						user_id: 1,
						roles: {
							id: 1,
							name: 'admin',
							display_name: 'Administrator',
							color: '#ef4444',
						},
					},
				],
			},
		]);

		const result = await service.listUsers();
		expect(result).toHaveLength(1);
		expect(result[0]?.roles).toHaveLength(2);
		expect(result[0]?.roles[0]?.name).toBe('admin');
	});

	it('throws when user is not found', async () => {
		prisma.users.findUnique.mockResolvedValueOnce(null);

		await expect(service.getUser(999)).rejects.toBeInstanceOf(
			NotFoundException,
		);
	});
});
