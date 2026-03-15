import {
	BadRequestException,
	HttpException,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { ClientAuthService } from './client-auth.service';

type MockPrisma = {
	client_users: {
		findUnique: jest.Mock;
		update: jest.Mock;
	};
	clients: {
		findUnique: jest.Mock;
	};
};

type MockConfig = {
	get: jest.Mock;
};

describe('ClientAuthService', () => {
	const jwtSecret = 'test-access-secret';
	const refreshSecret = 'test-refresh-secret';
	let prisma: MockPrisma;
	let config: MockConfig;
	let service: ClientAuthService;

	beforeEach(() => {
		prisma = {
			client_users: {
				findUnique: jest.fn(),
				update: jest.fn(),
			},
			clients: {
				findUnique: jest.fn(),
			},
		};
		config = {
			get: jest.fn((key: string, defaultValue?: string | number) => {
				const values: Record<string, string | number> = {
					JWT_SECRET: jwtSecret,
					JWT_EXPIRES_IN: '900s',
					JWT_REFRESH_SECRET: refreshSecret,
					JWT_REFRESH_EXPIRES_IN: '7d',
				};
				return values[key] ?? defaultValue;
			}),
		};

		service = new ClientAuthService(
			prisma as unknown as any,
			config as unknown as ConfigService,
		);
	});

	it('logs in a client user and returns tokens', async () => {
		const passwordHash = await bcrypt.hash('ClientPassword123!', 10);
		prisma.client_users.findUnique.mockResolvedValueOnce({
			id: 11,
			email: 'client@example.com',
			password_hash: passwordHash,
			full_name: 'Client User',
			client_id: 501,
			is_active: true,
			role: 'owner',
			last_login_at: null,
		});
		prisma.clients.findUnique.mockResolvedValueOnce({
			id: 501,
			name: 'Acme Corp',
			company: 'Acme',
		});
		prisma.client_users.update.mockResolvedValueOnce({ id: 11 });

		const result = await service.login({
			email: 'client@example.com',
			password: 'ClientPassword123!',
		});

		expect(result.token_type).toBe('bearer');
		expect(result.client_id).toBe(501);
		expect(result.client_name).toBe('Acme Corp');
		expect(jwt.verify(result.access_token, jwtSecret)).toBeTruthy();
		expect(prisma.client_users.update).toHaveBeenCalled();
	});

	it('rejects login with bad credentials', async () => {
		prisma.client_users.findUnique.mockResolvedValueOnce(null);

		await expect(
			service.login({ email: 'nobody@example.com', password: 'Nope123!' }),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('rejects login when user is inactive', async () => {
		const passwordHash = await bcrypt.hash('ClientPassword123!', 10);
		prisma.client_users.findUnique.mockResolvedValueOnce({
			id: 11,
			email: 'client@example.com',
			password_hash: passwordHash,
			full_name: 'Client User',
			client_id: 501,
			is_active: false,
			role: 'owner',
			last_login_at: null,
		});

		await expect(
			service.login({
				email: 'client@example.com',
				password: 'ClientPassword123!',
			}),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('rejects login when password is invalid', async () => {
		const passwordHash = await bcrypt.hash('ClientPassword123!', 10);
		prisma.client_users.findUnique.mockResolvedValueOnce({
			id: 11,
			email: 'client@example.com',
			password_hash: passwordHash,
			full_name: 'Client User',
			client_id: 501,
			is_active: true,
			role: 'owner',
			last_login_at: null,
		});

		await expect(
			service.login({ email: 'client@example.com', password: 'WrongPassword' }),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('rejects login when client account does not exist', async () => {
		const passwordHash = await bcrypt.hash('ClientPassword123!', 10);
		prisma.client_users.findUnique.mockResolvedValueOnce({
			id: 11,
			email: 'client@example.com',
			password_hash: passwordHash,
			full_name: 'Client User',
			client_id: 501,
			is_active: true,
			role: 'owner',
			last_login_at: null,
		});
		prisma.clients.findUnique.mockResolvedValueOnce(null);

		await expect(
			service.login({
				email: 'client@example.com',
				password: 'ClientPassword123!',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('returns active client user profile via /me', async () => {
		const token = jwt.sign(
			{ sub: 'client@example.com', client_id: 501, type: 'client' },
			jwtSecret,
			{ expiresIn: '1h' },
		);
		prisma.client_users.findUnique.mockResolvedValueOnce({
			id: 11,
			email: 'client@example.com',
			password_hash: 'hash',
			full_name: 'Client User',
			client_id: 501,
			is_active: true,
			role: 'owner',
			last_login_at: null,
		});
		prisma.clients.findUnique.mockResolvedValueOnce({
			id: 501,
			name: 'Acme Corp',
			company: 'Acme',
		});

		const result = await service.me(token);

		expect(result.email).toBe('client@example.com');
		expect(result.client_name).toBe('Acme Corp');
	});

	it('rejects refresh for non-client token type', async () => {
		const token = jwt.sign(
			{ sub: 11, client_id: 501, type: 'access' },
			refreshSecret,
			{ expiresIn: '1h' },
		);

		await expect(service.refresh(token)).rejects.toBeInstanceOf(
			UnauthorizedException,
		);
	});

	it('returns unauthorized when refresh user no longer exists', async () => {
		const token = jwt.sign(
			{ sub: 'missing@example.com', client_id: 501, type: 'client' },
			jwtSecret,
			{ expiresIn: '1h' },
		);
		prisma.client_users.findUnique.mockResolvedValueOnce(null);

		await expect(service.refresh(token)).rejects.toBeInstanceOf(
			UnauthorizedException,
		);
	});

	it('refreshes a valid client token', async () => {
		const token = jwt.sign(
			{ sub: 'client@example.com', client_id: 501, type: 'client' },
			jwtSecret,
			{ expiresIn: '1h' },
		);
		prisma.client_users.findUnique.mockResolvedValueOnce({
			id: 11,
			email: 'client@example.com',
			password_hash: 'hash',
			full_name: 'Client User',
			client_id: 501,
			is_active: true,
			role: 'owner',
			last_login_at: null,
		});
		prisma.clients.findUnique.mockResolvedValueOnce({
			id: 501,
			name: 'Acme Corp',
			company: 'Acme',
		});

		const result = await service.refresh(token);

		expect(result.token_type).toBe('bearer');
		expect(result.client_name).toBe('Acme Corp');
		expect(typeof result.access_token).toBe('string');
	});

	it('throws when /me token is malformed', async () => {
		await expect(service.me('invalid.token.value')).rejects.toBeInstanceOf(
			HttpException,
		);
	});
});
