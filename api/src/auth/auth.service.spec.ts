import {
	BadRequestException,
	HttpException,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';

type MockPrisma = {
	$queryRaw: jest.Mock;
	$executeRaw: jest.Mock;
};

type MockConfig = {
	get: jest.Mock;
};

describe('AuthService', () => {
	const jwtSecret = 'test-access-secret';
	const refreshSecret = 'test-refresh-secret';
	let prisma: MockPrisma;
	let config: MockConfig;
	let service: AuthService;

	beforeEach(() => {
		prisma = {
			$queryRaw: jest.fn(),
			$executeRaw: jest.fn(),
		};
		config = {
			get: jest.fn((key: string, defaultValue?: string | number) => {
				const values: Record<string, string | number> = {
					JWT_SECRET: jwtSecret,
					JWT_EXPIRES_IN: '900s',
					JWT_REFRESH_SECRET: refreshSecret,
					JWT_REFRESH_EXPIRES_IN: '7d',
					BCRYPT_ROUNDS: 10,
				};
				return values[key] ?? defaultValue;
			}),
		};

		service = new AuthService(
			prisma as unknown as any,
			config as unknown as ConfigService,
		);
	});

	it('logs in an active user and returns access + refresh tokens', async () => {
		const passwordHash = await bcrypt.hash('Password123!', 10);
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 42,
				username: 'admin',
				email: 'admin@example.com',
				hashed_password: passwordHash,
				full_name: null,
				is_active: true,
				is_superuser: false,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.login({
			username: 'admin',
			password: 'Password123!',
		});

		expect(result).toEqual(
			expect.objectContaining({
				token_type: 'bearer',
			}),
		);
		expect(typeof result.access_token).toBe('string');
		expect(typeof result.refresh_token).toBe('string');

		const decoded = jwt.verify(
			result.access_token,
			jwtSecret,
		) as jwt.JwtPayload;
		expect(decoded.sub).toBe('42');
		expect(decoded.type).toBe('access');
	});

	it('rejects login when password is invalid', async () => {
		const passwordHash = await bcrypt.hash('CorrectPassword', 10);
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 12,
				username: 'admin',
				email: 'admin@example.com',
				hashed_password: passwordHash,
				full_name: null,
				is_active: true,
				is_superuser: false,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		await expect(
			service.login({ username: 'admin', password: 'WrongPassword' }),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('rejects login when user does not exist', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);

		await expect(
			service.login({ username: 'missing', password: 'Password123!' }),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('rejects login for inactive user', async () => {
		const passwordHash = await bcrypt.hash('Password123!', 10);
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 42,
				username: 'admin',
				email: 'admin@example.com',
				hashed_password: passwordHash,
				full_name: null,
				is_active: false,
				is_superuser: false,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		await expect(
			service.login({ username: 'admin', password: 'Password123!' }),
		).rejects.toMatchObject({ status: 403 });
	});

	it('refreshes tokens for an active user', async () => {
		const refreshToken = jwt.sign({ sub: '9', type: 'refresh' }, jwtSecret, {
			expiresIn: '1h',
		});
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 9,
				username: 'owner',
				email: 'owner@example.com',
				hashed_password: 'hash',
				full_name: null,
				is_active: true,
				is_superuser: true,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.refresh({ refresh_token: refreshToken });

		expect(result.token_type).toBe('bearer');
		expect(jwt.verify(result.access_token, jwtSecret)).toBeTruthy();
	});

	it('rejects refresh token with wrong type', async () => {
		const accessToken = jwt.sign({ sub: 9, type: 'access' }, jwtSecret, {
			expiresIn: '1h',
		});

		await expect(
			service.refresh({ refresh_token: accessToken }),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('rejects refresh when user is inactive', async () => {
		const refreshToken = jwt.sign({ sub: '9', type: 'refresh' }, jwtSecret, {
			expiresIn: '1h',
		});
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 9,
				username: 'owner',
				email: 'owner@example.com',
				hashed_password: 'hash',
				full_name: null,
				is_active: false,
				is_superuser: false,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		await expect(
			service.refresh({ refresh_token: refreshToken }),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});

	it('creates a user and returns tokens on register', async () => {
		prisma.$queryRaw
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([
				{
					id: 77,
					username: 'newadmin',
					email: 'newadmin@example.com',
					hashed_password: 'hash',
					full_name: null,
					is_active: true,
					is_superuser: false,
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.register({
			username: 'newadmin',
			email: 'newadmin@example.com',
			password: 'Password123!',
		});

		expect(result.email).toBe('newadmin@example.com');
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('rejects register for duplicate email', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([
			{
				id: 1,
				username: 'existing',
				email: 'admin@example.com',
				hashed_password: 'hash',
				full_name: null,
				is_active: true,
				is_superuser: false,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		await expect(
			service.register({
				username: 'newadmin',
				email: 'admin@example.com',
				password: 'Password123!',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('rejects register when username is not alphanumeric', async () => {
		await expect(
			service.register({
				username: 'not-valid!',
				email: 'admin@example.com',
				password: 'Password123!',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('rejects register when password has no digit', async () => {
		await expect(
			service.register({
				username: 'newadmin',
				email: 'admin@example.com',
				password: 'PasswordOnly',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('rejects register when password has no uppercase letter', async () => {
		await expect(
			service.register({
				username: 'newadmin',
				email: 'admin@example.com',
				password: 'password123',
			}),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('returns current active user for /me', async () => {
		const token = jwt.sign({ sub: '4', type: 'access' }, jwtSecret, {
			expiresIn: '1h',
		});
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 4,
				username: 'active',
				email: 'active@example.com',
				hashed_password: 'hash',
				full_name: 'Active User',
				is_active: true,
				is_superuser: true,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		const result = await service.me(`Bearer ${token}`);

		expect(result.email).toBe('active@example.com');
		expect(result.is_superuser).toBe(true);
	});

	it('rejects /me when authorization header is missing', async () => {
		await expect(service.me(undefined)).rejects.toBeInstanceOf(
			UnauthorizedException,
		);
	});

	it('throws 403 when /me is called with inactive user', async () => {
		const token = jwt.sign({ sub: '3', type: 'access' }, jwtSecret, {
			expiresIn: '1h',
		});
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 3,
				username: 'blocked',
				email: 'blocked@example.com',
				hashed_password: 'hash',
				full_name: null,
				is_active: false,
				is_superuser: false,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		await expect(service.me(`Bearer ${token}`)).rejects.toMatchObject({
			status: 403,
		});
	});

	it('updates password when current password is valid', async () => {
		const token = jwt.sign({ sub: '8', type: 'access' }, jwtSecret, {
			expiresIn: '1h',
		});
		const passwordHash = await bcrypt.hash('Current123!', 10);
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 8,
				username: 'admin',
				email: 'admin@example.com',
				hashed_password: passwordHash,
				full_name: null,
				is_active: true,
				is_superuser: false,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.changePassword(
			{
				current_password: 'Current123!',
				new_password: 'NewPassword123!',
			},
			`Bearer ${token}`,
		);

		expect(result.message).toBe('Password changed successfully');
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('returns 400 for password update when current password is incorrect', async () => {
		const token = jwt.sign({ sub: '8', type: 'access' }, jwtSecret, {
			expiresIn: '1h',
		});
		const passwordHash = await bcrypt.hash('Current123!', 10);
		prisma.$queryRaw.mockResolvedValueOnce([
			{
				id: 8,
				username: 'admin',
				email: 'admin@example.com',
				hashed_password: passwordHash,
				full_name: null,
				is_active: true,
				is_superuser: false,
				created_at: new Date(),
				updated_at: new Date(),
			},
		]);

		await expect(
			service.changePassword(
				{
					current_password: 'WrongCurrent123!',
					new_password: 'NewPassword123!',
				},
				`Bearer ${token}`,
			),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('updates profile fields via updateMe', async () => {
		const token = jwt.sign({ sub: '15', type: 'access' }, jwtSecret, {
			expiresIn: '1h',
		});
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 15,
					username: 'admin',
					email: 'admin@example.com',
					hashed_password: 'hash',
					full_name: null,
					is_active: true,
					is_superuser: false,
					created_at: new Date(),
					updated_at: new Date(),
				},
			])
			.mockResolvedValueOnce([
				{
					id: 15,
					username: 'admin',
					email: 'admin@example.com',
					hashed_password: 'hash',
					full_name: 'Updated Name',
					is_active: true,
					is_superuser: false,
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);
		prisma.$executeRaw.mockResolvedValueOnce(1);

		const result = await service.updateMe(
			{ full_name: 'Updated Name' },
			`Bearer ${token}`,
		);

		expect(result.full_name).toBe('Updated Name');
		expect(prisma.$executeRaw).toHaveBeenCalled();
	});

	it('rejects updateMe when email already exists', async () => {
		const token = jwt.sign({ sub: '15', type: 'access' }, jwtSecret, {
			expiresIn: '1h',
		});
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 15,
					username: 'admin',
					email: 'admin@example.com',
					hashed_password: 'hash',
					full_name: null,
					is_active: true,
					is_superuser: false,
					created_at: new Date(),
					updated_at: new Date(),
				},
			])
			.mockResolvedValueOnce([
				{
					id: 99,
					username: 'existing',
					email: 'taken@example.com',
					hashed_password: 'hash',
					full_name: null,
					is_active: true,
					is_superuser: false,
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);

		await expect(
			service.updateMe({ email: 'taken@example.com' }, `Bearer ${token}`),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('rejects updateMe when username already exists', async () => {
		const token = jwt.sign({ sub: '15', type: 'access' }, jwtSecret, {
			expiresIn: '1h',
		});
		prisma.$queryRaw
			.mockResolvedValueOnce([
				{
					id: 15,
					username: 'admin',
					email: 'admin@example.com',
					hashed_password: 'hash',
					full_name: null,
					is_active: true,
					is_superuser: false,
					created_at: new Date(),
					updated_at: new Date(),
				},
			])
			.mockResolvedValueOnce([
				{
					id: 99,
					username: 'takenname',
					email: 'other@example.com',
					hashed_password: 'hash',
					full_name: null,
					is_active: true,
					is_superuser: false,
					created_at: new Date(),
					updated_at: new Date(),
				},
			]);

		await expect(
			service.updateMe({ username: 'takenname' }, `Bearer ${token}`),
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('rejects updateMe when authorization header is invalid', async () => {
		await expect(
			service.updateMe({ full_name: 'Name' }, 'not-a-bearer-token'),
		).rejects.toBeInstanceOf(UnauthorizedException);
	});
});
