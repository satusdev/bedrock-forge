import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MonitorsController } from './monitors.controller';
import { MonitorsService } from './monitors.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [MonitorsController],
	providers: [MonitorsService],
})
export class MonitorsModule {}
