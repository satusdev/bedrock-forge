import {
	BadRequestException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import {
	UserCreateDto,
	UserResetPasswordDto,
	UserUpdateDto,
} from './dto/user-create.dto';

type DbUserMinimal = {
	id: number;
	is_active: boolean;
	is_superuser: boolean;
};

type UserWithRolesEntity = Prisma.usersGetPayload<{
	include: {
		user_roles: {
			include: {
				roles: true;
			};
		};
	};
}>;

type TokenPayload = JwtPayload & {
	sub?: string;
	type?: 'access' | 'refresh';
};

type UserView = {
	id: number;
	email: string;
	username: string;
	full_name: string | null;
	is_active: boolean;
	is_superuser: boolean;
	avatar_url: string | null;
	created_at: Date;
	updated_at: Date;
	roles: Array<{
		id: number;
		name: string;
		display_name: string;
		color: string;
	}>;
};

@Injectable()
export class UsersService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly configService: ConfigService,
	) {}

	private get secretKey(): string {
		return (
			this.configService.get<string>('SECRET_KEY') ??
			this.configService.get<string>('JWT_SECRET') ??
			'dev-secret-key-not-for-production'
		);
	}

	private get jwtAlgorithm(): jwt.Algorithm {
		const configuredAlgorithm =
			this.configService.get<string>('JWT_ALGORITHM') ?? 'HS256';
		return configuredAlgorithm as jwt.Algorithm;
	}

	private normalizeUser(user: UserWithRolesEntity): UserView {
		return {
			id: user.id,
			email: user.email,
			username: user.username,
			full_name: user.full_name,
			is_active: user.is_active,
			is_superuser: user.is_superuser,
			avatar_url: user.avatar_url,
			created_at: user.created_at,
			updated_at: user.updated_at,
			roles: user.user_roles
				.map(userRole => ({
					id: userRole.roles.id,
					name: userRole.roles.name,
					display_name: userRole.roles.display_name,
					color: userRole.roles.color,
				}))
				.sort((left, right) => left.name.localeCompare(right.name)),
		};
	}

	private async ensureUniqueEmail(email: string, ignoreUserId?: number) {
		const existing = await this.prisma.users.findUnique({
			where: { email },
			select: { id: true },
		});
		if (existing && existing.id !== ignoreUserId) {
			throw new BadRequestException({ detail: 'Email already registered' });
		}
	}

	private async ensureUniqueUsername(username: string, ignoreUserId?: number) {
		const existing = await this.prisma.users.findUnique({
			where: { username },
			select: { id: true },
		});
		if (existing && existing.id !== ignoreUserId) {
			throw new BadRequestException({ detail: 'Username already taken' });
		}
	}

	private async setUserRoles(userId: number, roleIds: number[]) {
		const uniqueRoleIds = Array.from(
			new Set(roleIds.filter(roleId => Number.isInteger(roleId) && roleId > 0)),
		);

		await this.prisma.$transaction(async tx => {
			await tx.user_roles.deleteMany({ where: { user_id: userId } });

			if (uniqueRoleIds.length === 0) {
				return;
			}

			const existingRoles = await tx.roles.findMany({
				where: {
					id: {
						in: uniqueRoleIds,
					},
				},
				select: { id: true },
			});

			if (existingRoles.length === 0) {
				return;
			}

			await tx.user_roles.createMany({
				data: existingRoles.map(role => ({
					user_id: userId,
					role_id: role.id,
				})),
				skipDuplicates: true,
			});
		});
	}

	private verifyAccessToken(
		authorizationHeader: string | undefined,
	): TokenPayload {
		if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		const token = authorizationHeader.replace('Bearer ', '');
		try {
			return jwt.verify(token, this.secretKey, {
				algorithms: [this.jwtAlgorithm],
			}) as TokenPayload;
		} catch {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}
	}

	private async getActiveUserFromAuthorization(
		authorizationHeader: string | undefined,
	): Promise<DbUserMinimal> {
		const decoded = this.verifyAccessToken(authorizationHeader);
		if (!decoded.sub) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		const userId = Number.parseInt(decoded.sub, 10);
		if (Number.isNaN(userId)) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		const user = await this.prisma.users.findUnique({
			where: { id: userId },
			select: { id: true, is_active: true, is_superuser: true },
		});
		if (!user || !user.is_active) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		return user;
	}

	async listUsers(search?: string) {
		const trimmedSearch = search?.trim();
		const users = await this.prisma.users.findMany({
			where: trimmedSearch
				? {
						OR: [
							{ email: { contains: trimmedSearch, mode: 'insensitive' } },
							{ username: { contains: trimmedSearch, mode: 'insensitive' } },
							{ full_name: { contains: trimmedSearch, mode: 'insensitive' } },
						],
					}
				: undefined,
			include: {
				user_roles: {
					include: {
						roles: true,
					},
				},
			},
			orderBy: { id: 'asc' },
		});

		return users.map(user => this.normalizeUser(user));
	}

	async getUser(userId: number) {
		const user = await this.prisma.users.findUnique({
			where: { id: userId },
			include: {
				user_roles: {
					include: {
						roles: true,
					},
				},
			},
		});
		if (!user) {
			throw new NotFoundException({ detail: 'User not found' });
		}
		return this.normalizeUser(user);
	}

	async createUser(payload: UserCreateDto) {
		await this.ensureUniqueEmail(payload.email);
		await this.ensureUniqueUsername(payload.username);

		const created = await this.prisma.users.create({
			data: {
				email: payload.email,
				username: payload.username,
				hashed_password: bcrypt.hashSync(payload.password, 12),
				full_name: payload.full_name ?? null,
				is_active: payload.is_active ?? true,
				is_superuser: payload.is_superuser ?? false,
				created_at: new Date(),
				updated_at: new Date(),
			},
			select: { id: true },
		});

		const userId = created.id;
		if (!userId) {
			throw new NotFoundException({ detail: 'Failed to create user' });
		}

		if (payload.role_ids) {
			await this.setUserRoles(userId, payload.role_ids);
		}

		return this.getUser(userId);
	}

	async updateUser(userId: number, payload: UserUpdateDto) {
		const current = await this.getUser(userId);

		if (payload.email && payload.email !== current.email) {
			await this.ensureUniqueEmail(payload.email, userId);
		}

		if (payload.username && payload.username !== current.username) {
			await this.ensureUniqueUsername(payload.username, userId);
		}

		const passwordValue = payload.password?.trim();
		const passwordHash = passwordValue
			? bcrypt.hashSync(passwordValue, 12)
			: null;

		await this.prisma.users.update({
			where: { id: userId },
			data: {
				email: payload.email ?? current.email,
				username: payload.username ?? current.username,
				hashed_password: passwordHash ?? undefined,
				full_name: payload.full_name ?? current.full_name,
				is_active: payload.is_active ?? current.is_active,
				is_superuser: payload.is_superuser ?? current.is_superuser,
				updated_at: new Date(),
			},
		});

		if (payload.role_ids) {
			await this.setUserRoles(userId, payload.role_ids);
		}

		return this.getUser(userId);
	}

	async deleteUser(userId: number, authorizationHeader?: string) {
		const currentUser = authorizationHeader
			? await this.getActiveUserFromAuthorization(authorizationHeader)
			: null;
		if (currentUser && currentUser.id === userId) {
			throw new BadRequestException({ detail: 'Cannot delete yourself' });
		}

		await this.getUser(userId);
		await this.prisma.users.delete({ where: { id: userId } });

		return { success: true };
	}

	async resetPassword(userId: number, payload: UserResetPasswordDto) {
		await this.getUser(userId);
		await this.prisma.users.update({
			where: { id: userId },
			data: {
				hashed_password: bcrypt.hashSync(payload.new_password, 12),
				updated_at: new Date(),
			},
		});

		return { status: 'success', message: 'Password reset successfully' };
	}

	async getCurrentUserPermissions(authorizationHeader: string | undefined) {
		const currentUser =
			await this.getActiveUserFromAuthorization(authorizationHeader);

		const [roleRows, permissionRows] = await Promise.all([
			this.prisma.roles.findMany({
				where: {
					user_roles: {
						some: {
							user_id: currentUser.id,
						},
					},
				},
				orderBy: { name: 'asc' },
				select: {
					id: true,
					name: true,
					display_name: true,
					color: true,
				},
			}),
			this.prisma.permissions.findMany({
				where: {
					role_permissions: {
						some: {
							roles: {
								user_roles: {
									some: {
										user_id: currentUser.id,
									},
								},
							},
						},
					},
				},
				select: { code: true },
				distinct: ['code'],
				orderBy: { code: 'asc' },
			}),
		]);

		const permissions = permissionRows.map(row => row.code);
		if (currentUser.is_superuser && !permissions.includes('*')) {
			permissions.unshift('*');
		}

		return {
			user_id: currentUser.id,
			is_superuser: currentUser.is_superuser,
			roles: roleRows,
			permissions,
		};
	}
}
