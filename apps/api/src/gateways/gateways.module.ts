import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JobsGateway } from './jobs.gateway';

@Module({
	imports: [
		JwtModule.registerAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.get<string>('jwt.secret'),
			}),
		}),
	],
	providers: [JobsGateway],
	exports: [JobsGateway],
})
export class GatewaysModule {}
