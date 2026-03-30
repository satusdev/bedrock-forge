import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findUserByEmail(email: string) {
		return this.prisma.user.findUnique({
			where: { email },
			include: {
				user_roles: { include: { role: true } },
			},
		});
	}

	async findUserById(id: number) {
		return this.prisma.user.findUnique({
			where: { id: BigInt(id) },
			include: {
				user_roles: { include: { role: true } },
			},
		});
	}

	async createUser(email: string, name: string, passwordHash: string) {
		// Find or create the 'client' role as default
		const defaultRole = await this.prisma.role.upsert({
			where: { name: 'client' },
			update: {},
			create: { name: 'client' },
		});

		return this.prisma.user.create({
			data: {
				email,
				name,
				password_hash: passwordHash,
				user_roles: {
					create: { role_id: defaultRole.id },
				},
			},
			include: {
				user_roles: { include: { role: true } },
			},
		});
	}

	async storeRefreshToken(userId: bigint, tokenHash: string, expiresAt: Date) {
		return this.prisma.refreshToken.create({
			data: {
				user_id: userId,
				token_hash: tokenHash,
				expires_at: expiresAt,
			},
		});
	}

	async findValidRefreshToken(tokenHash: string) {
		return this.prisma.refreshToken.findFirst({
			where: {
				token_hash: tokenHash,
				revoked_at: null,
				expires_at: { gt: new Date() },
			},
		});
	}

	async revokeRefreshToken(id: bigint) {
		return this.prisma.refreshToken.update({
			where: { id },
			data: { revoked_at: new Date() },
		});
	}

	async revokeAllUserRefreshTokens(userId: bigint) {
		return this.prisma.refreshToken.updateMany({
			where: { user_id: userId, revoked_at: null },
			data: { revoked_at: new Date() },
		});
	}

	async ensureDefaultRolesExist() {
		const roles = ['admin', 'manager', 'client'];
		for (const name of roles) {
			await this.prisma.role.upsert({
				where: { name },
				update: {},
				create: { name },
			});
		}
	}
}
