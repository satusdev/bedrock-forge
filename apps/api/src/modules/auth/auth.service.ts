import {
	Injectable,
	UnauthorizedException,
	NotFoundException,
	BadRequestException,
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

	async login(
		email: string,
		password: string,
		userAgent?: string,
		ipAddress?: string,
	): Promise<TokenPair> {
		const user = await this.repo.findUserByEmail(email);
		if (!user) {
			throw new UnauthorizedException('Invalid credentials');
		}

		const valid = await bcrypt.compare(password, user.password_hash);
		if (!valid) {
			throw new UnauthorizedException('Invalid credentials');
		}

		const roles = user.user_roles.map((ur: any) => ur.role.name);
		return this.issueTokens(
			Number(user.id),
			user.email,
			user.name,
			roles,
			userAgent,
			ipAddress,
		);
	}

	async refresh(
		refreshToken: string,
		userAgent?: string,
		ipAddress?: string,
	): Promise<TokenPair> {
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
		return this.issueTokens(
			Number(user.id),
			user.email,
			user.name,
			roles,
			userAgent,
			ipAddress,
		);
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

	async getSessions(userId: number) {
		const sessions = await this.repo.findActiveSessionsByUserId(BigInt(userId));
		return sessions.map(s => ({
			id: Number(s.id),
			created_at: s.created_at,
			expires_at: s.expires_at,
			user_agent: s.user_agent,
			ip_address: s.ip_address,
		}));
	}

	async revokeSession(userId: number, sessionId: number): Promise<void> {
		const revoked = await this.repo.revokeSessionById(
			BigInt(sessionId),
			BigInt(userId),
		);
		if (!revoked) throw new NotFoundException(`Session ${sessionId} not found`);
	}

	async changePassword(
		userId: number,
		currentPassword: string,
		newPassword: string,
	): Promise<void> {
		if (currentPassword === newPassword) {
			throw new BadRequestException(
				'New password must differ from current password',
			);
		}
		const user = await this.repo.findUserById(userId);
		if (!user) throw new NotFoundException('User not found');

		const valid = await bcrypt.compare(currentPassword, user.password_hash);
		if (!valid) {
			throw new UnauthorizedException('Current password is incorrect');
		}

		const newHash = await bcrypt.hash(newPassword, 12);
		await this.repo.updatePassword(BigInt(userId), newHash);
		// Revoke all sessions so other devices must re-authenticate
		await this.repo.revokeAllUserRefreshTokens(BigInt(userId));
	}

	private refreshExpiresMs(): number {
		const raw = this.config.get<string>('jwt.refreshExpiresIn') ?? '7d';
		// Parse simple duration strings: Nd, Nh, Nm, Ns
		const match = /^(\d+)([dhms])$/.exec(raw);
		if (!match) return 7 * 24 * 60 * 60 * 1_000;
		const n = parseInt(match[1], 10);
		const multipliers: Record<string, number> = {
			d: 24 * 60 * 60 * 1_000,
			h: 60 * 60 * 1_000,
			m: 60 * 1_000,
			s: 1_000,
		};
		return n * multipliers[match[2]];
	}

	private async issueTokens(
		userId: number,
		email: string,
		name: string,
		roles: string[],
		userAgent?: string,
		ipAddress?: string,
	): Promise<TokenPair> {
		const payload = { sub: userId, email, roles };

		const accessToken = this.jwtService.sign(payload, {
			secret: this.config.get<string>('jwt.secret'),
			expiresIn: this.config.get<string>('jwt.accessExpiresIn') as any,
		});

		const rawRefreshToken = crypto.randomBytes(64).toString('hex');
		const refreshTokenHash = this.hashToken(rawRefreshToken);

		const expiresAt = new Date(Date.now() + this.refreshExpiresMs());

		await this.repo.storeRefreshToken(
			BigInt(userId),
			refreshTokenHash,
			expiresAt,
			userAgent,
			ipAddress,
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
