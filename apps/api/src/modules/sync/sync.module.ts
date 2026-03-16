import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.SYNC })],
	controllers: [SyncController],
	providers: [SyncService],
})
export class SyncModule {}
