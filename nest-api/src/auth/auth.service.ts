import {
	BadRequestException,
	ForbiddenException,
	HttpException,
	Injectable,
	NotFoundException,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from 'jsonwebtoken';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { UserUpdateDto } from './dto/user-update.dto';
import { PasswordChangeDto } from './dto/password-change.dto';
import { AuthenticatedUser } from './authenticated-user';

type DbUser = {
	id: number;
	email: string;
	username: string;
	hashed_password: string;
	full_name: string | null;
	is_active: boolean;
	is_superuser: boolean;
	created_at: Date;
	updated_at: Date;
};

type TokenPayload = JwtPayload & {
	sub?: string;
	type?: 'access' | 'refresh';
};

@Injectable()
export class AuthService {
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

	private get accessTokenMinutes(): number {
		return Number.parseInt(
			this.configService.get<string>('ACCESS_TOKEN_EXPIRE_MINUTES') ?? '43200',
			10,
		);
	}

	private get refreshTokenDays(): number {
		return Number.parseInt(
			this.configService.get<string>('REFRESH_TOKEN_EXPIRE_DAYS') ?? '7',
			10,
		);
	}

	private async findUserByLogin(login: string): Promise<DbUser | null> {
		const users = await this.prisma.$queryRaw<DbUser[]>`
			SELECT id, email, username, hashed_password, full_name, is_active, is_superuser, created_at, updated_at
			FROM users
			WHERE email = ${login} OR username = ${login}
			LIMIT 1
		`;
		return users[0] ?? null;
	}

	private async findUserById(userId: number): Promise<DbUser | null> {
		const users = await this.prisma.$queryRaw<DbUser[]>`
			SELECT id, email, username, hashed_password, full_name, is_active, is_superuser, created_at, updated_at
			FROM users
			WHERE id = ${userId}
			LIMIT 1
		`;
		return users[0] ?? null;
	}

	private async findUserByEmail(email: string): Promise<DbUser | null> {
		const users = await this.prisma.$queryRaw<DbUser[]>`
			SELECT id, email, username, hashed_password, full_name, is_active, is_superuser, created_at, updated_at
			FROM users
			WHERE email = ${email}
			LIMIT 1
		`;
		return users[0] ?? null;
	}

	private async findUserByUsername(username: string): Promise<DbUser | null> {
		const users = await this.prisma.$queryRaw<DbUser[]>`
			SELECT id, email, username, hashed_password, full_name, is_active, is_superuser, created_at, updated_at
			FROM users
			WHERE username = ${username}
			LIMIT 1
		`;
		return users[0] ?? null;
	}

	private createAccessToken(subject: number): string {
		return jwt.sign({ sub: String(subject), type: 'access' }, this.secretKey, {
			algorithm: this.jwtAlgorithm,
			expiresIn: `${this.accessTokenMinutes}m`,
		});
	}

	private createRefreshToken(subject: number): string {
		return jwt.sign({ sub: String(subject), type: 'refresh' }, this.secretKey, {
			algorithm: this.jwtAlgorithm,
			expiresIn: `${this.refreshTokenDays}d`,
		});
	}

	private verifyToken(
		token: string,
		expectedType: 'access' | 'refresh',
	): TokenPayload | null {
		try {
			const decoded = jwt.verify(token, this.secretKey, {
				algorithms: [this.jwtAlgorithm],
			}) as TokenPayload;
			if (decoded.type !== expectedType) {
				return null;
			}
			return decoded;
		} catch {
			return null;
		}
	}

	private toUserResponse(user: DbUser) {
		return {
			id: user.id,
			email: user.email,
			username: user.username,
			full_name: user.full_name,
			is_active: user.is_active,
			is_superuser: user.is_superuser,
			created_at: user.created_at,
			updated_at: user.updated_at,
		};
	}

	private toAuthenticatedUser(user: DbUser): AuthenticatedUser {
		return {
			id: user.id,
			email: user.email,
			username: user.username,
			full_name: user.full_name,
			is_active: user.is_active,
			is_superuser: user.is_superuser,
		};
	}

	private validateRegisterPayload(payload: RegisterDto): void {
		if (!/^[a-zA-Z0-9]+$/.test(payload.username)) {
			throw new BadRequestException({
				detail: 'Username must be alphanumeric',
			});
		}

		if (!/[0-9]/.test(payload.password)) {
			throw new BadRequestException({
				detail: 'Password must contain at least one digit',
			});
		}

		if (!/[A-Z]/.test(payload.password)) {
			throw new BadRequestException({
				detail: 'Password must contain at least one uppercase letter',
			});
		}
	}

	private async getCurrentUserFromAuthorization(
		authorizationHeader: string | undefined,
	): Promise<DbUser> {
		if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		const token = authorizationHeader.replace('Bearer ', '');
		const decoded = this.verifyToken(token, 'access');
		if (!decoded?.sub) {
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

		const user = await this.findUserById(userId);
		if (!user) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		return user;
	}

	private async getCurrentActiveUserFromAuthorization(
		authorizationHeader: string | undefined,
	): Promise<DbUser> {
		const user =
			await this.getCurrentUserFromAuthorization(authorizationHeader);
		if (!user.is_active) {
			throw new HttpException({ detail: 'Inactive user' }, 403);
		}
		return user;
	}

	async resolveRequiredUserFromAuthorizationHeader(
		authorizationHeader: string | undefined,
	): Promise<AuthenticatedUser> {
		const user =
			await this.getCurrentActiveUserFromAuthorization(authorizationHeader);
		return this.toAuthenticatedUser(user);
	}

	async resolveOptionalUserIdFromAuthorizationHeader(
		authorizationHeader: string | undefined,
	): Promise<number | undefined> {
		if (!authorizationHeader) {
			return undefined;
		}
		const user =
			await this.getCurrentActiveUserFromAuthorization(authorizationHeader);
		return user.id;
	}

	async login(payload: LoginDto) {
		const user = await this.findUserByLogin(payload.username);
		if (!user || !bcrypt.compareSync(payload.password, user.hashed_password)) {
			throw new UnauthorizedException({
				detail: 'Incorrect email/username or password',
			});
		}

		if (!user.is_active) {
			throw new ForbiddenException({
				detail: 'User account is disabled',
			});
		}

		return {
			access_token: this.createAccessToken(user.id),
			refresh_token: this.createRefreshToken(user.id),
			token_type: 'bearer',
		};
	}

	async register(payload: RegisterDto) {
		this.validateRegisterPayload(payload);

		const existingEmail = await this.findUserByEmail(payload.email);
		if (existingEmail) {
			throw new BadRequestException({ detail: 'Email already registered' });
		}

		const existingUsername = await this.findUserByUsername(payload.username);
		if (existingUsername) {
			throw new BadRequestException({ detail: 'Username already taken' });
		}

		await this.prisma.$executeRaw`
			INSERT INTO users (email, username, hashed_password, full_name, is_active, is_superuser)
			VALUES (
				${payload.email},
				${payload.username},
				${bcrypt.hashSync(payload.password, 12)},
				${payload.full_name ?? null},
				${true},
				${false}
			)
		`;

		const createdUser = await this.findUserByEmail(payload.email);
		if (!createdUser) {
			throw new NotFoundException({ detail: 'Failed to create user' });
		}

		return this.toUserResponse(createdUser);
	}

	async refresh(payload: RefreshTokenDto) {
		const decoded = this.verifyToken(payload.refresh_token, 'refresh');
		if (!decoded?.sub) {
			throw new UnauthorizedException({ detail: 'Invalid refresh token' });
		}

		const userId = Number.parseInt(decoded.sub, 10);
		if (Number.isNaN(userId)) {
			throw new UnauthorizedException({ detail: 'Invalid refresh token' });
		}

		const user = await this.findUserById(userId);
		if (!user || !user.is_active) {
			throw new UnauthorizedException({ detail: 'User not found or inactive' });
		}

		return {
			access_token: this.createAccessToken(user.id),
			refresh_token: this.createRefreshToken(user.id),
			token_type: 'bearer',
		};
	}

	async me(currentUser: AuthenticatedUser | string | undefined) {
		if (typeof currentUser === 'string' || currentUser === undefined) {
			const resolved =
				await this.getCurrentActiveUserFromAuthorization(currentUser);
			return this.toUserResponse(resolved);
		}

		const resolved = await this.findUserById(currentUser.id);
		if (!resolved || !resolved.is_active) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}
		return this.toUserResponse(resolved);
	}

	async updateMe(
		payload: UserUpdateDto,
		currentUser: AuthenticatedUser | string | undefined,
	) {
		const resolvedUser =
			typeof currentUser === 'string' || currentUser === undefined
				? await this.getCurrentActiveUserFromAuthorization(currentUser)
				: await this.findUserById(currentUser.id);

		if (!resolvedUser || !resolvedUser.is_active) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		if (payload.email && payload.email !== resolvedUser.email) {
			const existingEmail = await this.findUserByEmail(payload.email);
			if (existingEmail) {
				throw new BadRequestException({ detail: 'Email already registered' });
			}
		}

		if (payload.username && payload.username !== resolvedUser.username) {
			const existingUsername = await this.findUserByUsername(payload.username);
			if (existingUsername) {
				throw new BadRequestException({ detail: 'Username already taken' });
			}
		}

		const nextEmail = payload.email ?? resolvedUser.email;
		const nextUsername = payload.username ?? resolvedUser.username;
		const nextFullName =
			payload.full_name !== undefined
				? payload.full_name
				: resolvedUser.full_name;

		await this.prisma.$executeRaw`
			UPDATE users
			SET email = ${nextEmail},
				username = ${nextUsername},
				full_name = ${nextFullName},
				updated_at = NOW()
			WHERE id = ${resolvedUser.id}
		`;

		const updatedUser = await this.findUserById(resolvedUser.id);
		if (!updatedUser) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		return this.toUserResponse(updatedUser);
	}

	async changePassword(
		payload: PasswordChangeDto,
		currentUser: AuthenticatedUser | string | undefined,
	) {
		const resolvedUser =
			typeof currentUser === 'string' || currentUser === undefined
				? await this.getCurrentActiveUserFromAuthorization(currentUser)
				: await this.findUserById(currentUser.id);

		if (!resolvedUser || !resolvedUser.is_active) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		if (
			!bcrypt.compareSync(
				payload.current_password,
				resolvedUser.hashed_password,
			)
		) {
			throw new BadRequestException({ detail: 'Incorrect current password' });
		}

		await this.prisma.$executeRaw`
			UPDATE users
			SET hashed_password = ${bcrypt.hashSync(payload.new_password, 12)},
				updated_at = NOW()
			WHERE id = ${resolvedUser.id}
		`;

		return { message: 'Password changed successfully' };
	}
}
