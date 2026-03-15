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
		const user = await this.prisma.client_users.findUnique({
			where: { email },
			select: {
				id: true,
				client_id: true,
				email: true,
				password_hash: true,
				full_name: true,
				is_active: true,
				last_login_at: true,
				role: true,
			},
		});
		if (!user) {
			return null;
		}
		return {
			...user,
			role: user.role,
		};
	}

	private async findClientById(clientId: number): Promise<DbClient | null> {
		const client = await this.prisma.clients.findUnique({
			where: { id: clientId },
			select: {
				id: true,
				name: true,
				company: true,
			},
		});
		return client ?? null;
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

		await this.prisma.client_users.update({
			where: { id: user.id },
			data: {
				last_login_at: new Date(),
				updated_at: new Date(),
			},
		});

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
