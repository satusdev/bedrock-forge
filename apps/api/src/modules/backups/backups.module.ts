import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { BackupsRepository } from './backups.repository';
import { BackupSchedulesController } from './backup-schedules.controller';
import { BackupSchedulesService } from './backup-schedules.service';
import { BackupSchedulesRepository } from './backup-schedules.repository';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.BACKUPS })],
	controllers: [BackupsController, BackupSchedulesController],
	providers: [
		BackupsService,
		BackupsRepository,
		BackupSchedulesService,
		BackupSchedulesRepository,
	],
	exports: [BackupsService],
})
export class BackupsModule {}
