import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BackupsModule } from '../backups/backups.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SchedulesController } from './schedules.controller';
import { SchedulesRunnerService } from './schedules.runner.service';
import { SchedulesService } from './schedules.service';

@Module({
	imports: [PrismaModule, AuthModule, BackupsModule],
	controllers: [SchedulesController],
	providers: [SchedulesService, SchedulesRunnerService],
})
export class SchedulesModule {}
