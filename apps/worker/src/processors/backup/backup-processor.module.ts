import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { BackupProcessor } from './backup.processor';

@Module({
	imports: [BullModule.registerQueue({ name: QUEUES.BACKUPS })],
	providers: [BackupProcessor],
})
export class BackupProcessorModule {}
