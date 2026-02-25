import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SslController } from './ssl.controller';
import { SslService } from './ssl.service';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [SslController],
	providers: [SslService],
})
export class SslModule {}
