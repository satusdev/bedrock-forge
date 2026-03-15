import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SslController } from './ssl.controller';
import { SslRunnerService } from './ssl.runner.service';
import { SslService } from './ssl.service';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [SslController],
	providers: [SslService, SslRunnerService],
})
export class SslModule {}
