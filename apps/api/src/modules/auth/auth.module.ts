import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepository } from './auth.repository';
import { JwtStrategy } from './jwt.strategy';

@Module({
	imports: [
		PassportModule.register({ defaultStrategy: 'jwt' }),
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.get<string>('jwt.secret'),
				signOptions: {
					expiresIn: config.get<string>('jwt.accessExpiresIn') as any,
				},
			}),
		}),
	],
	controllers: [AuthController],
	providers: [AuthService, AuthRepository, JwtStrategy],
	exports: [JwtModule, PassportModule],
})
export class AuthModule {}
