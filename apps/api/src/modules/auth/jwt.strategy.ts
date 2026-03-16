import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthRepository } from './auth.repository';

interface JwtPayload {
	sub: number;
	email: string;
	roles: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
	constructor(
		private readonly config: ConfigService,
		private readonly repo: AuthRepository,
	) {
		super({
			jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
			ignoreExpiration: false,
			secretOrKey: config.get<string>('jwt.secret')!,
		});
	}

	async validate(payload: JwtPayload) {
		const user = await this.repo.findUserById(payload.sub);
		if (!user) {
			throw new UnauthorizedException('User not found');
		}
		return {
			id: Number(user.id),
			email: user.email,
			name: user.name,
			roles: user.user_roles.map(ur => ur.role.name),
		};
	}
}
