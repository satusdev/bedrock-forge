import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@bedrock-forge/shared';
import { ReportProcessor } from './report.processor';
import { EncryptionModule } from '../../encryption/encryption.module';

@Module({
	imports: [
		BullModule.registerQueue({ name: QUEUES.REPORTS }),
		EncryptionModule,
	],
	providers: [ReportProcessor],
})
export class ReportProcessorModule {}
