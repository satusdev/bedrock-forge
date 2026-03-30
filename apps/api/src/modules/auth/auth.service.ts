import {
	Injectable,
	UnauthorizedException,
	ConflictException,
	NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { AuthRepository } from './auth.repository';

export interface TokenPair {
	accessToken: string;
	refreshToken: string;
	user: { id: number; email: string; name: string; roles: string[] };
}

@Injectable()
export class AuthService {
	constructor(
		private readonly repo: AuthRepository,
		private readonly jwtService: JwtService,
		private readonly config: ConfigService,
	) {}

	async register(email: string, name: string, password: string) {
		const existing = await this.repo.findUserByEmail(email);
		if (existing) {
			throw new ConflictException('Email already registered');
		}

		const passwordHash = await bcrypt.hash(password, 12);
		const user = await this.repo.createUser(email, name, passwordHash);
		const roles = user.user_roles.map((ur: any) => ur.role.name);

		return this.issueTokens(Number(user.id), user.email, user.name, roles);
	}

	async login(email: string, password: string): Promise<TokenPair> {
		const user = await this.repo.findUserByEmail(email);
		if (!user) {
			throw new UnauthorizedException('Invalid credentials');
		}

		const valid = await bcrypt.compare(password, user.password_hash);
		if (!valid) {
			throw new UnauthorizedException('Invalid credentials');
		}

		const roles = user.user_roles.map((ur: any) => ur.role.name);
		return this.issueTokens(Number(user.id), user.email, user.name, roles);
	}

	async refresh(refreshToken: string): Promise<TokenPair> {
		const tokenHash = this.hashToken(refreshToken);
		const stored = await this.repo.findValidRefreshToken(tokenHash);

		if (!stored) {
			throw new UnauthorizedException('Invalid or expired refresh token');
		}

		// Rotate: revoke old, issue new
		await this.repo.revokeRefreshToken(stored.id);

		const user = await this.repo.findUserById(Number(stored.user_id));
		if (!user) {
			throw new NotFoundException('User not found');
		}

		const roles = user.user_roles.map((ur: any) => ur.role.name);
		return this.issueTokens(Number(user.id), user.email, user.name, roles);
	}

	async logout(refreshToken: string): Promise<void> {
		const tokenHash = this.hashToken(refreshToken);
		const stored = await this.repo.findValidRefreshToken(tokenHash);
		if (stored) {
			await this.repo.revokeRefreshToken(stored.id);
		}
	}

	async logoutAll(userId: number): Promise<void> {
		await this.repo.revokeAllUserRefreshTokens(BigInt(userId));
	}

	private async issueTokens(
		userId: number,
		email: string,
		name: string,
		roles: string[],
	): Promise<TokenPair> {
		const payload = { sub: userId, email, roles };

		const accessToken = this.jwtService.sign(payload, {
			secret: this.config.get<string>('jwt.secret'),
			expiresIn: this.config.get<string>('jwt.accessExpiresIn') as any,
		});

		const rawRefreshToken = crypto.randomBytes(64).toString('hex');
		const refreshTokenHash = this.hashToken(rawRefreshToken);

		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 7);

		await this.repo.storeRefreshToken(
			BigInt(userId),
			refreshTokenHash,
			expiresAt,
		);

		return {
			accessToken,
			refreshToken: rawRefreshToken,
			user: { id: userId, email, name, roles },
		};
	}

	private hashToken(token: string): string {
		return crypto.createHash('sha256').update(token).digest('hex');
	}
}
