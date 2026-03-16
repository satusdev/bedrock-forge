import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { SyncProcessor } from './sync.processor';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.SYNC })],
	providers: [SyncProcessor],
})
export class SyncProcessorModule {}
