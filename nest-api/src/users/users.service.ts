import {
	BadRequestException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import {
	UserCreateDto,
	UserResetPasswordDto,
	UserUpdateDto,
} from './dto/user-create.dto';

type DbUserWithRoleRow = {
	id: number;
	email: string;
	username: string;
	full_name: string | null;
	is_active: boolean;
	is_superuser: boolean;
	avatar_url: string | null;
	created_at: Date;
	updated_at: Date;
	role_id: number | null;
	role_name: string | null;
	role_display_name: string | null;
	role_color: string | null;
};

type DbPermissionCode = { code: string };

type DbUserMinimal = {
	id: number;
	is_active: boolean;
	is_superuser: boolean;
};

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

	private normalizeUsers(rows: DbUserWithRoleRow[]): UserView[] {
		const map = new Map<number, UserView>();

		for (const row of rows) {
			let user = map.get(row.id);
			if (!user) {
				user = {
					id: row.id,
					email: row.email,
					username: row.username,
					full_name: row.full_name,
					is_active: row.is_active,
					is_superuser: row.is_superuser,
					avatar_url: row.avatar_url,
					created_at: row.created_at,
					updated_at: row.updated_at,
					roles: [],
				};
				map.set(row.id, user);
			}

			if (
				row.role_id !== null &&
				row.role_name &&
				row.role_display_name &&
				row.role_color
			) {
				user.roles.push({
					id: row.role_id,
					name: row.role_name,
					display_name: row.role_display_name,
					color: row.role_color,
				});
			}
		}

		return Array.from(map.values());
	}

	private async getUsersWithRoles(
		whereSql: string,
		value: string | number | null,
	) {
		if (whereSql === 'search') {
			const searchTerm = typeof value === 'string' ? `%${value}%` : null;
			return this.prisma.$queryRaw<DbUserWithRoleRow[]>`
				SELECT
					u.id,
					u.email,
					u.username,
					u.full_name,
					u.is_active,
					u.is_superuser,
					u.avatar_url,
					u.created_at,
					u.updated_at,
					r.id AS role_id,
					r.name AS role_name,
					r.display_name AS role_display_name,
					r.color AS role_color
				FROM users u
				LEFT JOIN user_roles ur ON ur.user_id = u.id
				LEFT JOIN roles r ON r.id = ur.role_id
				WHERE
					(${searchTerm}::text IS NULL)
					OR u.email ILIKE ${searchTerm}
					OR u.username ILIKE ${searchTerm}
					OR COALESCE(u.full_name, '') ILIKE ${searchTerm}
				ORDER BY u.id ASC, r.name ASC NULLS LAST
			`;
		}

		return this.prisma.$queryRaw<DbUserWithRoleRow[]>`
			SELECT
				u.id,
				u.email,
				u.username,
				u.full_name,
				u.is_active,
				u.is_superuser,
				u.avatar_url,
				u.created_at,
				u.updated_at,
				r.id AS role_id,
				r.name AS role_name,
				r.display_name AS role_display_name,
				r.color AS role_color
			FROM users u
			LEFT JOIN user_roles ur ON ur.user_id = u.id
			LEFT JOIN roles r ON r.id = ur.role_id
			WHERE u.id = ${Number(value)}
			ORDER BY u.id ASC, r.name ASC NULLS LAST
		`;
	}

	private async ensureUniqueEmail(email: string, ignoreUserId?: number) {
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM users
			WHERE email = ${email}
			LIMIT 1
		`;

		const existing = rows[0];
		if (existing && existing.id !== ignoreUserId) {
			throw new BadRequestException({ detail: 'Email already registered' });
		}
	}

	private async ensureUniqueUsername(username: string, ignoreUserId?: number) {
		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			SELECT id
			FROM users
			WHERE username = ${username}
			LIMIT 1
		`;

		const existing = rows[0];
		if (existing && existing.id !== ignoreUserId) {
			throw new BadRequestException({ detail: 'Username already taken' });
		}
	}

	private async setUserRoles(userId: number, roleIds: number[]) {
		await this.prisma.$executeRaw`
			DELETE FROM user_roles
			WHERE user_id = ${userId}
		`;

		const uniqueRoleIds = Array.from(
			new Set(roleIds.filter(roleId => Number.isInteger(roleId) && roleId > 0)),
		);

		for (const roleId of uniqueRoleIds) {
			const roleRows = await this.prisma.$queryRaw<{ id: number }[]>`
				SELECT id
				FROM roles
				WHERE id = ${roleId}
				LIMIT 1
			`;
			if (!roleRows[0]) {
				continue;
			}

			await this.prisma.$executeRaw`
				INSERT INTO user_roles (user_id, role_id)
				VALUES (${userId}, ${roleId})
			`;
		}
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

		const userRows = await this.prisma.$queryRaw<DbUserMinimal[]>`
			SELECT id, is_active, is_superuser
			FROM users
			WHERE id = ${userId}
			LIMIT 1
		`;
		const user = userRows[0];
		if (!user || !user.is_active) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		return user;
	}

	async listUsers(search?: string) {
		const rows = await this.getUsersWithRoles('search', search ?? null);
		return this.normalizeUsers(rows);
	}

	async getUser(userId: number) {
		const rows = await this.getUsersWithRoles('id', userId);
		const users = this.normalizeUsers(rows);
		const user = users[0];
		if (!user) {
			throw new NotFoundException({ detail: 'User not found' });
		}
		return user;
	}

	async createUser(payload: UserCreateDto) {
		await this.ensureUniqueEmail(payload.email);
		await this.ensureUniqueUsername(payload.username);

		const rows = await this.prisma.$queryRaw<{ id: number }[]>`
			INSERT INTO users (
				email,
				username,
				hashed_password,
				full_name,
				is_active,
				is_superuser,
				created_at,
				updated_at
			)
			VALUES (
				${payload.email},
				${payload.username},
				${bcrypt.hashSync(payload.password, 12)},
				${payload.full_name ?? null},
				${payload.is_active ?? true},
				${payload.is_superuser ?? false},
				NOW(),
				NOW()
			)
			RETURNING id
		`;

		const userId = rows[0]?.id;
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

		await this.prisma.$executeRaw`
			UPDATE users
			SET
				email = ${payload.email ?? current.email},
				username = ${payload.username ?? current.username},
				hashed_password = COALESCE(${passwordHash}, hashed_password),
				full_name = ${payload.full_name ?? current.full_name},
				is_active = ${payload.is_active ?? current.is_active},
				is_superuser = ${payload.is_superuser ?? current.is_superuser},
				updated_at = NOW()
			WHERE id = ${userId}
		`;

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
		await this.prisma.$executeRaw`
			DELETE FROM users
			WHERE id = ${userId}
		`;

		return { success: true };
	}

	async resetPassword(userId: number, payload: UserResetPasswordDto) {
		await this.getUser(userId);
		await this.prisma.$executeRaw`
			UPDATE users
			SET
				hashed_password = ${bcrypt.hashSync(payload.new_password, 12)},
				updated_at = NOW()
			WHERE id = ${userId}
		`;

		return { status: 'success', message: 'Password reset successfully' };
	}

	async getCurrentUserPermissions(authorizationHeader: string | undefined) {
		const currentUser =
			await this.getActiveUserFromAuthorization(authorizationHeader);

		const roleRows = await this.prisma.$queryRaw<
			{ id: number; name: string; display_name: string; color: string }[]
		>`
			SELECT r.id, r.name, r.display_name, r.color
			FROM roles r
			INNER JOIN user_roles ur ON ur.role_id = r.id
			WHERE ur.user_id = ${currentUser.id}
			ORDER BY r.name ASC
		`;

		const permissionRows = await this.prisma.$queryRaw<DbPermissionCode[]>`
			SELECT DISTINCT p.code
			FROM permissions p
			INNER JOIN role_permissions rp ON rp.permission_id = p.id
			INNER JOIN user_roles ur ON ur.role_id = rp.role_id
			WHERE ur.user_id = ${currentUser.id}
			ORDER BY p.code ASC
		`;

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
