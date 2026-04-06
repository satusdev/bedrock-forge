import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SyncRepository } from './sync.repository';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.SYNC })],
	controllers: [SyncController],
	providers: [SyncService, SyncRepository],
})
export class SyncModule {}
