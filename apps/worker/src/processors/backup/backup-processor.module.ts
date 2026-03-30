import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { BackupProcessor } from './backup.processor';
import { RcloneService } from '../../services/rclone.service';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.BACKUPS })],
	providers: [BackupProcessor, RcloneService],
})
export class BackupProcessorModule {}
