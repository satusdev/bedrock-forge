import { Module } from '@nestjs/common';
import { CleanupSchedulesController } from './cleanup-schedules.controller';
import { CleanupSchedulesService } from './cleanup-schedules.service';
import { CleanupSchedulesRepository } from './cleanup-schedules.repository';

@Module({
	controllers: [CleanupSchedulesController],
	providers: [CleanupSchedulesService, CleanupSchedulesRepository],
	exports: [CleanupSchedulesService, CleanupSchedulesRepository],
})
export class CleanupSchedulesModule {}
