import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [StatusController],
	providers: [StatusService],
})
export class StatusModule {}
