import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.BACKUPS })],
	controllers: [BackupsController],
	providers: [BackupsService],
	exports: [BackupsService],
})
export class BackupsModule {}
