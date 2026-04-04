import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';

const mockUser = {
	id: BigInt(1),
	email: 'test@forge.local',
	name: 'Test User',
	password_hash: '$2a$12$placeholder',
	user_roles: [{ role: { name: 'admin' } }],
};

const makeRepo = () => ({
	findUserByEmail: jest.fn(),
	findUserById: jest.fn(),
	createUser: jest.fn(),
	storeRefreshToken: jest.fn(),
	findValidRefreshToken: jest.fn(),
	revokeRefreshToken: jest.fn(),
	revokeAllUserRefreshTokens: jest.fn(),
	updatePassword: jest.fn(),
});

const makeJwt = () => ({ sign: jest.fn().mockReturnValue('signed-access-token') });

const makeConfig = () => ({
	get: jest.fn().mockImplementation((key: string) => {
		if (key === 'jwt.secret') return 'test-secret';
		if (key === 'jwt.accessExpiresIn') return '15m';
		return undefined;
	}),
});

describe('AuthService', () => {
	let service: AuthService;
	let repo: ReturnType<typeof makeRepo>;

	beforeEach(async () => {
		repo = makeRepo();
		const module = await Test.createTestingModule({
			providers: [
				AuthService,
				{ provide: AuthRepository, useValue: repo },
				{ provide: JwtService, useValue: makeJwt() },
				{ provide: ConfigService, useValue: makeConfig() },
			],
		}).compile();

		service = module.get(AuthService);
	});

	describe('login', () => {
		it('throws UnauthorizedException for unknown email', async () => {
			repo.findUserByEmail.mockResolvedValue(null);
			await expect(service.login('nobody@x.com', 'pass')).rejects.toThrow(
				UnauthorizedException,
			);
		});

		it('throws UnauthorizedException for wrong password', async () => {
			repo.findUserByEmail.mockResolvedValue({
				...mockUser,
				password_hash: await bcrypt.hash('correct', 12),
			});
			await expect(service.login('test@forge.local', 'wrong')).rejects.toThrow(
				UnauthorizedException,
			);
		});

		it('returns token pair on valid credentials', async () => {
			const hash = await bcrypt.hash('secret', 12);
			repo.findUserByEmail.mockResolvedValue({ ...mockUser, password_hash: hash });
			repo.storeRefreshToken.mockResolvedValue(undefined);

			const result = await service.login('test@forge.local', 'secret');
			expect(result.accessToken).toBe('signed-access-token');
			expect(result.refreshToken).toBeDefined();
			expect(result.user.email).toBe('test@forge.local');
		});
	});

	describe('register', () => {
		it('throws ConflictException if email already exists', async () => {
			repo.findUserByEmail.mockResolvedValue(mockUser);
			await expect(
				service.register('test@forge.local', 'Name', 'pass'),
			).rejects.toThrow(ConflictException);
		});

		it('creates user and returns tokens on fresh email', async () => {
			repo.findUserByEmail.mockResolvedValue(null);
			repo.createUser.mockResolvedValue({ ...mockUser });
			repo.storeRefreshToken.mockResolvedValue(undefined);

			const result = await service.register('new@forge.local', 'New', 'pw');
			expect(repo.createUser).toHaveBeenCalledWith(
				'new@forge.local',
				'New',
				expect.any(String),
			);
			expect(result.user.roles).toContain('admin');
		});
	});

	describe('refresh', () => {
		it('throws UnauthorizedException for invalid token', async () => {
			repo.findValidRefreshToken.mockResolvedValue(null);
			await expect(service.refresh('bad-token')).rejects.toThrow(
				UnauthorizedException,
			);
		});

		it('rotates token on valid refresh', async () => {
			const storedToken = { id: BigInt(5), user_id: BigInt(1) };
			repo.findValidRefreshToken.mockResolvedValue(storedToken);
			repo.revokeRefreshToken.mockResolvedValue(undefined);
			repo.findUserById.mockResolvedValue(mockUser);
			repo.storeRefreshToken.mockResolvedValue(undefined);

			const result = await service.refresh('valid-refresh-token');
			expect(repo.revokeRefreshToken).toHaveBeenCalledWith(storedToken.id);
			expect(result.accessToken).toBe('signed-access-token');
		});
	});

	describe('logout', () => {
		it('revokes token if found', async () => {
			const storedToken = { id: BigInt(3), user_id: BigInt(1) };
			repo.findValidRefreshToken.mockResolvedValue(storedToken);
			repo.revokeRefreshToken.mockResolvedValue(undefined);

			await service.logout('some-token');
			expect(repo.revokeRefreshToken).toHaveBeenCalledWith(storedToken.id);
		});

		it('does nothing if token not found', async () => {
			repo.findValidRefreshToken.mockResolvedValue(null);
			await expect(service.logout('ghost-token')).resolves.toBeUndefined();
			expect(repo.revokeRefreshToken).not.toHaveBeenCalled();
		});
	});

	describe('changePassword', () => {
		const userId = 1;

		it('throws BadRequestException when new password equals current', async () => {
			const { BadRequestException } = await import('@nestjs/common');
			await expect(
				service.changePassword(userId, 'samepass', 'samepass'),
			).rejects.toThrow(BadRequestException);
		});

		it('throws NotFoundException if user does not exist', async () => {
			const { NotFoundException } = await import('@nestjs/common');
			repo.findUserById.mockResolvedValue(null);
			await expect(
				service.changePassword(userId, 'oldpass', 'newpass123'),
			).rejects.toThrow(NotFoundException);
		});

		it('throws UnauthorizedException for wrong current password', async () => {
			const hash = await bcrypt.hash('correctpass', 12);
			repo.findUserById.mockResolvedValue({ ...mockUser, password_hash: hash });
			await expect(
				service.changePassword(userId, 'wrongpass', 'newpass123'),
			).rejects.toThrow(UnauthorizedException);
		});

		it('updates password and revokes all sessions on success', async () => {
			const hash = await bcrypt.hash('currentpass', 12);
			repo.findUserById.mockResolvedValue({ ...mockUser, password_hash: hash });
			repo.updatePassword.mockResolvedValue(undefined);
			repo.revokeAllUserRefreshTokens.mockResolvedValue(undefined);

			await service.changePassword(userId, 'currentpass', 'newpass123');

			expect(repo.updatePassword).toHaveBeenCalledWith(
				BigInt(userId),
				expect.any(String),
			);
			expect(repo.revokeAllUserRefreshTokens).toHaveBeenCalledWith(
				BigInt(userId),
			);
		});
	});
});
