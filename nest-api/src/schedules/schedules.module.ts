import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
	imports: [PrismaModule, AuthModule],
	controllers: [SchedulesController],
	providers: [SchedulesService],
})
export class SchedulesModule {}
