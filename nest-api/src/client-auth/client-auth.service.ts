import {
	BadRequestException,
	Injectable,
	UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { ClientLoginDto } from './dto/client-login.dto';

type DbClientUser = {
	id: number;
	client_id: number;
	email: string;
	password_hash: string;
	full_name: string | null;
	is_active: boolean;
	last_login_at: Date | null;
	role: string;
};

type DbClient = {
	id: number;
	name: string;
	company: string | null;
};

type ClientTokenPayload = JwtPayload & {
	sub?: string;
	type?: 'client';
	client_id?: number;
	role?: string;
};

@Injectable()
export class ClientAuthService {
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

	private async findClientUserByEmail(
		email: string,
	): Promise<DbClientUser | null> {
		const users = await this.prisma.$queryRaw<DbClientUser[]>`
			SELECT id, client_id, email, password_hash, full_name, is_active, last_login_at, role
			FROM client_users
			WHERE email = ${email}
			LIMIT 1
		`;
		return users[0] ?? null;
	}

	private async findClientById(clientId: number): Promise<DbClient | null> {
		const clients = await this.prisma.$queryRaw<DbClient[]>`
			SELECT id, name, company
			FROM clients
			WHERE id = ${clientId}
			LIMIT 1
		`;
		return clients[0] ?? null;
	}

	private createClientAccessToken(data: {
		sub: string;
		client_id: number;
		role: string;
	}): string {
		return jwt.sign(
			{
				...data,
				type: 'client',
			},
			this.secretKey,
			{
				algorithm: 'HS256',
				expiresIn: '24h',
			},
		);
	}

	private verifyClientToken(token: string): ClientTokenPayload | null {
		try {
			const payload = jwt.verify(token, this.secretKey, {
				algorithms: ['HS256'],
			}) as ClientTokenPayload;
			if (payload.type !== 'client') {
				return null;
			}
			return payload;
		} catch {
			return null;
		}
	}

	private async getCurrentClientUser(token: string): Promise<DbClientUser> {
		const payload = this.verifyClientToken(token);
		if (!payload?.sub) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		const user = await this.findClientUserByEmail(payload.sub);
		if (!user || !user.is_active) {
			throw new UnauthorizedException({
				detail: 'Could not validate credentials',
			});
		}

		return user;
	}

	async login(payload: ClientLoginDto) {
		const user = await this.findClientUserByEmail(payload.email);

		if (!user || !user.is_active) {
			throw new UnauthorizedException({ detail: 'Invalid email or password' });
		}

		if (!bcrypt.compareSync(payload.password, user.password_hash)) {
			throw new UnauthorizedException({ detail: 'Invalid email or password' });
		}

		const client = await this.findClientById(user.client_id);
		if (!client) {
			throw new BadRequestException({ detail: 'Client account not found' });
		}

		await this.prisma.$executeRaw`
			UPDATE client_users
			SET last_login_at = NOW(), updated_at = NOW()
			WHERE id = ${user.id}
		`;

		const accessToken = this.createClientAccessToken({
			sub: user.email,
			client_id: client.id,
			role: user.role,
		});

		return {
			access_token: accessToken,
			token_type: 'bearer',
			client_id: client.id,
			client_name: client.name,
			role: user.role,
		};
	}

	async me(token: string) {
		const user = await this.getCurrentClientUser(token);
		const client = await this.findClientById(user.client_id);

		return {
			id: user.id,
			email: user.email,
			full_name: user.full_name,
			client_id: user.client_id,
			client_name: client?.name ?? 'Unknown',
			company: client?.company ?? null,
			role: user.role,
		};
	}

	async refresh(token: string) {
		const user = await this.getCurrentClientUser(token);
		const client = await this.findClientById(user.client_id);
		if (!client) {
			throw new BadRequestException({ detail: 'Client account not found' });
		}

		const accessToken = this.createClientAccessToken({
			sub: user.email,
			client_id: client.id,
			role: user.role,
		});

		return {
			access_token: accessToken,
			token_type: 'bearer',
			client_id: client.id,
			client_name: client.name,
			role: user.role,
		};
	}
}
