import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { SyncProcessor } from './sync.processor';
import { RcloneService } from '../../services/rclone.service';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.SYNC })],
	providers: [SyncProcessor, RcloneService],
})
export class SyncProcessorModule {}
